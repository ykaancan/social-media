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
 * [B3] Access tokens: HS256, 15 minutes, {@code sub} = user id, {@code role} claim.
 *
 * <p>The role claim is informational — authorisation reads the live
 * {@code app_user} row (see {@link JwtAuthenticationFilter}), so a promotion or a
 * ban is never 15 minutes stale.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    private static final int MIN_SECRET_BYTES = 32;

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

    public String issue(AppUser user) {
        Instant now = clock.instant();
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("role", user.getRole().value())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTtl)))
                // Pinned: jjwt would otherwise pick HS384/HS512 from the key length,
                // and [B3] says HS256. A longer secret is allowed, not a different alg.
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /** The subject of a valid, unexpired token, or empty. Never throws. */
    public Optional<UUID> subject(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Optional.of(UUID.fromString(claims.getSubject()));
        } catch (JwtException | IllegalArgumentException ex) {
            // Expired, forged or malformed. Never log the token itself.
            log.debug("rejected access token: {}", ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }
}
