package app.brand.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Membership of one board, and the only place {@code event_moderator} is stored:
 * the role is per-event data, never a column on the account (brief §3, Roles).
 *
 * <p>{@code canManageModerators} is {@code event.creator_id = viewer}, not this
 * flag — a co-moderator shares the queue, not the guest list.
 */
@Entity
@Table(name = "event_member")
@IdClass(EventMemberId.class)
public class EventMember {

    @Id
    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "is_moderator", nullable = false)
    private boolean moderator;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    // There is deliberately no @ManyToOne to AppUser here. `user_id` is half of
    // the composite key; mapping it a second time as an association makes the
    // roster's fetch depend on which rows the persistence context already holds.
    // The roster loads its people by id instead — one extra query, no ambiguity.

    protected EventMember() {
    }

    public static EventMember join(UUID eventId, UUID userId, boolean moderator, Instant now) {
        EventMember member = new EventMember();
        member.eventId = eventId;
        member.userId = userId;
        member.moderator = moderator;
        member.joinedAt = now;
        return member;
    }

    public UUID getEventId() {
        return eventId;
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isModerator() {
        return moderator;
    }

    /** Co-moderators are added and removed in step B-3. */
    public void setModerator(boolean moderator) {
        this.moderator = moderator;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

}
