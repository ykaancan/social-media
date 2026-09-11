package app.brand.safety;

import app.brand.content.Anonymity;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
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
 * [D6] Block never deletes another person's content. This row is the whole of it:
 * the server refuses every write from {@code blocked} to {@code blocker} in every
 * surface, and the blocker's inbox, wall and thread list filter the blocked user
 * out. Board posts stay on the board. The blocked user is not told.
 *
 * <p>Block is issued <b>by message id</b>, so the client can block an anonymous
 * sender without ever learning who they are. The {@code display_*} columns freeze
 * the identity that person had <em>already allowed</em> at the moment of the
 * block, so the Blocked list can render a row without ever going back to the
 * user's current identity — a block placed on an anonymous message stays an
 * anonymous row forever, even if that person later posts under their name.
 *
 * <p>{@code id} is the opaque {@code BlockedEntry.id} the app unblocks with. It is
 * never a user id.
 */
@Entity
@Table(name = "block")
public class Block {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "blocker_id", nullable = false, updatable = false)
    private UUID blockerId;

    @Column(name = "blocked_id", nullable = false, updatable = false)
    private UUID blockedId;

    /** The same anonymity columns [B4] every content row carries, under their own names. */
    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "level", column = @Column(name = "display_level", nullable = false)),
            @AttributeOverride(name = "hintSection", column = @Column(name = "display_section", nullable = false)),
            @AttributeOverride(name = "hintCountry", column = @Column(name = "display_country", nullable = false)),
            @AttributeOverride(name = "hintLetter", column = @Column(name = "display_letter", nullable = false)),
            @AttributeOverride(name = "senderSectionId", column = @Column(name = "display_section_id"))
    })
    private Anonymity display;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Block() {
    }

    public static Block of(UUID blockerId, UUID blockedId, Anonymity display, Instant now) {
        Block block = new Block();
        block.blockerId = blockerId;
        block.blockedId = blockedId;
        block.display = display;
        block.createdAt = now;
        return block;
    }

    public UUID getId() {
        return id;
    }

    public UUID getBlockerId() {
        return blockerId;
    }

    public UUID getBlockedId() {
        return blockedId;
    }

    public Anonymity getDisplay() {
        return display;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
