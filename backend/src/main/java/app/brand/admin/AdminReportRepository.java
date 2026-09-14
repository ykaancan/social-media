package app.brand.admin;

import app.brand.safety.Report;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The admin's view of {@code report}. Separate from {@code ReportRepository} for
 * the same reason {@link AdminUserRepository} is separate from the member one:
 * these queries exist for one screen and must never become the way a member
 * surface reads reports.
 *
 * <p>The queue is newest first — a report an admin has not seen yet is the one at
 * an event that matters, and the oldest-first ordering of the registration queue
 * would bury it.
 */
public interface AdminReportRepository extends JpaRepository<Report, UUID> {

    @Query("select r from Report r where r.status = :status order by r.createdAt desc, r.id desc")
    List<Report> byStatusNewestFirst(@Param("status") String status);

    @Query("select r from Report r order by r.createdAt desc, r.id desc")
    List<Report> allNewestFirst();

    /**
     * Read under the row's write lock, because the decision that follows is
     * allowed only from {@code open}: two admins working the same queue must not
     * both get past the check and both act on one report.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Report r where r.id = :id")
    Optional<Report> findForUpdate(@Param("id") UUID id);
}
