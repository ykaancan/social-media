package app.brand.auth;

import app.brand.auth.AuthDtos.AuthResultDto;
import app.brand.auth.AuthDtos.LoginRequest;
import app.brand.auth.AuthDtos.RegisterRequest;
import app.brand.auth.AuthDtos.TokensDto;
import app.brand.common.ApiException;
import app.brand.config.BrandProperties;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.MeMapper;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration, sign-in and the password-reset round trip.
 *
 * <p>Two rules run through all of it: an account's existence is never observable
 * from the outside (login says the same thing for a wrong address and a wrong
 * password; forgot-password answers 202 either way), and no password or token is
 * ever logged.
 */
@Service
public class AuthService {

    /** Reset links live one hour. */
    private static final Duration RESET_TTL = Duration.ofHours(1);

    /** Same floor as registration; the reset form checks it too. */
    public static final int PASSWORD_MIN = 8;
    public static final int PASSWORD_MAX = 72;

    private final AppUserRepository users;
    private final UserSettingsRepository settings;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository resetTokens;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final ResetLinkSender resetLinkSender;
    private final MeMapper meMapper;
    private final BrandProperties properties;
    private final Clock clock;

    public AuthService(AppUserRepository users,
                       UserSettingsRepository settings,
                       RefreshTokenRepository refreshTokens,
                       PasswordResetTokenRepository resetTokens,
                       TokenService tokenService,
                       PasswordEncoder passwordEncoder,
                       ResetLinkSender resetLinkSender,
                       MeMapper meMapper,
                       BrandProperties properties,
                       Clock clock) {
        this.users = users;
        this.settings = settings;
        this.refreshTokens = refreshTokens;
        this.resetTokens = resetTokens;
        this.tokenService = tokenService;
        this.passwordEncoder = passwordEncoder;
        this.resetLinkSender = resetLinkSender;
        this.meMapper = meMapper;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * A new account is always {@code incomplete} and {@code member}: the profile has
     * not been sent yet, so it is not in the admin queue and cannot use the app.
     */
    @Transactional
    public AuthResultDto register(RegisterRequest request) {
        String email = request.email().trim();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_in_use", "that email already has an account", "email");
        }

        String phone = request.phone() == null || request.phone().isBlank() ? null : request.phone().trim();
        AppUser user = AppUser.register(email, passwordEncoder.encode(request.password()), phone, clock.instant());
        try {
            user = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            // Two registrations for one address raced; the unique index on
            // lower(email) is the authority, not the check above.
            throw ApiException.conflict("email_in_use", "that email already has an account", "email");
        }

        settings.save(UserSettings.defaultsFor(user.getId()));
        return new AuthResultDto(tokenService.issue(user), meMapper.toMe(user));
    }

    /**
     * One error for "no such account" and "wrong password": the response must not
     * let anyone probe for who has an account.
     */
    @Transactional
    public AuthResultDto login(LoginRequest request) {
        String email = request.email() == null ? "" : request.email().trim();
        String password = request.password() == null ? "" : request.password();

        AppUser user = users.findByEmailIgnoreCase(email)
                .filter(candidate -> !password.isEmpty()
                        && passwordEncoder.matches(password, candidate.getPasswordHash()))
                .orElseThrow(() -> ApiException.unauthorized("invalid_credentials", "wrong email or password"));

        return new AuthResultDto(tokenService.issue(user), meMapper.toMe(user));
    }

    /** [B3] Rotation: the presented token dies, a fresh pair is issued. */
    @Transactional
    public TokensDto refresh(String presentedRefreshToken) {
        UUID userId = tokenService.consumeForRotation(presentedRefreshToken);
        AppUser user = users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("unauthorized", "account no longer exists"));
        return tokenService.issue(user);
    }

    /**
     * The client sends no body, so a bearer alone must end the session: every
     * refresh token of that account is revoked. A body, when there is one, revokes
     * exactly the token it names.
     */
    @Transactional
    public void logout(UUID userId, String presentedRefreshToken) {
        if (presentedRefreshToken != null && !presentedRefreshToken.isBlank()) {
            tokenService.revoke(presentedRefreshToken);
        }
        if (userId != null) {
            tokenService.revokeAllForUser(userId);
        }
    }

    /**
     * Always succeeds from the caller's point of view. When the address is unknown
     * nothing is created and nothing is sent — the 202 is identical.
     */
    @Transactional
    public void forgotPassword(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim();
        if (email.isEmpty()) {
            return;
        }
        users.findByEmailIgnoreCase(email).ifPresent(user -> {
            Instant now = clock.instant();
            String token = tokenService.randomToken();
            resetTokens.save(PasswordResetToken.issue(
                    user.getId(), TokenService.hash(token), now, now.plus(RESET_TTL)));
            resetLinkSender.send(user.getEmail(), resetLink(token));
        });
    }

    private String resetLink(String token) {
        return properties.publicBaseUrl() + "/reset?token="
                + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    /** True when the token in a {@code GET /reset} link is still good. */
    @Transactional(readOnly = true)
    public boolean isResetTokenUsable(String token) {
        return findUsableResetToken(token).isPresent();
    }

    /**
     * Consumes the token, sets the password and kills every session of that account:
     * a reset is also how someone locks out whoever had their old password.
     */
    @Transactional
    public boolean resetPassword(String token, String newPassword) {
        Optional<PasswordResetToken> found = findUsableResetToken(token);
        if (found.isEmpty()) {
            return false;
        }
        PasswordResetToken resetToken = found.get();
        Optional<AppUser> user = users.findById(resetToken.getUserId());
        if (user.isEmpty()) {
            return false;
        }

        Instant now = clock.instant();
        resetToken.consume(now);
        resetTokens.save(resetToken);

        user.get().setPasswordHash(passwordEncoder.encode(newPassword));
        users.save(user.get());
        refreshTokens.revokeAllForUser(user.get().getId(), now);
        return true;
    }

    private Optional<PasswordResetToken> findUsableResetToken(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        return resetTokens.findByTokenHash(TokenService.hash(token))
                .filter(candidate -> candidate.isUsable(clock.instant()));
    }
}
