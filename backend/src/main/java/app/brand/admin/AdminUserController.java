package app.brand.admin;

import app.brand.common.ApiException;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import app.brand.user.AccountStatus;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Brief §4.9 — the admin JSON API behind {@code /admin/index.html} [B11].
 *
 * <p>{@code super_admin} only, and only an {@code approved} one. The check is
 * method security on the class rather than a rule in {@code SecurityConfig}: the
 * role and the status live on the account row, so a promotion, a demotion or a ban
 * takes effect on the next request either way, and the requirement stays next to
 * the code it protects. No token is a 401 from the filter chain; a member's token
 * is a 403 {@code forbidden} [B14]. The status is stated here as well as enforced
 * by {@code ApprovedMemberFilter}, because an admin route losing its status check
 * would be the one mistake nobody sees.
 *
 * <p>The reports queue (content, reporter, audited identity view, dismiss / hide /
 * warn / ban) is step B-5 and belongs beside this controller when it arrives.
 */
@RestController
@RequestMapping("/admin/api")
@PreAuthorize("hasRole('SUPER_ADMIN') and authentication.principal.approved")
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    /** Defaults to the queue the admin opens the page for. {@code all} lists everything. */
    @GetMapping("/users")
    public List<AdminUserDto> list(@RequestParam(name = "status", defaultValue = "pending") String status) {
        return service.list(parseStatus(status));
    }

    @GetMapping("/users/{id}")
    public AdminUserDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping("/users/{id}/approve")
    public AdminUserDto approve(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.approve(admin.id(), id);
    }

    @PostMapping("/users/{id}/reject")
    public AdminUserDto reject(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.reject(admin.id(), id);
    }

    @PostMapping("/users/{id}/ban")
    public AdminUserDto ban(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.ban(admin.id(), id);
    }

    @PostMapping("/users/{id}/promote")
    public AdminUserDto promote(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.promote(admin.id(), id);
    }

    /** {@code null} means "every status"; anything unknown is a 422, not a silent default. */
    private static AccountStatus parseStatus(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (value.equals("all")) {
            return null;
        }
        try {
            return AccountStatus.of(value);
        } catch (IllegalArgumentException ex) {
            throw ApiException.validation("unknown status", "status");
        }
    }
}
