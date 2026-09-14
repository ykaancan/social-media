package app.brand.event;

import java.io.Serializable;
import java.util.UUID;

/** Composite key of {@link EventMember}: {@code (event_id, user_id)}. */
public record EventMemberId(UUID eventId, UUID userId) implements Serializable {

    /** JPA needs a no-arg form for an {@code @IdClass}. */
    public EventMemberId() {
        this(null, null);
    }
}
