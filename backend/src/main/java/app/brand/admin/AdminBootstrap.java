package app.brand.admin;

import app.brand.config.BrandProperties;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.Role;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * [B11] The first {@code super_admin} is created by configuration, not by a
 * migration and not by a hardcoded id: the account whose email equals
 * {@code brand.bootstrap-admin-email} is promoted and approved on startup.
 *
 * <p>The founder registers through the app like everybody else and then restarts
 * the server (or already has this set), so there is never a password in a config
 * file. Running on every start is deliberate and cheap — it is one indexed lookup
 * — and makes the order of "set the variable" and "register" not matter.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    /** Tells a promotion done by the server apart from one taken on the admin page. */
    static final String SOURCE_BOOTSTRAP = "{\"source\":\"bootstrap\"}";

    private final AdminUserRepository users;
    private final AuditLogRepository auditLog;
    private final BrandProperties properties;
    private final Clock clock;

    public AdminBootstrap(AdminUserRepository users,
                          AuditLogRepository auditLog,
                          BrandProperties properties,
                          Clock clock) {
        this.users = users;
        this.auditLog = auditLog;
        this.properties = properties;
        this.clock = clock;
    }

    /** Transactional here as well: {@link #promote} is a self-invocation from here. */
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        promote(properties.bootstrapAdminEmail());
    }

    /**
     * Idempotent: an account that is already an approved super admin is left
     * untouched and nothing is written to the audit log.
     *
     * @return true when this call changed the account
     */
    @Transactional
    public boolean promote(String email) {
        if (email == null || email.isBlank()) {
            log.info("[B11] no brand.bootstrap-admin-email configured; no admin will be promoted");
            return false;
        }

        Optional<AppUser> found = users.findByEmailIgnoreCase(email.trim());
        if (found.isEmpty()) {
            log.info("[B11] no account for the bootstrap admin address yet; "
                    + "it will be promoted on a later start, once that address registers");
            return false;
        }

        AppUser user = found.get();
        boolean roleChanged = user.getRole() != Role.SUPER_ADMIN;
        boolean statusChanged = user.getStatus() != AccountStatus.APPROVED;
        if (!roleChanged && !statusChanged) {
            log.info("[B11] bootstrap admin {} is already an approved super admin", user.getId());
            return false;
        }

        Instant now = clock.instant();
        user.setRole(Role.SUPER_ADMIN);
        user.setStatus(AccountStatus.APPROVED);
        if (user.getApprovedAt() == null) {
            // approved_by stays null: no person made this decision, the configuration did.
            user.setApprovedAt(now);
        }
        users.save(user);
        auditLog.save(AuditLog.aboutUser(null, AuditAction.PROMOTE_ADMIN, user.getId(), SOURCE_BOOTSTRAP, now));

        log.info("[B11] promoted {} to super_admin and approved the account (role changed: {}, status changed: {})",
                user.getId(), roleChanged, statusChanged);
        return true;
    }
}
