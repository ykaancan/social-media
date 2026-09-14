package app.brand.thread;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** The composite key of {@code thread_participant}: one row per person per thread. */
@Embeddable
public class ThreadParticipantId implements Serializable {

    @Column(name = "thread_id", nullable = false, updatable = false)
    private UUID threadId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    protected ThreadParticipantId() {
    }

    public ThreadParticipantId(UUID threadId, UUID userId) {
        this.threadId = threadId;
        this.userId = userId;
    }

    public UUID getThreadId() {
        return threadId;
    }

    public UUID getUserId() {
        return userId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        return other instanceof ThreadParticipantId key
                && Objects.equals(threadId, key.threadId)
                && Objects.equals(userId, key.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(threadId, userId);
    }
}
