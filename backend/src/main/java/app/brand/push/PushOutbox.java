package app.brand.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One notification, durable [B8].
 *
 * <p>The row is <b>self-contained</b>: the title and the body are rendered into
 * {@code payload} at enqueue time, in the language of the account's most recently
 * seen device. The drain never reads a message, a post or a user row, so a push
 * cannot change its mind between being decided and being delivered — and a
 * recipient who deletes the message a second later still learns that it arrived,
 * which is all the notification ever said.
 *
 * <p>{@code attempts} and {@code last_error} are the whole retry policy:
 * {@link PushHousekeeping} stops after {@link #MAX_ATTEMPTS}. A notification is
 * worth a handful of tries and nothing more — it is the least durable thing in the
 * product, and the app's own badge is the truth.
 */
@Entity
@Table(name = "push_outbox")
public class PushOutbox {

    /** After this many failures the row is left alone: a stale push is worse than none. */
    public static final int MAX_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    /** {@link PushKind#wire()}. */
    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "locale", nullable = false, updatable = false)
    private String locale;

    /** {@code {kind, args, title, body, data}} — rendered, not a template. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, updatable = false)
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error")
    private String lastError;

    protected PushOutbox() {
    }

    static PushOutbox of(UUID userId, PushKind kind, String locale, String payload, Instant now) {
        PushOutbox row = new PushOutbox();
        row.userId = userId;
        row.kind = kind.wire();
        row.locale = locale;
        row.payload = payload;
        row.createdAt = now;
        row.attempts = 0;
        return row;
    }

    /** Delivered. The row stays until the purge, so a complaint is still explicable. */
    void markSent(Instant now) {
        this.sentAt = now;
        this.attempts = attempts + 1;
        this.lastError = null;
    }

    /** Not delivered. Truncated, because a provider's error text is not a log file. */
    void markFailed(String error) {
        this.attempts = attempts + 1;
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getKind() {
        return kind;
    }

    public String getLocale() {
        return locale;
    }

    public String getPayload() {
        return payload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public String getLastError() {
        return lastError;
    }

    public boolean isGivenUp() {
        return sentAt == null && attempts >= MAX_ATTEMPTS;
    }
}
