package app.brand.common.events;

import java.util.UUID;

/**
 * A thread message was appended (not the system "revealed" row). Published by
 * the thread service inside its transaction; the push layer listens after
 * commit and notifies the recipient when their thread notifications are on.
 */
public record ThreadMessageSent(UUID threadId, UUID messageId, UUID senderId, UUID recipientId) {
}
