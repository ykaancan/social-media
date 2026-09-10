package app.brand.security;

import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.Role;
import java.util.UUID;

/**
 * Who is calling. Built fresh from the {@code app_user} row on every request, not
 * from claims in the token: an approval, a ban or a promotion must take effect at
 * once and not wait out the 15-minute access token.
 */
public record AppPrincipal(UUID id, Role role, AccountStatus status) {

    public static AppPrincipal of(AppUser user) {
        return new AppPrincipal(user.getId(), user.getRole(), user.getStatus());
    }

    public boolean isApproved() {
        return status == AccountStatus.APPROVED;
    }

    public boolean isSuperAdmin() {
        return role == Role.SUPER_ADMIN;
    }
}
