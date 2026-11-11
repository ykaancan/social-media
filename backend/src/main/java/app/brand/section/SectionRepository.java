package app.brand.section;

import app.brand.organisation.MembershipStatus;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SectionRepository extends JpaRepository<Section, UUID> {

    /** [D15] One organisation's sections, for {@code GET /organisations/{id}/sections}. */
    List<Section> findByOrganisationId(UUID organisationId);

    /**
     * [D15] Members per section of one organisation, in one pass, for
     * {@code GET /organisations/{id}/sections}. A person counts in a section when
     * their membership in that organisation has that section and the given
     * membership status, and their account has the given account status.
     *
     * <p>Sections nobody has joined are simply absent from the result and read as
     * 0 — a real count, not a placeholder.
     */
    @Query("""
            select new app.brand.section.SectionMemberCount(m.sectionId, count(m))
            from OrganisationMember m, AppUser u
            where u.id = m.userId
              and m.organisationId = :organisationId
              and m.status = :membershipStatus
              and u.status = :accountStatus
              and m.sectionId is not null
            group by m.sectionId
            """)
    List<SectionMemberCount> countMembers(@Param("organisationId") UUID organisationId,
                                          @Param("membershipStatus") MembershipStatus membershipStatus,
                                          @Param("accountStatus") AccountStatus accountStatus);

    /**
     * [D15] The accounts a section roster is built from: membership in the
     * section's organisation with this section and the given membership status,
     * account in the given account status.
     *
     * <p>Ordering is done in Java against the normalised name, because "Boğaziçi"
     * and "Bogazici" have to sort together and the database collation is not the
     * same normaliser the search uses.
     */
    @Query("""
            select u
            from AppUser u, OrganisationMember m
            where m.userId = u.id
              and m.sectionId = :sectionId
              and m.status = :membershipStatus
              and u.status = :accountStatus
            """)
    List<AppUser> findMembers(@Param("sectionId") UUID sectionId,
                              @Param("membershipStatus") MembershipStatus membershipStatus,
                              @Param("accountStatus") AccountStatus accountStatus);
}
