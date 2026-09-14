package app.brand.push;

import app.brand.common.events.AccountApproved;
import app.brand.common.events.PostModerated;
import app.brand.common.events.ThreadMessageSent;
import app.brand.common.events.UserWarned;
import app.brand.event.EventRepository;
import app.brand.message.InboxMessageDelivered;
import app.brand.thread.ThreadRepository;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns the five things worth telling somebody about into outbox rows [B8].
 *
 * <p>Every listener is {@link TransactionPhase#AFTER_COMMIT}, exactly like
 * {@code realtime/InvalidationPublisher}: a notification can never announce
 * something that then rolls back. {@code fallbackExecution = true} keeps it working
 * when the publisher was not in a transaction at all — the housekeeping pass [B5]
 * that has already committed, or a test.
 *
 * <p>Where the preference lives is deliberate and differs per kind:
 *
 * <ul>
 *   <li><b>Inbox</b> asks nothing here. {@code pushSuppressed} on the delivery event
 *       already folds in both {@code notify_inbox} and the recipient's muted words
 *       [D10] — and it is carried on the event rather than read back from the row,
 *       so this listener cannot accidentally notify somebody whose muted word
 *       caught the message. The sender is told nothing either way.</li>
 *   <li><b>Threads</b> is {@code notify_threads}, read now.</li>
 *   <li><b>Your own post being moderated</b> has no switch of its own in the brief.
 *       {@code notify_board_mentions} is the closest one a person has, and somebody
 *       who turned board notifications off is saying they do not want the board on
 *       their lock screen — so it gates these too.</li>
 *   <li><b>Approval and a warning</b> are not notifications about content and have
 *       no switch. One is the moment the account starts existing; the other is an
 *       admin acting on a report, which a person does not get to mute.</li>
 * </ul>
 *
 * <p>Nothing here reads a sender, a hint or any text. The arguments are an event
 * name, which every member of that board can already see, and the data map is ids.
 */
@Component
public class PushNotifier {

    private static final Logger log = LoggerFactory.getLogger(PushNotifier.class);

    private final PushService push;
    private final UserSettingsRepository settings;
    private final EventRepository events;
    private final ThreadRepository threads;

    public PushNotifier(PushService push,
                        UserSettingsRepository settings,
                        EventRepository events,
                        ThreadRepository threads) {
        this.push = push;
        this.settings = settings;
        this.events = events;
        this.threads = threads;
    }

    /** "Someone wrote on your wall." Never who, never what. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onInboxMessageDelivered(InboxMessageDelivered event) {
        if (event.pushSuppressed()) {
            // [D10] A muted word, or notifications off. Either way the message is
            // delivered and filed, and nobody is told — least of all the sender.
            return;
        }
        push.enqueue(event.recipientId(), PushKind.INBOX_NEW,
                eventName(event.eventId()),
                data("messageId", event.messageId(), "eventId", event.eventId()));
    }

    /** A reply arrived. The other side may be anonymous, and stays anonymous here. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onThreadMessageSent(ThreadMessageSent event) {
        if (!notify(event.recipientId(), UserSettings::isNotifyThreads)) {
            return;
        }
        UUID eventId = threads.findById(event.threadId())
                .map(app.brand.thread.Thread::getEventId)
                .orElse(null);
        push.enqueue(event.recipientId(), PushKind.THREAD_MESSAGE,
                eventName(eventId),
                data("threadId", event.threadId(), "eventId", eventId));
    }

    /** The sender's own post left the queue. [D8] A rejection says so plainly. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onPostModerated(PostModerated event) {
        PushKind kind = switch (event.outcome()) {
            case APPROVED -> PushKind.POST_APPROVED;
            case REJECTED -> PushKind.POST_REJECTED;
            case BOARD_CLOSED -> PushKind.POST_BOARD_CLOSED;
        };
        if (!notify(event.senderId(), UserSettings::isNotifyBoardMentions)) {
            return;
        }
        push.enqueue(event.senderId(), kind,
                eventName(event.eventId()),
                data("postId", event.postId(), "eventId", event.eventId()));
    }

    /** The first push an account can receive, and the reason it can receive any. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onAccountApproved(AccountApproved event) {
        push.enqueue(event.userId(), PushKind.ACCOUNT_APPROVED);
    }

    /** CLAUDE.md §4.9: warn is one of the admin's four actions on a report. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onUserWarned(UserWarned event) {
        push.enqueue(event.userId(), PushKind.WARNED, List.of(),
                data("reportId", event.reportId()));
    }

    /* ------------------------------------------------------------- internals */

    /** A missing settings row is the defaults — push on (brief §4.8), never an error. */
    private boolean notify(UUID userId, java.util.function.Predicate<UserSettings> flag) {
        if (userId == null) {
            return false;
        }
        return settings.findById(userId).map(flag::test).orElse(true);
    }

    /**
     * The event's name as one copy argument, or none. An id the event table no
     * longer has is not a reason to skip the notification — the body simply drops
     * the "at {0}" half.
     */
    private List<String> eventName(UUID eventId) {
        if (eventId == null) {
            return List.of();
        }
        Optional<String> name = events.findById(eventId).map(app.brand.event.Event::getName);
        if (name.isEmpty()) {
            log.debug("push for unknown event {}", eventId);
        }
        return name.map(List::of).orElseGet(List::of);
    }

    private static Map<String, String> data(String firstKey, UUID firstValue,
                                            String secondKey, UUID secondValue) {
        Map<String, String> data = new LinkedHashMap<>();
        put(data, firstKey, firstValue);
        put(data, secondKey, secondValue);
        return data;
    }

    private static Map<String, String> data(String key, UUID value) {
        Map<String, String> data = new LinkedHashMap<>();
        put(data, key, value);
        return data;
    }

    private static void put(Map<String, String> data, String key, UUID value) {
        if (value != null) {
            data.put(key, value.toString());
        }
    }
}
