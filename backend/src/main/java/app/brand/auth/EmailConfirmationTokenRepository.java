package app.brand.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmailConfirmationTokenRepository extends JpaRepository<EmailConfirmationToken, UUID> {

    Optional<EmailConfirmationToken> findByTokenHash(String tokenHash);

    /** [D18] The resend spacing reads the newest link of the account (TENANT_PLAN.md P3). */
    Optional<EmailConfirmationToken> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);
}
