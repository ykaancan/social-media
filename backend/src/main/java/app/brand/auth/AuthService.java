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
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration, sign-in, email confirmation [D18] and the password-reset round
 * trip.
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
    private final EmailConfirmationTokenRepository confirmationTokens;
    private final ConfirmationLinkSender confirmationLinkSender;
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
                       EmailConfirmationTokenRepository confirmationTokens,
                       ConfirmationLinkSender confirmationLinkSender,
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
        this.confirmationTokens = confirmationTokens;
        this.confirmationLinkSender = confirmationLinkSender;
        this.meMapper = meMapper;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * A new account is always {@code incomplete}, {@code member} and unconfirmed:
     * [D18] a confirmation link is sent in the language of this request, and until
     * it is opened the account reaches only its status-independent routes.
     */
    @Transactional
    public AuthResultDto register(RegisterRequest request, Locale locale) {
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
        sendConfirmationLink(user, clock.instant(), locale);
        return new AuthResultDto(tokenService.issue(user), meMapper.toMe(user));
    }

    /* ------------------------------------------------------- confirmation [D18] */

    /**
     * {@code POST /auth/resend-confirmation}. The caller always gets 202; a new link
     * goes out only when the account is not confirmed yet <b>and</b> its newest link
     * is at least {@code brand.mail.confirmation-resend-interval} old
     * (TENANT_PLAN.md P3), so the route cannot be used to send mail in bulk. An
     * account that has no link at all gets one.
     */
    @Transactional
    public void resendConfirmation(UUID userId, Locale locale) {
        AppUser user = users.findById(userId).orElse(null);
        if (user == null || user.isEmailConfirmed()) {
            return;
        }
        Instant now = clock.instant();
        Instant earliest = now.minus(properties.mail().confirmationResendInterval());
        boolean tooSoon = confirmationTokens.findFirstByUserIdOrderByCreatedAtDesc(userId)
                .map(newest -> newest.getCreatedAt().isAfter(earliest))
                .orElse(false);
        if (tooSoon) {
            return;
        }
        sendConfirmationLink(user, now, locale);
    }

    /**
     * {@code GET /confirm}. A usable token (unused, unexpired) is consumed and the
     * email marked confirmed; anything else changes nothing and answers false. An
     * older link that is still usable works too: every link sent is a real one.
     */
    @Transactional
    public boolean confirmEmail(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        Instant now = clock.instant();
        Optional<EmailConfirmationToken> found = confirmationTokens.findByTokenHash(TokenService.hash(token))
                .filter(candidate -> candidate.isUsable(now));
        if (found.isEmpty()) {
            return false;
        }
        Optional<AppUser> user = users.findById(found.get().getUserId());
        if (user.isEmpty()) {
            return false;
        }
        found.get().consume(now);
        confirmationTokens.save(found.get());
        user.get().confirmEmail(now);
        users.save(user.get());
        return true;
    }

    private void sendConfirmationLink(AppUser user, Instant now, Locale locale) {
        String token = tokenService.randomToken();
        confirmationTokens.save(EmailConfirmationToken.issue(
                user.getId(), TokenService.hash(token), now, now.plus(properties.mail().confirmationTtl())));
        confirmationLinkSender.send(user.getEmail(), confirmationLink(token), locale);
    }

    private String confirmationLink(String token) {
        return properties.publicBaseUrl() + "/confirm?token="
                + URLEncoder.encode(token, StandardCharsets.UTF_8);
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
     * The client sends no body, so the bearer alone has to end the session — and
     * exactly that session: the {@code sid} claim names the refresh row this
     * access token was issued beside, so signing out on the phone does not sign
     * the same person out on the tablet. A body, when there is one, revokes the
     * token it names as well. Only a ban and a password reset end every session.
     */
    @Transactional
    public void logout(UUID sessionId, String presentedRefreshToken) {
        if (presentedRefreshToken != null && !presentedRefreshToken.isBlank()) {
            tokenService.revoke(presentedRefreshToken);
        }
        tokenService.revokeSession(sessionId);
    }

    /**
     * Always succeeds from the caller's point of view. When the address is unknown
     * nothing is created and nothing is sent — the 202 is identical.
     */
    @Transactional
    public void forgotPassword(String rawEmail, Locale locale) {
        String email = rawEmail == null ? "" : rawEmail.trim();
        if (email.isEmpty()) {
            return;
        }
        users.findByEmailIgnoreCase(email).ifPresent(user -> {
            Instant now = clock.instant();
            String token = tokenService.randomToken();
            resetTokens.save(PasswordResetToken.issue(
                    user.getId(), TokenService.hash(token), now, now.plus(RESET_TTL)));
            resetLinkSender.send(user.getEmail(), resetLink(token), locale);
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
