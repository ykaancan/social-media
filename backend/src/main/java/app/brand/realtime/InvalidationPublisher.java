package app.brand.realtime;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns a domain event into the empty frame that tells a client to refetch [B12].
 *
 * <p>Every listener runs {@link TransactionPhase#AFTER_COMMIT}, so a frame can
 * never arrive before the row it announces is visible to the refetch it triggers.
 * {@code fallbackExecution = true} keeps it working when something publishes
 * outside a transaction (a scheduled housekeeping pass [B5] that has already
 * committed, or a test).
 *
 * <p>The body is an empty string, not JSON: the frame means "something changed
 * here", the client answers with an authorised HTTP read, and no privacy rule is
 * ever evaluated on this path. That is also why no listener is needed for
 * {@code message.InboxMessageChanged} — the board owns the decision about what an
 * inbox change means for a board (a post to a person is on the board only while
 * that message is approved), so the board republishes it as a
 * {@link BoardChanged}. Listening for it here as well would send every client two
 * frames for one change.
 */
@Component
public class InvalidationPublisher {

    private static final Logger log = LoggerFactory.getLogger(InvalidationPublisher.class);

    /** Frames carry no content; clients refetch. */
    private static final String EMPTY = "";

    private final SimpMessagingTemplate messaging;

    public InvalidationPublisher(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onBoardChanged(BoardChanged event) {
        String topic = "/topic/events/" + event.eventId() + "/board";
        log.debug("board {} changed; {} private", event.eventId(), event.privateUserIds().size());
        messaging.convertAndSend(topic, EMPTY);
        for (UUID userId : event.privateUserIds()) {
            // How a sender learns their own pending or rejected post moved
            // without the room being told anything.
            messaging.convertAndSendToUser(userId.toString(), "/queue/events/" + event.eventId(), EMPTY);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onThreadsChanged(ThreadsChanged event) {
        log.debug("threads changed for {} people", event.userIds().size());
        for (UUID userId : event.userIds()) {
            messaging.convertAndSendToUser(userId.toString(), "/queue/threads", EMPTY);
        }
    }
}
