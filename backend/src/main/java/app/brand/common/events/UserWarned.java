package app.brand.common.events;

import java.util.UUID;

/** An admin warned a member from the reports queue. The push layer delivers the warning. */
public record UserWarned(UUID userId, UUID reportId) {
}
