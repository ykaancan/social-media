package app.brand.message;

import java.util.UUID;

/**
 * A message was accepted and stored. Published once per delivery, whatever state
 * it landed in.
 *
 * <p>Step B-5 attaches push to this [B8]. {@code pushSuppressed} is carried on the
 * event rather than read back from the row, so the listener cannot accidentally
 * notify a recipient whose muted word caught this message [D10] — and the sender
 * still learns nothing either way.
 *
 * <p>No text and no sender id: a listener that needs the row reads it, and one
 * that only sends a "you have a new message" push never holds either.
 */
public record InboxMessageDelivered(UUID messageId,
                                    UUID recipientId,
                                    UUID eventId,
                                    boolean pushSuppressed) {
}
