package app.brand.board;

import app.brand.content.Anonymity;
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
 * One card on a board. Two kinds live in this table and they behave very
 * differently:
 *
 * <ul>
 *   <li>A <b>room post</b> ({@code inboxMessageId == null}) is written to everyone
 *       on the board. In {@code approve_first} it waits in the moderators' queue;
 *       in {@code post_immediately} it publishes at once; and a moderator's own
 *       room post publishes immediately in either mode [D9].</li>
 *   <li>A <b>post addressed to a person</b> carries {@code inboxMessageId} and is
 *       really an inbox message with a card attached. It <b>never</b> enters a
 *       moderation queue in any mode (CLAUDE.md §4.5), and it is published on the
 *       board only while the recipient keeps that message on their wall [D12] —
 *       the recipient curates, not the board.</li>
 * </ul>
 *
 * <p>[B6] The five-second undo is these three columns, not a timer:
 * {@code rejected_by}, {@code rejection_undo_token}, {@code rejection_undo_until}.
 * While the window is open the post is still {@link BoardPostState#PENDING} — the
 * sender is not told anything yet — but it is out of the queue so the moderator
 * cannot act on it twice. Closing the window is a state change, applied lazily on
 * the next board read and by the housekeeping job [B5], so a stopped scheduler
 * can delay a notification but never change what anyone sees.
 *
 * <p>{@code sender_id} is a column here and never leaves the server: the board
 * DTOs carry a {@code MessageSenderDto} built from {@link #anonymity} alone.
 */
@Entity
@Table(name = "board_post")
public class BoardPost {

    public static final int TEXT_MAX = 280;

    /** {@code approval_kind} values, matching the CHECK on the column. */
    public static final String AUTO_APPROVED_BY_AUTHOR = "auto_approved_by_author";
    public static final String IMMEDIATE = "immediate";
    public static final String MODERATOR = "moderator";

    /** {@code rejection_reason} values. [D4] {@code board_closed} is never a moderator's doing. */
    public static final String REASON_MODERATOR = "moderator";
    public static final String REASON_BOARD_CLOSED = "board_closed";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;

    /** The server always knows the sender. No board DTO ever carries this. */
    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "text", nullable = false, updatable = false)
    private String text;

    /** [B4] The level and hints this post was sent at, frozen. Never rewritten [D5]. */
    @Embedded
    private Anonymity anonymity;

    @Column(name = "state", nullable = false)
    private BoardPostState state;

    /** [D9] How it got published, when it did. Null while pending and when rejected. */
    @Column(name = "approval_kind")
    private String approvalKind;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "rejected_by")
    private UUID rejectedBy;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    @Column(name = "rejection_undo_token")
    private String rejectionUndoToken;

    @Column(name = "rejection_undo_until")
    private Instant rejectionUndoUntil;

    @Column(name = "hidden_at")
    private Instant hiddenAt;

    @Column(name = "hidden_by")
    private UUID hiddenBy;

    /** Set for a post addressed to a person; that message decides whether this is published. */
    @Column(name = "inbox_message_id", updatable = false)
    private UUID inboxMessageId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected BoardPost() {
    }

    /** A post to the room. {@code approvalKind} is null exactly when {@code state} is pending. */
    public static BoardPost toRoom(UUID eventId,
                                   UUID senderId,
                                   String text,
                                   Anonymity anonymity,
                                   BoardPostState state,
                                   String approvalKind,
                                   Instant now) {
        BoardPost post = new BoardPost();
        post.eventId = eventId;
        post.senderId = senderId;
        post.text = text;
        post.anonymity = anonymity;
        post.state = state;
        post.approvalKind = approvalKind;
        post.createdAt = now;
        return post;
    }

    /**
     * The card for a post addressed to a person, copied from the message that was
     * just delivered so the two can never disagree about what was written or when.
     *
     * <p>{@code approval_kind} stays null: nobody approved this — it is published
     * or not by the recipient's own state [D12].
     */
    public static BoardPost toPerson(UUID eventId,
                                     UUID senderId,
                                     String text,
                                     Anonymity anonymity,
                                     UUID inboxMessageId,
                                     Instant createdAt) {
        BoardPost post = new BoardPost();
        post.eventId = eventId;
        post.senderId = senderId;
        post.text = text;
        post.anonymity = anonymity;
        post.state = BoardPostState.APPROVED;
        post.inboxMessageId = inboxMessageId;
        post.createdAt = createdAt;
        return post;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEventId() {
        return eventId;
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

    public BoardPostState getState() {
        return state;
    }

    public String getApprovalKind() {
        return approvalKind;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public UUID getRejectedBy() {
        return rejectedBy;
    }

    public Instant getRejectedAt() {
        return rejectedAt;
    }

    public String getRejectionUndoToken() {
        return rejectionUndoToken;
    }

    public Instant getRejectionUndoUntil() {
        return rejectionUndoUntil;
    }

    public Instant getHiddenAt() {
        return hiddenAt;
    }

    public UUID getHiddenBy() {
        return hiddenBy;
    }

    public UUID getInboxMessageId() {
        return inboxMessageId;
    }

    public boolean isRoomPost() {
        return inboxMessageId == null;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** True while a rejection can still be taken back [B6]: out of the queue, still pending. */
    public boolean hasOpenUndoWindow() {
        return rejectionUndoUntil != null;
    }

    /** Released from the queue by a moderator, or published on arrival [D9]. */
    public void approve(String approvalKind) {
        this.state = BoardPostState.APPROVED;
        this.approvalKind = approvalKind;
        clearUndo();
    }

    /**
     * [B6] Start the five-second window. The post stays pending: the sender must
     * not learn about a rejection that may be a mis-tap.
     */
    public void beginRejection(UUID moderatorId, String token, Instant until) {
        this.rejectedBy = moderatorId;
        this.rejectionUndoToken = token;
        this.rejectionUndoUntil = until;
    }

    /** The undo the moderator asked for: back into the queue, as if nothing happened. */
    public void cancelRejection() {
        clearUndo();
    }

    /**
     * [D8] Final. {@code rejectedBy} survives a moderator rejection as the audit of
     * who did it; a {@code board_closed} rejection had no actor and clears it.
     */
    public void finaliseRejection(String reason, UUID rejectedBy, Instant at) {
        this.state = BoardPostState.REJECTED;
        this.rejectionReason = reason;
        this.rejectedBy = rejectedBy;
        this.rejectedAt = at;
        this.rejectionUndoToken = null;
        this.rejectionUndoUntil = null;
    }

    /** [D6]-adjacent: hidden, never deleted. Room posts only; a person post is not the board's. */
    public void hide(UUID moderatorId, Instant now) {
        this.hiddenAt = now;
        this.hiddenBy = moderatorId;
    }

    private void clearUndo() {
        this.rejectedBy = null;
        this.rejectionUndoToken = null;
        this.rejectionUndoUntil = null;
    }
}
