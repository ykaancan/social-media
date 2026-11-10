package app.brand.organisation;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganisationMemberRepository extends JpaRepository<OrganisationMember, OrganisationMemberId> {

    Optional<OrganisationMember> findByOrganisationIdAndUserId(UUID organisationId, UUID userId);

    /**
     * The membership row, locked until the transaction ends, so two requests about
     * the same membership ({@code POST /organisations/join} twice at once) run one
     * after the other [D17].
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from OrganisationMember m where m.organisationId = :organisationId and m.userId = :userId")
    Optional<OrganisationMember> findForUpdate(@Param("organisationId") UUID organisationId,
                                               @Param("userId") UUID userId);

    /** Every membership of one account, any status: {@code Me.memberships}. */
    List<OrganisationMember> findByUserIdOrderByCreatedAtAsc(UUID userId);

    /** [D15] Some people's memberships in one organisation, in one status: {@code MembershipSections}. */
    List<OrganisationMember> findByOrganisationIdAndStatusAndUserIdIn(UUID organisationId,
                                                                      MembershipStatus status,
                                                                      Collection<UUID> userIds);

    /** One organisation's members in one status, oldest submission first. */
    List<OrganisationMember> findByOrganisationIdAndStatusOrderBySubmittedAtAsc(UUID organisationId,
                                                                               MembershipStatus status);
}
