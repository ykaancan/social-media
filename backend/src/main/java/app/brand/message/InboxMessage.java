package app.brand.message;

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
 * Something one person wrote to another: the row behind the Inbox and, once the
 * recipient approves it, behind the Wall.
 *
 * <p>Principle 2 is the whole design: anything written <em>to</em> a person lands
 * privately first and they choose what becomes public. So there is no separate
 * "wall message" table — the wall is exactly {@code state = 'approved'} with
 * {@code deleted_at is null} [D12], and moving a card on or off it changes one
 * column.
 *
 * <p>Three columns are internal and never leave the server: {@code muted_match}
 * and {@code push_suppressed} [D10] — the sender must never learn that a muted
 * word caught them — and {@code screening_flag} [B9], which is the admin's
 * flagged list.
 *
 * <p>{@code event_id} is nullable in the schema but is always set here: a wall is
 * only reachable through an event both people joined, and the access check needs
 * the context the message was written from (B-1 record).
 */
@Entity
@Table(name = "inbox_message")
public class InboxMessage implements SenderRow {

    public static final int TEXT_MAX = 280;

    /** {@code screening_flag}: [B9] a soft match the sender acknowledged and we delivered. */
    public static final String SOFT = "soft";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** The server always knows the sender. No member DTO ever carries this. */
    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "recipient_id", nullable = false, updatable = false)
    private UUID recipientId;

    @Column(name = "event_id", updatable = false)
    private UUID eventId;

    @Column(name = "text", nullable = false, updatable = false)
    private String text;

    /** [B4] The level and hints this message was sent at, frozen. Never rewritten. */
    @Embedded
    private Anonymity anonymity;

    @Column(name = "state", nullable = false)
    private MessageState state;

    @Column(name = "state_changed_at", nullable = false)
    private Instant stateChangedAt;

    /** True when the message arrived from a board post addressed to this person. */
    @Column(name = "from_board", nullable = false, updatable = false)
    private boolean fromBoard;

    /** [D10] Internal. A muted word filed this to {@code private}; the sender is never told. */
    @Column(name = "muted_match", nullable = false, updatable = false)
    private boolean mutedMatch;

    /** [D10] Internal. Suppressed by a muted match, or by the recipient's own toggle. */
    @Column(name = "push_suppressed", nullable = false, updatable = false)
    private boolean pushSuppressed;

    /** [B9] Internal. {@code soft} when delivered with an acknowledged soft match. */
    @Column(name = "screening_flag", updatable = false)
    private String screeningFlag;

    /** [D12] Soft delete: a reported message survives the recipient deleting it. */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected InboxMessage() {
    }

    public static InboxMessage deliver(UUID senderId,
                                       UUID recipientId,
                                       UUID eventId,
                                       String text,
                                       Anonymity anonymity,
                                       MessageState state,
                                       boolean fromBoard,
                                       boolean mutedMatch,
                                       boolean pushSuppressed,
                                       String screeningFlag,
                                       Instant now) {
        InboxMessage message = new InboxMessage();
        message.senderId = senderId;
        message.recipientId = recipientId;
        message.eventId = eventId;
        message.text = text;
        message.anonymity = anonymity;
        message.state = state;
        message.stateChangedAt = now;
        message.fromBoard = fromBoard;
        message.mutedMatch = mutedMatch;
        message.pushSuppressed = pushSuppressed;
        message.screeningFlag = screeningFlag;
        message.createdAt = now;
        return message;
    }

    /** {@link SenderRow}: the card is rendered from these two, and never from a sender id. */
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

    public UUID getSenderId() {
        return senderId;
    }

    public UUID getRecipientId() {
        return recipientId;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getText() {
        return text;
    }

    public Anonymity getAnonymity() {
        return anonymity;
    }

    public MessageState getState() {
        return state;
    }

    /** [D12] Every transition is allowed and reversible; the stamp says when it last moved. */
    public void moveTo(MessageState next, Instant now) {
        this.state = next;
        this.stateChangedAt = now;
    }

    public Instant getStateChangedAt() {
        return stateChangedAt;
    }

    public boolean isFromBoard() {
        return fromBoard;
    }

    public boolean isMutedMatch() {
        return mutedMatch;
    }

    public boolean isPushSuppressed() {
        return pushSuppressed;
    }

    public String getScreeningFlag() {
        return screeningFlag;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    /** [D12]/[D6] Hidden, not destroyed: a report filed before this still shows the admin everything. */
    public void softDelete(Instant now) {
        this.deletedAt = now;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
