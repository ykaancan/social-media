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
        @NotNull @Valid Cors cors) {

    public BrandProperties {
        publicBaseUrl = publicBaseUrl == null ? null : publicBaseUrl.replaceAll("/+$", "");
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
}
