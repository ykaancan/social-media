package app.brand.user;

/**
 * {@code Me} in {@code types.ts} — the signed-in user, and the only DTO that
 * carries an email address.
 *
 * <p>{@code name}, {@code bio}, {@code avatarUrl} and {@code section} are null
 * while the account is {@code incomplete} and Jackson's {@code non_null}
 * inclusion drops them, so the client sees the fields as absent, exactly as the
 * optional properties in {@code types.ts} declare.
 */
public record MeDto(
        String id,
        String email,
        AccountStatus status,
        Role role,
        String name,
        String bio,
        String avatarUrl,
        SectionRefDto section) {
}
