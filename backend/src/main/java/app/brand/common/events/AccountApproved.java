package app.brand.common.events;

import java.util.UUID;

/** An admin approved a pending account. The push layer tells the person. */
public record AccountApproved(UUID userId) {
}
