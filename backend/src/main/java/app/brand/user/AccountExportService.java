package app.brand.user;

import app.brand.common.ApiException;
import app.brand.content.SenderPresenter;
import app.brand.content.SenderRow;
import app.brand.message.InboxMessage;
import app.brand.message.MessageService;
import app.brand.board.BoardPost;
import app.brand.settings.SectionChangeLog;
import app.brand.settings.SettingsService;
import app.brand.thread.ThreadDtos.ThreadDetailDto;
import app.brand.thread.ThreadService;
import app.brand.user.AccountExportDtos.AccountExportDto;
import app.brand.user.AccountExportDtos.ExportedThreadDto;
import app.brand.user.AccountExportDtos.SectionChangeDto;
import app.brand.user.AccountExportDtos.SentContentDto;
import app.brand.user.AccountExportDtos.ThreadOriginDto;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /me/export} — everything this account owns, in one JSON object
 * (brief §5, KVKK: "data export and deletion").
 *
 * <p>Nothing here renders a DTO of its own where a surface already renders one.
 * The profile comes from {@link ProfileService}, the settings and the blocked list
 * from {@link SettingsService}, the inbox from {@link MessageService} and every
 * thread from {@link ThreadService} — the same methods the app calls, with the
 * same privacy rules compiled in. An export that re-rendered its own DTOs would be
 * a second place for a hidden field to leak from, and it would drift.
 *
 * <p>The two things only this class builds are the owner's <b>sent</b> messages and
 * posts, which no screen shows back to them, and the section-change trail.
 *
 * <p>Throttled to one export per minute per account. It is the most expensive read
 * in the product and the only one that returns a whole account at once; a minute
 * is invisible to a person tapping "Download my data" and closes the loop for
 * anything that is not.
 */
@Service
public class AccountExportService {

    /** Cheap guard: an export is heavy and nobody needs two in the same minute. */
    private static final Duration THROTTLE = Duration.ofMinutes(1);

    private final EntityManager entityManager;
    private final ProfileService profiles;
    private final SettingsService settings;
    private final MessageService messages;
    private final ThreadService threads;
    private final SectionChangeLog sectionChanges;
    private final SenderPresenter presenter;
    private final Clock clock;

    /**
     * Last export per account. In memory on purpose: [B12] this is a single
     * instance, the window is a minute, and a restart forgetting it is the right
     * failure — it can only ever let one extra export through.
     */
    private final Map<UUID, Instant> lastExport = new ConcurrentHashMap<>();

    public AccountExportService(EntityManager entityManager,
                                ProfileService profiles,
                                SettingsService settings,
                                MessageService messages,
                                ThreadService threads,
                                SectionChangeLog sectionChanges,
                                SenderPresenter presenter,
                                Clock clock) {
        this.entityManager = entityManager;
        this.profiles = profiles;
        this.settings = settings;
        this.messages = messages;
        this.threads = threads;
        this.sectionChanges = sectionChanges;
        this.presenter = presenter;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AccountExportDto export(UUID userId) {
        throttle(userId);
        return new AccountExportDto(
                profiles.me(userId),
                settings.read(userId),
                settings.blocked(userId),
                messages.inbox(userId).messages(),
                sent(userId),
                posted(userId),
                conversations(userId),
                sectionChangeHistory(userId));
    }

    /* ------------------------------------------------------------- the owner's */

    /** Wall messages this account wrote, oldest first, at the level each was sent at. */
    private List<SentContentDto> sent(UUID userId) {
        List<InboxMessage> rows = entityManager.createQuery("""
                        select m from InboxMessage m
                        where m.senderId = :sender
                        order by m.createdAt asc, m.id asc
                        """, InboxMessage.class)
                .setParameter("sender", userId)
                .getResultList();
        return content(rows, InboxMessage::getText, InboxMessage::getCreatedAt);
    }

    /** Board posts this account wrote — every state, including rejected ones. */
    private List<SentContentDto> posted(UUID userId) {
        List<BoardPost> rows = entityManager.createQuery("""
                        select p from BoardPost p
                        where p.senderId = :sender
                        order by p.createdAt asc, p.id asc
                        """, BoardPost.class)
                .setParameter("sender", userId)
                .getResultList();
        return content(rows, BoardPost::getText, BoardPost::getCreatedAt);
    }

    private <T extends SenderRow> List<SentContentDto> content(List<T> rows,
                                                               java.util.function.Function<T, String> text,
                                                               java.util.function.Function<T, Instant> createdAt) {
        if (rows.isEmpty()) {
            return List.of();
        }
        SenderPresenter.Resolver senders = presenter.forRows(rows);
        List<SentContentDto> out = new ArrayList<>(rows.size());
        for (T row : rows) {
            out.add(new SentContentDto(text.apply(row), senders.present(row), createdAt.apply(row)));
        }
        return out;
    }

    /* ----------------------------------------------------------------- threads */

    /**
     * Every conversation this account is in, rendered by {@code GET /threads/{id}}'s
     * own code — so a bubble is exported at the level it was sent at [D5] and the
     * other person is exported at the level they chose, never unmasked.
     *
     * <p>A thread the owner has blocked the other side of is skipped rather than
     * force-read: {@link ThreadService#detail} is the access rule, and an export is
     * not a way around one. The thread is invisible to them in the app too.
     */
    private List<ExportedThreadDto> conversations(UUID userId) {
        List<UUID> ids = entityManager.createQuery("""
                        select p.id.threadId from ThreadParticipant p
                        where p.id.userId = :user
                        order by p.joinedAt asc
                        """, UUID.class)
                .setParameter("user", userId)
                .getResultList();

        List<ExportedThreadDto> out = new ArrayList<>(ids.size());
        for (UUID id : ids) {
            ThreadDetailDto detail;
            try {
                detail = threads.detail(userId, id.toString());
            } catch (ApiException notVisible) {
                continue;
            }
            out.add(new ExportedThreadDto(
                    new ThreadOriginDto(detail.origin().text(), detail.origin().sender()),
                    detail.messages()));
        }
        return out;
    }

    /* --------------------------------------------------------- section changes */

    private List<SectionChangeDto> sectionChangeHistory(UUID userId) {
        return sectionChanges.historyOf(userId).stream()
                .map(entry -> new SectionChangeDto(entry.from(), entry.to(), entry.at()))
                .toList();
    }

    /* ---------------------------------------------------------------- throttle */

    private void throttle(UUID userId) {
        Instant now = Instant.now(clock);
        Instant previous = lastExport.get(userId);
        if (previous != null && previous.plus(THROTTLE).isAfter(now)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "export is rate limited");
        }
        lastExport.put(userId, now);
    }

    /** The deletion path drops the account's throttle entry with everything else. */
    void forget(UUID userId) {
        lastExport.remove(userId);
    }
}
