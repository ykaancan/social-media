package app.brand.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    /** Register and login both compare case-insensitively; so does the unique index. */
    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /**
     * The members a section roster is built from. Only {@code approved} accounts
     * are people in the network — a pending account is not yet in the roster of
     * anyone but themselves.
     *
     * <p>Ordering is done in Java against the normalised name, because "Boğaziçi"
     * and "Bogazici" have to sort together and the database collation is not the
     * same normaliser the search uses.
     */
    List<AppUser> findBySection_IdAndStatus(UUID sectionId, AccountStatus status);
}
