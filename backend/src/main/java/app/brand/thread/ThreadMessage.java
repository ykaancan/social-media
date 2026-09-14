package app.brand.thread;

import app.brand.content.Anonymity;
import app.brand.content.SenderRow;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One bubble.
 *
 * <p>[D5] The embedded {@link Anonymity} is the level this message was
 * <b>sent at</b> and is never rewritten. A reveal replaces the sender's
 * {@code thread_participant} row and appends a {@link #REVEALED} system row; every
 * bubble above it keeps the level it was written at, which is the whole promise
 * anonymity makes to the person who used it.
 *
 * <p>{@code seq} is per thread and starts at 1 [B2], so the watermark's default 0
 * means "nothing read" without a row existing for it. The unique index on
 * {@code (thread_id, seq)} is the backstop; {@code ThreadService} takes the
 * thread row's write lock before it picks the next number.
 */
@Entity
@Table(name = "thread_message")
public class ThreadMessage implements SenderRow {

    /** {@code system} value: appended by {@code POST /threads/{id}/reveal}. */
    public static final String REVEALED = "revealed";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "thread_id", nullable = false, updatable = false)
    private UUID threadId;

    @Column(name = "seq", nullable = false, updatable = false)
    private long seq;

    /** The server always knows the sender. No thread DTO ever carries this. */
    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "text", nullable = false, updatable = false)
    private String text;

    /** [D5] Frozen at send time. The one thing a reveal must not touch. */
    @Embedded
    private Anonymity anonymity;

    /** Null for an ordinary message; {@link #REVEALED} for the system row. */
    @Column(name = "system", updatable = false)
    private String system;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ThreadMessage() {
    }

    public static ThreadMessage of(UUID threadId,
                                   long seq,
                                   UUID senderId,
                                   String text,
                                   Anonymity anonymity,
                                   String system,
                                   Instant now) {
        ThreadMessage message = new ThreadMessage();
        message.threadId = threadId;
        message.seq = seq;
        message.senderId = senderId;
        message.text = text;
        message.anonymity = anonymity;
        message.system = system;
        message.createdAt = now;
        return message;
    }

    @Override
    public Anonymity anonymity() {
        return anonymity;
    }

    @Override
    public UUID senderId() {
        return senderId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getThreadId() {
        return threadId;
    }

    public long getSeq() {
        return seq;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public String getText() {
        return text;
    }

    public Anonymity getAnonymity() {
        return anonymity;
    }

    public String getSystem() {
        return system;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
