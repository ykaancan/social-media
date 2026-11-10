package app.brand.organisation;

import java.io.Serializable;
import java.util.UUID;

/** Composite key of {@link OrganisationMember}: {@code (organisation_id, user_id)}. */
public record OrganisationMemberId(UUID organisationId, UUID userId) implements Serializable {

    /** JPA needs a no-arg form for an {@code @IdClass}. */
    public OrganisationMemberId() {
        this(null, null);
    }
}
