package app.brand.board;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * One person's reaction to one post. The primary key is {@code (post, user)}, so
 * reacting again replaces rather than accumulates and the counts the board shows
 * are people, not taps.
 *
 * <p>The emoji set lives here and not in a CHECK constraint: one of the five
 * carries a variation selector and {@code V1__schema.sql} can never be edited
 * once applied.
 */
@Entity
@Table(name = "post_reaction")
@IdClass(PostReactionId.class)
public class PostReaction {

    /** CLAUDE.md §4.5 "single emoji set". {@code ❤️} is U+2764 U+FE0F — compare the whole string. */
    public static final Set<String> EMOJI = Set.of("🔥", "😂", "❤️",
            "👀", "😳");

    @Id
    @Column(name = "post_id", nullable = false, updatable = false)
    private UUID postId;

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "emoji", nullable = false)
    private String emoji;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PostReaction() {
    }

    public static PostReaction of(UUID postId, UUID userId, String emoji, Instant now) {
        PostReaction reaction = new PostReaction();
        reaction.postId = postId;
        reaction.userId = userId;
        reaction.emoji = emoji;
        reaction.createdAt = now;
        return reaction;
    }

    public UUID getPostId() {
        return postId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEmoji() {
        return emoji;
    }

    public void setEmoji(String emoji) {
        this.emoji = emoji;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
