package app.brand.organisation;

import app.brand.user.SectionRefDto;
import com.fasterxml.jackson.annotation.JsonInclude;

/** The membership shapes of {@code app/src/api/tenant.ts}. */
public final class MembershipDtos {

    private MembershipDtos() {
    }

    /** {@code MembershipRequest}: {@code POST /organisations/join} [D17]. */
    public record MembershipRequestDto(String code, String sectionId) {
    }

    /** {@code OrganisationRef}. */
    public record OrganisationRefDto(String id, String name, boolean hasSections) {

        public static OrganisationRefDto of(Organisation organisation) {
            return new OrganisationRefDto(organisation.getId().toString(), organisation.getName(),
                    organisation.hasSections());
        }
    }

    /**
     * {@code Membership}: the signed-in user's place in one organisation, never
     * sent about anyone else.
     *
     * <p>{@code section} and {@code pendingEventName} are optional and dropped when
     * null by the global {@code non_null} inclusion. {@code sectionChangeAvailableAt}
     * is {@code string | null} in the contract — not an optional key — so it is
     * always emitted, exactly like the same field on {@code AccountSettings}.
     */
    public record MembershipDto(
            OrganisationRefDto organisation,
            MembershipStatus status,
            MembershipRole role,
            SectionRefDto section,
            boolean canCreateEvents,
            @JsonInclude(JsonInclude.Include.ALWAYS) String sectionChangeAvailableAt,
            String pendingEventName) {
    }
}
