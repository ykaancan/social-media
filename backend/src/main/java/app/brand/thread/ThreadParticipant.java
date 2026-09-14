package app.brand.thread;

import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.content.SenderRow;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One side of a thread: who they are to the other person <em>now</em>.
 *
 * <p>[D5] This is the level <b>new</b> messages go out at, and nothing else. A
 * bubble is always rendered from its own {@code thread_message} row, so revealing
 * yourself changes what you send from here on and never unmasks a word you already
 * sent. The two columns that make that work are the embedded {@link Anonymity} —
 * replaced wholesale by a reveal — and {@code revealed_at}, which stamps when.
 *
 * <p>{@code read_through_seq} is the read watermark [B2]: an integer compared
 * against {@code thread_message.seq}, never a timestamp. It starts at 0 and the
 * first message is seq 1, so a brand-new thread reads as one unread message
 * without anything having to write a row first.
 */
@Entity
@Table(name = "thread_participant")
public class ThreadParticipant implements SenderRow {

    @EmbeddedId
    private ThreadParticipantId id;

    /** [D5] The level this person is sending at now. Never used to render an old bubble. */
    @Embedded
    private Anonymity anonymity;

    @Column(name = "revealed_at")
    private Instant revealedAt;

    @Column(name = "read_through_seq", nullable = false)
    private long readThroughSeq;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected ThreadParticipant() {
    }

    public static ThreadParticipant of(UUID threadId, UUID userId, Anonymity anonymity, Instant now) {
        ThreadParticipant participant = new ThreadParticipant();
        participant.id = new ThreadParticipantId(threadId, userId);
        participant.anonymity = anonymity;
        participant.readThroughSeq = 0;
        participant.joinedAt = now;
        return participant;
    }

    /**
     * {@link SenderRow}: the thread list renders the other person from these, which
     * is why {@code other} follows a reveal but the bubbles above it do not.
     */
    @Override
    public Anonymity anonymity() {
        return anonymity;
    }

    @Override
    public UUID senderId() {
        return id.getUserId();
    }

    public ThreadParticipantId getId() {
        return id;
    }

    public UUID getThreadId() {
        return id.getThreadId();
    }

    public UUID getUserId() {
        return id.getUserId();
    }

    public Anonymity getAnonymity() {
        return anonymity;
    }

    public boolean isNamed() {
        return anonymity != null && anonymity.level() == AnonymityLevel.NAMED;
    }

    /** [D5] One way, and only forward: from here on this person sends as themselves. */
    public void reveal(Anonymity named, Instant now) {
        this.anonymity = named;
        this.revealedAt = now;
    }

    public Instant getRevealedAt() {
        return revealedAt;
    }

    public long getReadThroughSeq() {
        return readThroughSeq;
    }

    /** The watermark only ever moves forward; an older id is accepted and ignored. */
    public boolean readThrough(long seq) {
        if (seq <= readThroughSeq) {
            return false;
        }
        this.readThroughSeq = seq;
        return true;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
