package app.brand.user;

import app.brand.organisation.MembershipDtos.MembershipDto;
import java.util.List;

/**
 * {@code Me} in {@code types.ts} — the signed-in user, and the only DTO that
 * carries an email address.
 *
 * <p>{@code name}, {@code bio}, {@code avatarUrl} and {@code section} are null
 * while the account is {@code incomplete} and Jackson's {@code non_null}
 * inclusion drops them, so the client sees the fields as absent, exactly as the
 * optional properties in {@code types.ts} declare.
 *
 * <p>[D18] {@code emailConfirmed} is a plain boolean, so it is always present:
 * {@code false} until the confirmation link is opened ({@code Me} in
 * {@code tenant.ts}).
 *
 * <p>[D14] {@code memberships} lists every membership of this account in every
 * status, and is always present (an empty list for none). {@code section} stays
 * until step T-2 moves every section read to the membership.
 */
public record MeDto(
        String id,
        String email,
        boolean emailConfirmed,
        AccountStatus status,
        Role role,
        String name,
        String bio,
        String avatarUrl,
        SectionRefDto section,
        List<MembershipDto> memberships) {
}
