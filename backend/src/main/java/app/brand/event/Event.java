package app.brand.event;

import app.brand.section.Section;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A time-boxed board. There is no {@code status} column [B5]/[D4] — see
 * {@link EventStatus}.
 *
 * <p>{@code section} is always the creator's section at creation time [D11]: the
 * DTO shows it only when {@code scope = section}, but the country is read from it
 * either way, because country is not a field of its own anywhere in this product.
 */
@Entity
@Table(name = "event")
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    /** {@code section | national}. */
    @Column(name = "scope", nullable = false)
    private String scope;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "section_id", nullable = false)
    private Section section;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(name = "cover", nullable = false)
    private String cover;

    /** {@code approve_first | post_immediately}. */
    @Column(name = "board_mode", nullable = false)
    private String boardMode;

    @Column(name = "join_code", nullable = false, updatable = false)
    private String joinCode;

    /** Cleared when the creator deletes their account; the event and its posts survive. */
    @Column(name = "creator_id")
    private UUID creatorId;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Event() {
    }

    public static Event create(String name,
                               String scope,
                               Section section,
                               Instant startsAt,
                               Instant endsAt,
                               String cover,
                               String boardMode,
                               String joinCode,
                               UUID creatorId,
                               Instant now) {
        Event event = new Event();
        event.name = name;
        event.scope = scope;
        event.section = section;
        event.startsAt = startsAt;
        event.endsAt = endsAt;
        event.cover = cover;
        event.boardMode = boardMode;
        event.joinCode = joinCode;
        event.creatorId = creatorId;
        event.createdAt = now;
        return event;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getScope() {
        return scope;
    }

    public Section getSection() {
        return section;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    /** Board controls (step B-3) may move the end time; the start never moves. */
    public void setEndsAt(Instant endsAt) {
        this.endsAt = endsAt;
    }

    public String getCover() {
        return cover;
    }

    public String getBoardMode() {
        return boardMode;
    }

    public void setBoardMode(String boardMode) {
        this.boardMode = boardMode;
    }

    public String getJoinCode() {
        return joinCode;
    }

    public UUID getCreatorId() {
        return creatorId;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public UUID getClosedBy() {
        return closedBy;
    }

    /** [D4] Closing archives immediately and stamps who did it; there is no reopen. */
    public void close(UUID moderatorId, Instant now) {
        this.closedAt = now;
        this.closedBy = moderatorId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
