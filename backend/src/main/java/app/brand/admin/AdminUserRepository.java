package app.brand.admin;

import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The admin's own view of {@code app_user}. Separate from {@code AppUserRepository}
 * because these queries exist for one screen and must not become the way the rest
 * of the product reads accounts.
 */
public interface AdminUserRepository extends JpaRepository<AppUser, UUID> {

    /**
     * The queue: oldest submission first, so the person who has waited longest is
     * decided first. A pending row without {@code submitted_at} cannot happen
     * (PUT /me/profile stamps it) but it must not vanish if it ever does.
     */
    @Query("""
            select u from AppUser u
            where u.status = :status
            order by u.submittedAt asc nulls last, u.createdAt asc
            """)
    List<AppUser> findByStatusOldestFirst(@Param("status") AccountStatus status);

    @Query("""
            select u from AppUser u
            where u.status = :status
            order by u.createdAt desc
            """)
    List<AppUser> findByStatusNewestFirst(@Param("status") AccountStatus status);

    List<AppUser> findAllByOrderByCreatedAtDesc();

    Optional<AppUser> findByEmailIgnoreCase(String email);
}
