package app.brand.message;

import java.util.UUID;

/**
 * An existing message moved: a state change [D12] or a soft delete.
 *
 * <p>Step B-3 listens for it. A board post addressed to a person is published on
 * the board only while that person's message is {@code approved} and not deleted,
 * so taking a card off the wall changes what the whole board sees and the board
 * has to be invalidated [B12].
 *
 * <p>{@code eventId} may be null only for a message written outside an event,
 * which stage 1 never produces.
 */
public record InboxMessageChanged(UUID messageId, UUID eventId) {
}
