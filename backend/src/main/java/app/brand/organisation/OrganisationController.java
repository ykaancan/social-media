package app.brand.organisation;

import app.brand.organisation.MembershipDtos.MembershipDto;
import app.brand.organisation.MembershipDtos.MembershipRequestDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /organisations/join} [D17] — confirmed, active accounts only
 * ({@code ActiveAccountFilter}). The organisation's section list,
 * {@code GET /organisations/{id}/sections}, is served by {@code SectionController}.
 */
@RestController
public class OrganisationController {

    private final OrganisationJoinService joins;

    public OrganisationController(OrganisationJoinService joins) {
        this.joins = joins;
    }

    /** 200 {@code Membership}; 404 for an unknown code; 422 on {@code sectionId}. */
    @PostMapping("/organisations/join")
    public MembershipDto join(@CurrentUser AppPrincipal principal,
                              @RequestBody(required = false) MembershipRequestDto request) {
        return joins.join(principal.id(),
                request == null ? null : request.code(),
                request == null ? null : request.sectionId());
    }
}
