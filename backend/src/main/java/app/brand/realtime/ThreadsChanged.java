package app.brand.realtime;

import java.util.Set;
import java.util.UUID;

/**
 * A thread one or more people are in changed (new message, reveal, read
 * watermark, block). The realtime layer sends each of them an empty-body frame
 * on {@code /user/queue/threads} [B12]; the client refetches. Published by step
 * B-4; the transport exists from B-3.
 */
public record ThreadsChanged(Set<UUID> userIds) {

    public ThreadsChanged {
        userIds = userIds == null ? Set.of() : Set.copyOf(userIds);
    }
}
