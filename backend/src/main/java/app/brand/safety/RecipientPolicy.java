package app.brand.safety;

import app.brand.common.TextNormalizer;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The recipient's own controls, read on the way in.
 *
 * <p>Two rules that are easy to conflate and must never be:
 *
 * <ul>
 *   <li><b>Writing policy</b> is a delivery rule. {@code nobody}, or
 *       {@code named_only} against an anonymous sender, refuses the send and the
 *       sender is told (403).</li>
 *   <li><b>Muted words</b> [D10] are not. A match never blocks delivery: the
 *       message is stored, filed to {@code private}, and its push is suppressed.
 *       The sender is never told, and nothing here returns anything the sender
 *       could learn from.</li>
 * </ul>
 *
 * <p>Matching is the same normalisation as screening, section search and people
 * search, and it is substring: a muted word has to catch the word inside a
 * sentence, and "İzmir" has to catch "izmir".
 */
@Service
public class RecipientPolicy {

    private final UserSettingsRepository settings;

    public RecipientPolicy(UserSettingsRepository settings) {
        this.settings = settings;
    }

    /** A missing settings row is the default, never an error: reads must not fail. */
    @Transactional(readOnly = true)
    public WritingPolicy writingPolicy(UUID userId) {
        return settings.findById(userId)
                .map(row -> WritingPolicy.orDefault(row.getWritingPolicy()))
                .orElse(WritingPolicy.ANYONE);
    }

    /**
     * [D10] Does any of this recipient's muted words appear in the text? A match
     * files the message to {@code private} and suppresses the push — it does not
     * refuse it, and it is never reported back to the sender.
     */
    @Transactional(readOnly = true)
    public boolean mutedMatch(UUID userId, String text) {
        UserSettings row = settings.findById(userId).orElse(null);
        if (row == null) {
            return false;
        }
        String haystack = TextNormalizer.normalizeForSearch(text == null ? "" : text);
        if (haystack.isEmpty()) {
            return false;
        }
        for (String word : row.getMutedWordsNormalized()) {
            // Re-fold: the stored form was normalised on write, and folding an
            // already-folded word is a no-op, so this only protects against a row
            // written before the normaliser existed.
            String needle = TextNormalizer.normalizeForSearch(word);
            if (!needle.isEmpty() && haystack.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    /** Push is on by default; a muted match suppresses it regardless of this. */
    @Transactional(readOnly = true)
    public boolean notifyInbox(UUID userId) {
        return settings.findById(userId).map(UserSettings::isNotifyInbox).orElse(true);
    }
}
