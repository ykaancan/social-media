package app.brand.content;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.MeMapper;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The one place anonymity columns become something a member may see.
 *
 * <p>The split is [B4]'s: <em>chips come from the snapshot</em>
 * ({@code sender_section_id} — the section the sender was in when they sent, so
 * a later change [D7] does not rewrite history and the country hint stays
 * checkable against a real section [D11]); <em>name, avatar and first letter
 * come from the live user row</em>, because {@code named} means "this person"
 * and a renamed person is still that person.
 *
 * <p>Nothing here can emit an id. A caller that wants to leak one has to go
 * around this class, and no member endpoint does.
 *
 * <p>Rendering a list goes through {@link #forRows}, which loads both sides in two
 * queries for the whole batch: the inbox is read on every app open and a board at
 * an event is a few hundred cards, so a per-card lookup is a few hundred queries.
 */
@Component
public class SenderPresenter {

    private final MeMapper meMapper;
    private final AppUserRepository users;
    private final SectionRepository sections;

    public SenderPresenter(MeMapper meMapper, AppUserRepository users, SectionRepository sections) {
        this.meMapper = meMapper;
        this.users = users;
        this.sections = sections;
    }

    /**
     * @param anonymity       the content row's anonymity columns
     * @param sender          the live {@code app_user} row behind the content
     * @param snapshotSection the section {@code anonymity.senderSectionId} points at,
     *                        already loaded; null only if the sender had no section
     */
    public MessageSenderDto present(Anonymity anonymity, AppUser sender, Section snapshotSection) {
        if (anonymity == null || anonymity.level() == null) {
            return MessageSenderDto.anonymous();
        }
        return switch (anonymity.level()) {
            case ANONYMOUS -> MessageSenderDto.anonymous();
            case NAMED -> MessageSenderDto.named(
                    sender == null ? null : sender.getName(),
                    sender == null ? null : meMapper.avatarUrl(sender.getAvatarKey()));
            case HINT -> MessageSenderDto.hint(new MessageSenderDto.Hints(
                    anonymity.hintSection() && snapshotSection != null ? snapshotSection.getName() : null,
                    anonymity.hintCountry() && snapshotSection != null
                            ? snapshotSection.getCountry().getName() : null,
                    anonymity.hintLetter() ? firstLetter(sender) : null));
        };
    }

    /** Two queries for a whole list of rows: the live senders, and the snapshot sections. */
    public Resolver forRows(Collection<? extends SenderRow> rows) {
        return resolve(rows, false);
    }

    /**
     * The same, for rows whose level is <b>frozen</b> — the blocked list [D6].
     *
     * <p>The live user row is loaded only where the frozen level actually needs it
     * (a {@code named} block, or a first-letter hint), so a block placed on an
     * anonymous message can never become a named row, not even by accident: the
     * name is not in memory to render.
     */
    public Resolver forFrozenRows(Collection<? extends SenderRow> rows) {
        return resolve(rows, true);
    }

    private Resolver resolve(Collection<? extends SenderRow> rows, boolean onlyWhereTheLevelNeedsIt) {
        Set<UUID> senderIds = new HashSet<>();
        Set<UUID> sectionIds = new HashSet<>();
        for (SenderRow row : rows) {
            Anonymity anonymity = row.anonymity();
            if (row.senderId() != null && (!onlyWhereTheLevelNeedsIt || needsTheLiveUser(anonymity))) {
                senderIds.add(row.senderId());
            }
            if (anonymity != null && anonymity.senderSectionId() != null) {
                sectionIds.add(anonymity.senderSectionId());
            }
        }

        Map<UUID, AppUser> senders = new HashMap<>();
        if (!senderIds.isEmpty()) {
            users.findAllById(senderIds).forEach(user -> senders.put(user.getId(), user));
        }
        Map<UUID, Section> snapshots = new HashMap<>();
        if (!sectionIds.isEmpty()) {
            sections.findAllById(sectionIds).forEach(section -> snapshots.put(section.getId(), section));
        }
        return new Resolver(senders, snapshots);
    }

    /** Only these two levels read anything off the live account; the rest is the snapshot. */
    private static boolean needsTheLiveUser(Anonymity anonymity) {
        if (anonymity == null || anonymity.level() == null) {
            return false;
        }
        return anonymity.level() == AnonymityLevel.NAMED || anonymity.hintLetter();
    }

    /**
     * The first <em>code point</em>, not the first char: a name that starts with a
     * character outside the basic plane must not be cut in half, and the app
     * derives the same letter with {@code Array.from(name)[0]}.
     */
    private static String firstLetter(AppUser sender) {
        String name = sender == null ? null : sender.getName();
        if (name == null || name.isEmpty()) {
            return null;
        }
        return new String(Character.toChars(name.codePointAt(0)));
    }

    /** One batch's worth of lookups, so rendering a row is pure. */
    public final class Resolver {

        private final Map<UUID, AppUser> senders;
        private final Map<UUID, Section> snapshotSections;

        private Resolver(Map<UUID, AppUser> senders, Map<UUID, Section> snapshotSections) {
            this.senders = senders;
            this.snapshotSections = snapshotSections;
        }

        public MessageSenderDto present(SenderRow row) {
            Anonymity anonymity = row.anonymity();
            Section snapshot = anonymity == null || anonymity.senderSectionId() == null
                    ? null : snapshotSections.get(anonymity.senderSectionId());
            return SenderPresenter.this.present(anonymity, senders.get(row.senderId()), snapshot);
        }
    }
}
