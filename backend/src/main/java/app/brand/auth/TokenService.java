package app.brand.auth;

import app.brand.auth.AuthDtos.TokensDto;
import app.brand.common.ApiException;
import app.brand.config.BrandProperties;
import app.brand.security.JwtService;
import app.brand.user.AppUser;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [B3] Issues the pair the app stores in the device keychain, and owns refresh
 * rotation: one refresh token is spent at most once, and using a spent one is a
 * dead session rather than a second chance.
 */
@Service
public class TokenService {

    private static final int REFRESH_BYTES = 32;

    private final JwtService jwtService;
    private final RefreshTokenRepository refreshTokens;
    private final Clock clock;
    private final Duration refreshTtl;
    private final SecureRandom random = new SecureRandom();

    public TokenService(JwtService jwtService,
                        RefreshTokenRepository refreshTokens,
                        BrandProperties properties,
                        Clock clock) {
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.clock = clock;
        this.refreshTtl = properties.jwt().refreshTtl();
    }

    /**
     * The refresh row is written first so its id can go into the access token as
     * {@code sid}: that is what makes a sign-out end one session and not every
     * device the person has [B3].
     */
    @Transactional
    public TokensDto issue(AppUser user) {
        Instant now = clock.instant();
        String refresh = randomToken();
        RefreshToken stored = refreshTokens.saveAndFlush(
                RefreshToken.issue(user.getId(), hash(refresh), now, now.plus(refreshTtl)));
        return new TokensDto(jwtService.issue(user, stored.getId()), refresh);
    }

    /**
     * Rotation, step one: the presented token is revoked and its owner returned, so
     * the caller can issue a fresh pair. An unknown, expired or already-revoked
     * token is a 401 — the client signs out rather than getting a second chance.
     */
    @Transactional
    public UUID consumeForRotation(String presented) {
        Instant now = clock.instant();
        RefreshToken stored = refreshTokens.findByTokenHash(hash(presented))
                .filter(token -> token.isUsable(now))
                .orElseThrow(() -> ApiException.unauthorized("unauthorized", "refresh token is not valid"));
        stored.revoke(now);
        refreshTokens.save(stored);
        return stored.getUserId();
    }

    /** Best effort: an unknown token is not an error, the session is gone either way. */
    @Transactional
    public void revoke(String presented) {
        if (presented == null || presented.isBlank()) {
            return;
        }
        Instant now = clock.instant();
        refreshTokens.findByTokenHash(hash(presented)).ifPresent(token -> {
            token.revoke(now);
            refreshTokens.save(token);
        });
    }

    /**
     * Ends exactly the session an access token named in its {@code sid} claim.
     * Unknown or already revoked is not an error — the session is gone either way.
     */
    @Transactional
    public void revokeSession(UUID sessionId) {
        if (sessionId == null) {
            return;
        }
        Instant now = clock.instant();
        refreshTokens.findById(sessionId).ifPresent(token -> {
            token.revoke(now);
            refreshTokens.save(token);
        });
    }

    /** Kept for the two cases that really do end every session: ban and password reset. */
    @Transactional
    public void revokeAllForUser(UUID userId) {
        refreshTokens.revokeAllForUser(userId, clock.instant());
    }

    String randomToken() {
        byte[] raw = new byte[REFRESH_BYTES];
        random.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    /** SHA-256 hex. The raw token never reaches the database or a log line. */
    static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required", ex);
        }
    }
}
