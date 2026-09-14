package app.brand.thread;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A private conversation between exactly two people (CLAUDE.md §4.7).
 *
 * <p>Stage 1 has no cold DMs (§6): a thread only ever exists because someone
 * answered something — an inbox message they received, or a published board post.
 * That origin is stored here and is what the client shows above the first bubble,
 * so the row keeps the origin's id and its event for the {@code source} label.
 *
 * <p>Nothing about <em>who</em> is in the thread lives on this row. The two
 * {@code thread_participant} rows carry that, together with the level each side
 * is currently sending at [D5]; a message's own level is on the message.
 *
 * <p>The class is called {@code Thread} on purpose — it is the product's word and
 * the table's name. Inside this package it shadows {@link java.lang.Thread}, which
 * nothing here needs.
 */
@Entity
@Table(name = "thread")
public class Thread {

    /** {@code origin_kind} values, matching the CHECK constraint on the column. */
    public static final String INBOX = "inbox";
    public static final String POST = "post";

    /** {@code text} on a thread message; the composer's limit for a reply. */
    public static final int TEXT_MAX = 500;

    /** The limit on the message that opens a thread — it is a reply to a card. */
    public static final int OPENING_TEXT_MAX = 280;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "origin_kind", nullable = false, updatable = false)
    private String originKind;

    @Column(name = "origin_inbox_message_id", updatable = false)
    private UUID originInboxMessageId;

    @Column(name = "origin_post_id", updatable = false)
    private UUID originPostId;

    /** The event the origin was written at; {@code ThreadSummary.source} is its name. */
    @Column(name = "event_id", updatable = false)
    private UUID eventId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Bumped by every appended row, so the thread list orders on one column [B2]. */
    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt;

    protected Thread() {
    }

    public static Thread fromInboxMessage(UUID messageId, UUID eventId, Instant now) {
        return of(INBOX, messageId, null, eventId, now);
    }

    public static Thread fromBoardPost(UUID postId, UUID eventId, Instant now) {
        return of(POST, null, postId, eventId, now);
    }

    private static Thread of(String kind, UUID messageId, UUID postId, UUID eventId, Instant now) {
        Thread thread = new Thread();
        thread.originKind = kind;
        thread.originInboxMessageId = messageId;
        thread.originPostId = postId;
        thread.eventId = eventId;
        thread.createdAt = now;
        thread.lastMessageAt = now;
        return thread;
    }

    public UUID getId() {
        return id;
    }

    public String getOriginKind() {
        return originKind;
    }

    public UUID getOriginInboxMessageId() {
        return originInboxMessageId;
    }

    public UUID getOriginPostId() {
        return originPostId;
    }

    /** The origin row's id, whichever kind it is — what {@code origin.id} carries. */
    public UUID getOriginId() {
        return INBOX.equals(originKind) ? originInboxMessageId : originPostId;
    }

    public UUID getEventId() {
        return eventId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastMessageAt() {
        return lastMessageAt;
    }

    public void touch(Instant now) {
        this.lastMessageAt = now;
    }
}
