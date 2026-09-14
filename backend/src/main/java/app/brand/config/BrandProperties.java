package app.brand.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Everything about this deployment that is not code. Bound from {@code brand.*};
 * every value has an environment-variable override in application.yml.
 */
@ConfigurationProperties(prefix = "brand")
@Validated
public record BrandProperties(
        @NotNull @Valid Jwt jwt,
        /** [B11] The account with this email is promoted to super_admin on startup. Optional. */
        String bootstrapAdminEmail,
        @NotNull @Valid Media media,
        /** Absolute base of this server, used for avatar URLs and the reset link. */
        @NotBlank String publicBaseUrl,
        @NotNull @Valid Mail mail,
        @NotNull @Valid Cors cors,
        /**
         * Brief §3 "Entitlement layer (present, switched off)". Present from day
         * one, OFF in stages 1–2; absent configuration reads as the defaults.
         */
        Entitlements entitlements) {

    public BrandProperties {
        publicBaseUrl = publicBaseUrl == null ? null : publicBaseUrl.replaceAll("/+$", "");
        entitlements = entitlements == null ? Entitlements.OFF : entitlements;
    }

    /** [B3] HS256 access tokens plus the lifetime of an opaque refresh token. */
    public record Jwt(
            /** Base64, at least 32 bytes decoded. Checked at startup by JwtService. */
            @NotBlank String secret,
            @NotNull Duration accessTtl,
            @NotNull Duration refreshTtl) {
    }

    /** [B10] Where resized avatars live on disk. */
    public record Media(@NotBlank String dir) {
    }

    /** {@code enabled = false} logs the reset link instead of sending it. */
    public record Mail(@NotBlank String from, boolean enabled) {
    }

    public record Cors(List<String> allowedOrigins) {
        public Cors {
            allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
        }
    }

    /**
     * Brief §3 and principle 3: the monetization gates exist in the model from day
     * one and are <b>server-side config flags, default OFF</b>. Stage 1 and stage 2
     * ship with every value here at its default; stage 3 flips them.
     *
     * <p>Nothing reads them yet beyond {@code GET /me/entitlements}, which exists so
     * the app's {@code useEntitlements} has one honest place to ask. [D3] "Renders
     * unlocked" is the client's half of the same rule: while {@code lockedCards} is
     * false a {@code LockedCard} is an ordinary card, and nothing in stage 1 looks
     * different for a reason the user cannot see.
     *
     * @param lockedCards     inbox cards past the free allowance render locked
     * @param freeInboxReads  free inbox reads per period; {@code 0} = unlimited
     * @param coldOpenLimit   cold thread opens per day; {@code 0} = unused (stage 1
     *                        has no cold DMs at all — brief §6)
     * @param revealPaid      the reveal action costs; stage 1 is free and unlimited
     */
    public record Entitlements(boolean lockedCards,
                               int freeInboxReads,
                               int coldOpenLimit,
                               boolean revealPaid) {

        /** Every gate off, which is what stages 1–2 run on. */
        public static final Entitlements OFF = new Entitlements(false, 0, 0, false);
    }
}
