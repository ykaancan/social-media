package app.brand.common.events;

import java.util.UUID;

/**
 * A room post left the queue with a final outcome. Published by the board
 * service (moderator approval, rejection finalised after the undo window, or
 * board_closed). The push layer tells the sender.
 */
public record PostModerated(UUID postId, UUID eventId, UUID senderId, Outcome outcome) {

    public enum Outcome { APPROVED, REJECTED, BOARD_CLOSED }
}
