package app.brand.settings;

import app.brand.common.ApiException;
import app.brand.common.Ids;
import app.brand.common.TextNormalizer;
import app.brand.content.SenderPresenter;
import app.brand.safety.Block;
import app.brand.safety.BlockService;
import app.brand.safety.WritingPolicy;
import app.brand.settings.SettingsDtos.AccountSettingsDto;
import app.brand.settings.SettingsDtos.BlockedEntryDto;
import app.brand.settings.SettingsDtos.NotificationsDto;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Settings &amp; safety (brief §4.8), minus the parts step B-5 owns (section
 * change, export, deletion).
 *
 * <p>Two rules run through everything here:
 *
 * <ul>
 *   <li><b>The patch is atomic.</b> Every field is validated before anything is
 *       written, so a bad {@code mutedWords} array cannot leave a new
 *       {@code writingPolicy} behind. Absent keys keep their current value;
 *       an explicit null is a value, and an invalid one.</li>
 *   <li><b>[D10] Muted words are forward-looking only.</b> Nothing in here
 *       touches a message that has already been delivered — a word added today
 *       does not reach back and file yesterday's message to {@code private}.</li>
 * </ul>
 */
@Service
public class SettingsService {

    /** [D7] One section change per 30 days. B-5 enforces it; B-2 only reports it. */
    private static final int COOLDOWN_DAYS = 30;

    /** The mock's limits, unchanged: at most 100 words, each 1–40 characters trimmed. */
    private static final int MAX_MUTED_WORDS = 100;
    private static final int MAX_MUTED_WORD_LENGTH = 40;

    private final UserSettingsRepository settings;
    private final SectionChangeLog sectionChanges;
    private final BlockService blocks;
    private final SenderPresenter presenter;

    public SettingsService(UserSettingsRepository settings,
                           SectionChangeLog sectionChanges,
                           BlockService blocks,
                           SenderPresenter presenter) {
        this.settings = settings;
        this.sectionChanges = sectionChanges;
        this.blocks = blocks;
        this.presenter = presenter;
    }

    /* ------------------------------------------------------- GET /me/settings */

    /**
     * A missing row reads as the defaults and is not created here: a read must
     * never write, and {@code AuthService} already creates the row with the
     * account.
     */
    @Transactional(readOnly = true)
    public AccountSettingsDto read(UUID userId) {
        return dto(userId, settings.findById(userId).orElseGet(() -> UserSettings.defaultsFor(userId)));
    }

    /* ----------------------------------------------------- PATCH /me/settings */

    /**
     * Partial update. The body is read as a tree rather than a typed record on
     * purpose: the difference between "absent", "null" and "wrong type" is the
     * whole contract here, and a typed binding would turn a non-boolean
     * notification into an unreadable-body 422 with no field name.
     */
    @Transactional
    public AccountSettingsDto update(UUID userId, JsonNode body) {
        UserSettings row = settings.findById(userId)
                .orElseGet(() -> UserSettings.defaultsFor(userId));

        String policy = row.getWritingPolicy();
        MutedWords words = null;
        boolean inbox = row.isNotifyInbox();
        boolean threads = row.isNotifyThreads();
        boolean boardMentions = row.isNotifyBoardMentions();

        if (body != null && !body.isNull()) {
            if (!body.isObject()) {
                throw ApiException.validation("invalid settings", null);
            }
            if (body.has("writingPolicy")) {
                policy = writingPolicy(body.get("writingPolicy")).value();
            }
            if (body.has("mutedWords")) {
                words = mutedWords(body.get("mutedWords"));
            }
            if (body.has("notifications")) {
                JsonNode node = body.get("notifications");
                if (!node.isObject()) {
                    throw ApiException.validation("invalid notifications", "notifications");
                }
                inbox = notificationFlag(node.get("inbox"));
                threads = notificationFlag(node.get("threads"));
                boardMentions = notificationFlag(node.get("boardMentions"));
            }
        }

        // Nothing above this line has touched the row: validation is complete, so
        // a failure has saved nothing.
        row.apply(policy,
                words == null ? row.getMutedWords() : words.stored(),
                words == null ? row.getMutedWordsNormalized() : words.normalized(),
                inbox, threads, boardMentions);
        return dto(userId, settings.save(row));
    }

    /* --------------------------------------------------------- GET /me/blocks */

    /**
     * [D6] The blocked list, rendered from the identity the blocked person had
     * <em>already allowed</em> when the block was made. The live user row is read
     * only where the frozen level actually needs it — a {@code named} block, or a
     * first-letter hint — so an anonymous block can never become a named row.
     */
    @Transactional(readOnly = true)
    public List<BlockedEntryDto> blocked(UUID userId) {
        List<Block> rows = blocks.listFor(userId);
        if (rows.isEmpty()) {
            return List.of();
        }
        // Frozen, not live: the resolver loads the blocked person's account only
        // where the level the block was made at actually needs it.
        SenderPresenter.Resolver senders = presenter.forFrozenRows(rows);
        return rows.stream()
                .map(row -> new BlockedEntryDto(row.getId().toString(), senders.present(row)))
                .toList();
    }

    /* --------------------------------------------------- DELETE /me/blocks/{id} */

    /** Someone else's row — or a string that is not a uuid at all — is 404. */
    @Transactional
    public void unblock(UUID userId, String rawId) {
        blocks.unblock(userId, Ids.orNotFound(rawId, "no such block"));
    }

    /* ------------------------------------------------------------- internals */

    private AccountSettingsDto dto(UUID userId, UserSettings row) {
        String availableAt = sectionChanges.lastChangedAt(userId)
                .map(changedAt -> changedAt.plus(COOLDOWN_DAYS, ChronoUnit.DAYS))
                .map(Instant::toString)
                .orElse(null);
        return new AccountSettingsDto(
                WritingPolicy.orDefault(row.getWritingPolicy()),
                List.of(row.getMutedWords()),
                new NotificationsDto(row.isNotifyInbox(), row.isNotifyThreads(), row.isNotifyBoardMentions()),
                availableAt);
    }

    private static WritingPolicy writingPolicy(JsonNode node) {
        String raw = node != null && node.isTextual() ? node.asText() : null;
        for (WritingPolicy policy : WritingPolicy.values()) {
            if (policy.value().equals(raw)) {
                return policy;
            }
        }
        throw ApiException.validation("invalid policy", "writingPolicy");
    }

    private static boolean notificationFlag(JsonNode node) {
        if (node == null || !node.isBoolean()) {
            throw ApiException.validation("invalid notifications", "notifications");
        }
        return node.booleanValue();
    }

    /**
     * Trim, Turkish-lowercase, de-duplicate by normalised form keeping the first
     * occurrence. The stored word is what the person will see back; the normalised
     * one is what {@code RecipientPolicy} matches against, and the two arrays stay
     * in step, index for index.
     */
    private static MutedWords mutedWords(JsonNode node) {
        if (node == null || !node.isArray() || node.size() > MAX_MUTED_WORDS) {
            throw ApiException.validation("invalid words", "mutedWords");
        }
        List<String> stored = new ArrayList<>();
        List<String> normalized = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode element : node) {
            if (!element.isTextual()) {
                throw ApiException.validation("invalid words", "mutedWords");
            }
            String trimmed = element.asText().trim();
            if (trimmed.isEmpty() || trimmed.length() > MAX_MUTED_WORD_LENGTH) {
                throw ApiException.validation("invalid words", "mutedWords");
            }
            String key = TextNormalizer.normalizeForSearch(trimmed);
            if (key.isEmpty()) {
                // A word of nothing but combining marks or spaces could never match
                // anything; storing it would be a control the person cannot see.
                throw ApiException.validation("invalid words", "mutedWords");
            }
            if (seen.add(key)) {
                stored.add(TextNormalizer.lowerTr(trimmed));
                normalized.add(key);
            }
        }
        return new MutedWords(stored.toArray(String[]::new), normalized.toArray(String[]::new));
    }

    private record MutedWords(String[] stored, String[] normalized) {
    }
}
