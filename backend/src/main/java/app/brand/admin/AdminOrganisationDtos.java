package app.brand.admin;

import app.brand.organisation.EventCreation;
import app.brand.organisation.MembershipStatus;
import app.brand.user.SectionRefDto;
import java.time.Instant;

/** The admin page's organisation shapes [D13]/[D14]. */
public final class AdminOrganisationDtos {

    private AdminOrganisationDtos() {
    }

    /** One organisation as the super admin's list shows it: its own columns, nothing else. */
    public record AdminOrganisationDto(
            String id,
            String name,
            boolean approvalRequired,
            boolean hasSections,
            EventCreation eventCreation,
            Instant createdAt) {
    }

    /**
     * One row of {@code GET /admin/api/organisations/{id}/members}. Exactly these
     * seven fields, for an organisation admin and a super admin alike
     * (TENANT_PLAN.md P7, decided 2026-11-09): <b>never</b> email, never phone —
     * an organisation admin is a client, not us. {@code avatarUrl} and
     * {@code section} are absent when null.
     */
    public record AdminOrganisationMemberDto(
            String userId,
            String name,
            String avatarUrl,
            String bio,
            SectionRefDto section,
            MembershipStatus status,
            Instant submittedAt) {
    }
}
