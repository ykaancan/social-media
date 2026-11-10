package app.brand.user;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    /** Register and login both compare case-insensitively; so does the unique index. */
    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /**
     * The account row, locked until the transaction ends. Used where two requests
     * for the same account must run one after the other — the confirmation resend
     * [D18], so two calls at the same instant cannot both send a mail.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from AppUser u where u.id = :id")
    Optional<AppUser> findForUpdate(@Param("id") UUID id);

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
