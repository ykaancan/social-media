package app.brand.organisation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganisationRepository extends JpaRepository<Organisation, UUID> {

    /** The super admin's list, oldest first. */
    List<Organisation> findAllByOrderByCreatedAtAscNameAsc();
}
