package app.brand.thread;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** [B7] The composite key of {@code request_key}: one key space per account. */
@Embeddable
public class RequestKeyId implements Serializable {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "key", nullable = false, updatable = false)
    private String key;

    protected RequestKeyId() {
    }

    public RequestKeyId(UUID userId, String key) {
        this.userId = userId;
        this.key = key;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getKey() {
        return key;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        return other instanceof RequestKeyId id
                && Objects.equals(userId, id.userId)
                && Objects.equals(key, id.key);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, key);
    }
}
