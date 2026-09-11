package app.brand.security;

import app.brand.config.BrandProperties;
import app.brand.user.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.DecodingException;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * [B3] Access tokens: HS256, 15 minutes, {@code sub} = user id, {@code role} claim,
 * {@code sid} = the id of the refresh-token row this access token was issued
 * beside.
 *
 * <p>The role claim is informational — authorisation reads the live
 * {@code app_user} row (see {@link JwtAuthenticationFilter}), so a promotion or a
 * ban is never 15 minutes stale.
 *
 * <p>{@code sid} is what makes one sign-out one session: logout with a bearer and
 * no body revokes exactly that refresh row, so the same person's other device
 * keeps working. It is an identifier of a row this account owns, never a secret —
 * the refresh token itself is still only ever stored hashed.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    private static final int MIN_SECRET_BYTES = 32;
    private static final String SESSION_CLAIM = "sid";

    /** What a verified access token says: who, and which session. */
    public record AccessToken(UUID userId, UUID sessionId) {
    }

    private final SecretKey key;
    private final Duration accessTtl;
    private final Clock clock;

    public JwtService(BrandProperties properties, Clock clock) {
        byte[] secret;
        try {
            secret = Decoders.BASE64.decode(properties.jwt().secret());
        } catch (DecodingException ex) {
            throw new IllegalStateException("brand.jwt.secret must be base64", ex);
        }
        if (secret.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "brand.jwt.secret must decode to at least " + MIN_SECRET_BYTES
                            + " bytes, got " + secret.length);
        }
        this.key = Keys.hmacShaKeyFor(secret);
        this.accessTtl = properties.jwt().accessTtl();
        this.clock = clock;
    }

    /**
     * A token with no session bound to it. Only for callers that are not handing
     * out a refresh token beside it; logout with such a bearer and no body has no
     * session to end.
     */
    public String issue(AppUser user) {
        return issue(user, null);
    }

    public String issue(AppUser user, UUID sessionId) {
        Instant now = clock.instant();
        var builder = Jwts.builder()
                .subject(user.getId().toString())
                .claim("role", user.getRole().value())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTtl)));
        if (sessionId != null) {
            builder.claim(SESSION_CLAIM, sessionId.toString());
        }
        // Pinned: jjwt would otherwise pick HS384/HS512 from the key length,
        // and [B3] says HS256. A longer secret is allowed, not a different alg.
        return builder.signWith(key, Jwts.SIG.HS256).compact();
    }

    /** Subject and session of a valid, unexpired token, or empty. Never throws. */
    public Optional<AccessToken> verify(String token) {
        return claims(token).flatMap(claims -> {
            UUID userId = uuid(claims.getSubject());
            if (userId == null) {
                return Optional.empty();
            }
            return Optional.of(new AccessToken(userId, uuid(claims.get(SESSION_CLAIM, String.class))));
        });
    }

    /** The subject of a valid, unexpired token, or empty. Never throws. */
    public Optional<UUID> subject(String token) {
        return verify(token).map(AccessToken::userId);
    }

    /** The refresh row this access token was issued beside, when it names one. */
    public Optional<UUID> sessionId(String token) {
        return verify(token).map(AccessToken::sessionId).filter(java.util.Objects::nonNull);
    }

    private Optional<Claims> claims(String token) {
        try {
            return Optional.of(Jwts.parser()
                    .verifyWith(key)
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload());
        } catch (JwtException | IllegalArgumentException ex) {
            // Expired, forged or malformed. Never log the token itself.
            log.debug("rejected access token: {}", ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private static UUID uuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
