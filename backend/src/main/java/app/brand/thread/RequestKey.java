package app.brand.thread;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * [B7] What makes a retry safe.
 *
 * <p>A phone that loses the answer to "open this thread" retries the same call.
 * Without this table that is a second thread; with it the first thread's id comes
 * back. The key is the caller's own {@code requestId}, scoped and hashed by
 * {@link ThreadService}; {@code fingerprint_hash} is the request itself, so a
 * client that reuses one key for a <em>different</em> draft is told
 * ({@code 409 request_key_reused}) rather than quietly shown someone else's
 * result.
 *
 * <p>{@code result_id} is the thread a successful open produced. A send has no
 * result to return, so it stores null and the row exists only to say "already
 * done".
 *
 * <p>Rows are purged after seven days by {@link ThreadHousekeeping}: a retry that
 * arrives a week later is a new request by then.
 */
@Entity
@Table(name = "request_key")
public class RequestKey {

    @EmbeddedId
    private RequestKeyId id;

    @Column(name = "fingerprint_hash", nullable = false, updatable = false)
    private String fingerprintHash;

    @Column(name = "result_id", updatable = false)
    private UUID resultId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RequestKey() {
    }

    public static RequestKey of(UUID userId, String key, String fingerprintHash, UUID resultId, Instant now) {
        RequestKey row = new RequestKey();
        row.id = new RequestKeyId(userId, key);
        row.fingerprintHash = fingerprintHash;
        row.resultId = resultId;
        row.createdAt = now;
        return row;
    }

    public RequestKeyId getId() {
        return id;
    }

    public String getFingerprintHash() {
        return fingerprintHash;
    }

    public UUID getResultId() {
        return resultId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
