package app.brand.admin;

import app.brand.admin.AdminOrganisationDtos.AdminOrganisationMemberDto;
import app.brand.common.ApiException;
import app.brand.organisation.MembershipStatus;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
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
 * [D14] An organisation's member queue: the {@code organisation admin of {id}, or
 * super_admin} block of {@code app/src/api/tenant.ts}.
 *
 * <p>Method security here only requires an {@code active} account (the
 * access filter has already required a confirmed email [D18]). Whether the caller
 * may see <em>this</em> organisation is decided by
 * {@code AdminOrganisationService.requireAdminOf}: a super admin, or an approved
 * admin of it; anyone else gets {@code 404}, never {@code 403}, so an organisation
 * id is not something to probe for [B14]. These three routes are the only
 * {@code /admin/api/**} routes an organisation admin reaches [D19].
 */
@RestController
@RequestMapping("/admin/api/organisations/{id}/members")
@PreAuthorize("authentication.principal.active")
public class AdminOrganisationMemberController {

    private final AdminOrganisationService service;

    public AdminOrganisationMemberController(AdminOrganisationService service) {
        this.service = service;
    }

    /** {@code status} defaults to {@code pending}; anything but the three statuses is a 422. */
    @GetMapping
    public List<AdminOrganisationMemberDto> list(@CurrentUser AppPrincipal caller,
                                                 @PathVariable UUID id,
                                                 @RequestParam(name = "status", defaultValue = "pending") String status) {
        return service.members(caller, id, parseStatus(status));
    }

    @PostMapping("/{userId}/approve")
    public AdminOrganisationMemberDto approve(@CurrentUser AppPrincipal caller,
                                              @PathVariable UUID id,
                                              @PathVariable UUID userId) {
        return service.approve(caller, id, userId);
    }

    @PostMapping("/{userId}/reject")
    public AdminOrganisationMemberDto reject(@CurrentUser AppPrincipal caller,
                                             @PathVariable UUID id,
                                             @PathVariable UUID userId) {
        return service.reject(caller, id, userId);
    }

    private static MembershipStatus parseStatus(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "pending" -> MembershipStatus.PENDING;
            case "approved" -> MembershipStatus.APPROVED;
            case "rejected" -> MembershipStatus.REJECTED;
            default -> throw ApiException.validation("unknown status", "status");
        };
    }
}
