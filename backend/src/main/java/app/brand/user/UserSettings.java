package app.brand.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One row per account, created with the account so no settings read has to cope
 * with a missing row.
 *
 * <p>Step B-5 owns the endpoints; this entity exists now only so registration can
 * write the row. [D10] Muted words never affect delivery — a match files the
 * message to {@code private} and suppresses the push, and the sender is never told.
 */
@Entity
@Table(name = "user_settings")
public class UserSettings {

    public static final String DEFAULT_WRITING_POLICY = "anyone";

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /** {@code anyone | named_only | nobody}. */
    @Column(name = "writing_policy", nullable = false)
    private String writingPolicy;

    /** As the person typed them. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "muted_words", nullable = false)
    private String[] mutedWords;

    /** The same words through {@code TextNormalizer}; the matcher reads these. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "muted_words_normalized", nullable = false)
    private String[] mutedWordsNormalized;

    @Column(name = "notify_inbox", nullable = false)
    private boolean notifyInbox;

    @Column(name = "notify_threads", nullable = false)
    private boolean notifyThreads;

    @Column(name = "notify_board_mentions", nullable = false)
    private boolean notifyBoardMentions;

    protected UserSettings() {
    }

    /** Push on by default for inbox, threads and board mentions (brief §4.8). */
    public static UserSettings defaultsFor(UUID userId) {
        UserSettings settings = new UserSettings();
        settings.userId = userId;
        settings.writingPolicy = DEFAULT_WRITING_POLICY;
        settings.mutedWords = new String[0];
        settings.mutedWordsNormalized = new String[0];
        settings.notifyInbox = true;
        settings.notifyThreads = true;
        settings.notifyBoardMentions = true;
        return settings;
    }

    /**
     * The whole row at once, written only after {@code PATCH /me/settings} has
     * validated every field — a partial patch merges into the current values in
     * the service and lands here as one atomic set, so a bad word list can never
     * leave a new writing policy behind.
     */
    public void apply(String writingPolicy,
                      String[] mutedWords,
                      String[] mutedWordsNormalized,
                      boolean notifyInbox,
                      boolean notifyThreads,
                      boolean notifyBoardMentions) {
        this.writingPolicy = writingPolicy;
        this.mutedWords = mutedWords == null ? new String[0] : mutedWords.clone();
        this.mutedWordsNormalized =
                mutedWordsNormalized == null ? new String[0] : mutedWordsNormalized.clone();
        this.notifyInbox = notifyInbox;
        this.notifyThreads = notifyThreads;
        this.notifyBoardMentions = notifyBoardMentions;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getWritingPolicy() {
        return writingPolicy;
    }

    public String[] getMutedWords() {
        return mutedWords == null ? new String[0] : mutedWords.clone();
    }

    public String[] getMutedWordsNormalized() {
        return mutedWordsNormalized == null ? new String[0] : mutedWordsNormalized.clone();
    }

    public boolean isNotifyInbox() {
        return notifyInbox;
    }

    public boolean isNotifyThreads() {
        return notifyThreads;
    }

    public boolean isNotifyBoardMentions() {
        return notifyBoardMentions;
    }
}
