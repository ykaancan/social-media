package app.brand.admin;

import app.brand.auth.RefreshTokenRepository;
import app.brand.common.ApiException;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.MeMapper;
import app.brand.user.Role;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The account decisions behind {@code /admin/api/users*}. Every one of them writes
 * an {@code audit_log} row in the same transaction as the change, so there is no
 * state in which an account was banned and nobody recorded who did it.
 */
@Service
public class AdminUserService {

    /** Distinguishes a decision taken on the page from the startup promotion [B11]. */
    static final String SOURCE_ADMIN_API = "{\"source\":\"admin_api\"}";

    private final AdminUserRepository users;
    private final AuditLogRepository auditLog;
    private final RefreshTokenRepository refreshTokens;
    private final MeMapper meMapper;
    private final Clock clock;

    public AdminUserService(AdminUserRepository users,
                            AuditLogRepository auditLog,
                            RefreshTokenRepository refreshTokens,
                            MeMapper meMapper,
                            Clock clock) {
        this.users = users;
        this.auditLog = auditLog;
        this.refreshTokens = refreshTokens;
        this.meMapper = meMapper;
        this.clock = clock;
    }

    /**
     * {@code null} status means every account. Pending is ordered oldest first
     * because it is a queue; every other list is a log, so it is newest first.
     */
    @Transactional(readOnly = true)
    public List<AdminUserDto> list(AccountStatus status) {
        List<AppUser> rows;
        if (status == null) {
            rows = users.findAllByOrderByCreatedAtDesc();
        } else if (status == AccountStatus.PENDING) {
            rows = users.findByStatusOldestFirst(status);
        } else {
            rows = users.findByStatusNewestFirst(status);
        }
        return rows.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public AdminUserDto get(UUID id) {
        return toDto(require(id));
    }

    /** Only from {@code pending}: an approval is a decision on a submission. */
    @Transactional
    public AdminUserDto approve(UUID adminId, UUID id) {
        AppUser user = require(id);
        requireStatus(user, AccountStatus.PENDING, "only a pending account can be approved");

        Instant now = clock.instant();
        user.setStatus(AccountStatus.APPROVED);
        user.setApprovedAt(now);
        user.setApprovedBy(adminId);
        record(adminId, AuditAction.APPROVE_USER, user, now);
        return toDto(user);
    }

    @Transactional
    public AdminUserDto reject(UUID adminId, UUID id) {
        AppUser user = require(id);
        requireStatus(user, AccountStatus.PENDING, "only a pending account can be rejected");

        Instant now = clock.instant();
        user.setStatus(AccountStatus.REJECTED);
        record(adminId, AuditAction.REJECT_USER, user, now);
        return toDto(user);
    }

    /**
     * A ban ends the session as well as the account: the access token dies within
     * its 15 minutes because {@code JwtAuthenticationFilter} reads the row, and the
     * refresh tokens are revoked here so it cannot be renewed.
     */
    @Transactional
    public AdminUserDto ban(UUID adminId, UUID id) {
        AppUser user = require(id);
        if (user.getStatus() == AccountStatus.BANNED) {
            throw ApiException.conflict("conflict", "account is already banned", null);
        }

        Instant now = clock.instant();
        user.setStatus(AccountStatus.BANNED);
        user.setBannedAt(now);
        refreshTokens.revokeAllForUser(user.getId(), now);
        record(adminId, AuditAction.BAN_USER, user, now);
        return toDto(user);
    }

    /**
     * The role is data, never a hardcoded id: this is how the founder adds a second
     * trusted admin without a deploy.
     */
    @Transactional
    public AdminUserDto promote(UUID adminId, UUID id) {
        AppUser user = require(id);
        if (user.getRole() == Role.SUPER_ADMIN) {
            throw ApiException.conflict("conflict", "account is already a super admin", null);
        }
        requireStatus(user, AccountStatus.APPROVED, "only an approved account can be promoted");

        Instant now = clock.instant();
        user.setRole(Role.SUPER_ADMIN);
        record(adminId, AuditAction.PROMOTE_ADMIN, user, now);
        return toDto(user);
    }

    private void record(UUID adminId, AuditAction action, AppUser subject, Instant now) {
        auditLog.save(AuditLog.aboutUser(adminId, action, subject.getId(), SOURCE_ADMIN_API, now));
    }

    private AppUser require(UUID id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("no such account"));
    }

    private static void requireStatus(AppUser user, AccountStatus expected, String message) {
        if (user.getStatus() != expected) {
            throw ApiException.conflict("conflict", message, null);
        }
    }

    private AdminUserDto toDto(AppUser user) {
        return new AdminUserDto(
                user.getId().toString(),
                user.getEmail(),
                user.getPhone(),
                user.getName(),
                user.getBio(),
                meMapper.avatarUrl(user.getAvatarKey()),
                meMapper.toSectionRef(user.getSection()),
                user.getStatus(),
                user.getRole(),
                user.getCreatedAt(),
                user.getSubmittedAt(),
                user.getApprovedAt());
    }
}
