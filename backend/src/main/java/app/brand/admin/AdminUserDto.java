package app.brand.admin;

import app.brand.user.AccountStatus;
import app.brand.user.Role;
import java.time.Instant;

/**
 * One row of the admin queue.
 *
 * <p>This is the only DTO in the product that shows an email or a phone number to
 * somebody other than their owner, and it is the point of the screen: brief §4.9
 * asks the super admin to decide whether a registration is a real person. Nothing
 * here reveals the identity behind a piece of anonymous content — that is the
 * reports queue in step B-5, and it writes an {@code identity_view} audit row.
 *
 * <p>[D15] No {@code section}: a section belongs to a membership in one
 * organisation, not to the account.
 */
public record AdminUserDto(
        String id,
        String email,
        String phone,
        String name,
        String bio,
        String avatarUrl,
        AccountStatus status,
        Role role,
        Instant createdAt,
        Instant submittedAt,
        Instant approvedAt) {
}
