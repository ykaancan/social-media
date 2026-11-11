package app.brand.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * [D18] A single-use email-confirmation token. Same shape as
 * {@link PasswordResetToken} and stored hashed the same way; only the lifetime
 * differs ({@code brand.mail.confirmation-ttl}, 24 hours by default,
 * TENANT_PLAN.md P2).
 */
@Entity
@Table(name = "email_confirmation_token")
public class EmailConfirmationToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected EmailConfirmationToken() {
    }

    public static EmailConfirmationToken issue(UUID userId, String tokenHash, Instant now, Instant expiresAt) {
        EmailConfirmationToken token = new EmailConfirmationToken();
        token.userId = userId;
        token.tokenHash = tokenHash;
        token.createdAt = now;
        token.expiresAt = expiresAt;
        return token;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isUsable(Instant now) {
        return usedAt == null && expiresAt.isAfter(now);
    }

    public void consume(Instant now) {
        this.usedAt = now;
    }
}
