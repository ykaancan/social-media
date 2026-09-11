package app.brand.board;

import java.io.Serializable;
import java.util.UUID;

/** Composite key of {@link PostReaction}: {@code (post_id, user_id)} — one reaction per person. */
public record PostReactionId(UUID postId, UUID userId) implements Serializable {

    /** JPA needs a no-arg form for an {@code @IdClass}. */
    public PostReactionId() {
        this(null, null);
    }
}
