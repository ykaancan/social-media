package app.brand.organisation;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganisationMemberRepository extends JpaRepository<OrganisationMember, OrganisationMemberId> {

    Optional<OrganisationMember> findByOrganisationIdAndUserId(UUID organisationId, UUID userId);

    /** Every membership of one account, any status: {@code Me.memberships}. */
    List<OrganisationMember> findByUserIdOrderByCreatedAtAsc(UUID userId);

    /** One organisation's members in one status, oldest submission first. */
    List<OrganisationMember> findByOrganisationIdAndStatusOrderBySubmittedAtAsc(UUID organisationId,
                                                                               MembershipStatus status);
}
