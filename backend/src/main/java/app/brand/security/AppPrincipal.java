package app.brand.security;

import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.Role;
import java.util.UUID;

/**
 * Who is calling. Built fresh from the {@code app_user} row on every request, not
 * from claims in the token: an approval, a ban or a promotion must take effect at
 * once and not wait out the 15-minute access token.
 *
 * <p>{@code sessionId} is the one thing that does come from the token — the
 * {@code sid} claim, naming the refresh row this access token was issued beside,
 * so {@code POST /auth/logout} can end this session and not the person's other
 * devices. It is {@code null} for a token issued without one.
 */
public record AppPrincipal(UUID id, Role role, AccountStatus status, UUID sessionId) {

    public static AppPrincipal of(AppUser user) {
        return of(user, null);
    }

    public static AppPrincipal of(AppUser user, UUID sessionId) {
        return new AppPrincipal(user.getId(), user.getRole(), user.getStatus(), sessionId);
    }

    public boolean isApproved() {
        return status == AccountStatus.APPROVED;
    }

    public boolean isSuperAdmin() {
        return role == Role.SUPER_ADMIN;
    }
}
