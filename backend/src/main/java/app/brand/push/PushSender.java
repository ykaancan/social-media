package app.brand.push;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The transport [B8]. One implementation talks to Expo's push service, the other
 * writes a log line; nothing else in the application knows which is in use.
 *
 * <p>A sender never touches the database. It is handed rendered rows and the
 * tokens they go to, and it answers what happened — including which tokens the
 * provider says are dead, which {@link PushHousekeeping} turns into deleted
 * {@link Device} rows. That is the whole reason this is an interface: the day Expo
 * is replaced by direct FCM/APNs senders, the outbox, the retry policy and the
 * device clean-up are already written and do not move.
 */
public interface PushSender {

    /**
     * @param batch at most {@code brand.push.batch-size} messages
     * @return one result per message, in any order; a message with no result is
     *         treated as failed
     */
    List<PushResult> send(List<PushMessage> batch);

    /**
     * One notification, ready to go: the outbox row it came from, the phones it
     * goes to, and the copy already rendered in that account's language.
     *
     * @param data ids for the app's deep link; never a name, a hint or any text
     */
    record PushMessage(PushOutbox row,
                       List<String> tokens,
                       String title,
                       String body,
                       Map<String, Object> data) {

        public PushMessage {
            tokens = tokens == null ? List.of() : List.copyOf(tokens);
            data = data == null ? Map.of() : Map.copyOf(data);
        }

        public UUID id() {
            return row.getId();
        }
    }

    /**
     * @param outboxId            the message this answers
     * @param delivered           true when the provider accepted it for at least one token
     * @param error               why not, short enough for {@code push_outbox.last_error}
     * @param unregisteredTokens  tokens the provider says no longer exist; their
     *                            device rows are deleted, so the next push does not
     *                            spend an attempt on a phone that is gone
     */
    record PushResult(UUID outboxId,
                      boolean delivered,
                      String error,
                      List<String> unregisteredTokens) {

        public PushResult {
            unregisteredTokens = unregisteredTokens == null ? List.of() : List.copyOf(unregisteredTokens);
        }

        public static PushResult delivered(UUID outboxId, List<String> unregistered) {
            return new PushResult(outboxId, true, null, unregistered);
        }

        public static PushResult failed(UUID outboxId, String error, List<String> unregistered) {
            return new PushResult(outboxId, false, error, unregistered);
        }
    }
}
