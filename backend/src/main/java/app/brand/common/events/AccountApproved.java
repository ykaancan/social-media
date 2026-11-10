package app.brand.common.events;

import java.util.UUID;

/**
 * [D14] An organisation admin (or a super admin) accepted a pending membership.
 * The push layer tells the person, naming the organisation they asked to join.
 * The name is the one copy argument; it is the organisation's, never a person's.
 */
public record AccountApproved(UUID userId, String organisationName) {
}
