package app.brand.realtime;

import java.util.Set;
import java.util.UUID;

/**
 * Something on a board changed [B12]. The realtime layer turns this into an
 * empty-body frame on {@code /topic/events/{eventId}/board} for every subscribed
 * member, and — for each id in {@code privateUserIds} — one on that person's
 * {@code /user/queue/events/{eventId}}, which is how a sender learns their own
 * pending or rejected post moved without the whole room being told.
 *
 * <p>Frames never carry content; clients refetch the authorised snapshot.
 *
 * @param eventId        the board
 * @param privateUserIds people whose own view changed (senders of affected posts);
 *                       empty when the change is only public
 */
public record BoardChanged(UUID eventId, Set<UUID> privateUserIds) {

    public BoardChanged {
        privateUserIds = privateUserIds == null ? Set.of() : Set.copyOf(privateUserIds);
    }

    public static BoardChanged publicOnly(UUID eventId) {
        return new BoardChanged(eventId, Set.of());
    }
}
