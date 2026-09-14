package app.brand.board;

import app.brand.message.InboxMessageChanged;
import app.brand.realtime.BoardChanged;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * [D12] The recipient curates, and the board has to follow.
 *
 * <p>A post addressed to a person is published on the board only while that
 * person's inbox message is {@code approved} and not deleted. So approving a card
 * to the wall, taking it back off, or deleting it changes what every member of
 * that board sees — and none of them asked, which is exactly what an invalidation
 * frame is for [B12].
 *
 * <p>The frame is <b>public only</b>. It says "this board changed" and nothing
 * else: not whose message it was, not which way it moved, not that the sender's
 * card was the one affected.
 */
@Component
public class BoardMessageListener {

    private final BoardPostRepository posts;
    private final ApplicationEventPublisher publisher;

    public BoardMessageListener(BoardPostRepository posts, ApplicationEventPublisher publisher) {
        this.posts = posts;
        this.publisher = publisher;
    }

    @EventListener
    public void onInboxMessageChanged(InboxMessageChanged changed) {
        if (changed.eventId() == null || changed.messageId() == null) {
            return;
        }
        // Most inbox messages have no card on a board; only the ones written from
        // one do, and only those can change what the board shows.
        if (!posts.existsByInboxMessageId(changed.messageId())) {
            return;
        }
        publisher.publishEvent(BoardChanged.publicOnly(changed.eventId()));
    }
}
