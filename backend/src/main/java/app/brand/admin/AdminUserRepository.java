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

    @Query("""
            select u from AppUser u
            where u.status = :status
            order by u.createdAt desc
            """)
    List<AppUser> findByStatusNewestFirst(@Param("status") AccountStatus status);

    List<AppUser> findAllByOrderByCreatedAtDesc();

    Optional<AppUser> findByEmailIgnoreCase(String email);
}
