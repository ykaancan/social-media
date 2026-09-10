package app.brand.auth;

import app.brand.user.MeDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The auth wire types, exactly as {@code app/src/api/types.ts} declares them.
 *
 * <p>The validation annotations are the server side of {@code LIMITS}: the client
 * mirrors them so the person is told before they send, and the server never trusts
 * that it did.
 */
public final class AuthDtos {

    private AuthDtos() {
    }

    /**
     * {@code RegisterRequest}. The email pattern is deliberately loose — the admin,
     * not a regex, decides whether a person is real.
     *
     * <p>The password maximum is not in {@code LIMITS}: BCrypt refuses inputs over
     * 72 bytes, and a refusal has to be a 422 the person can act on rather than a
     * 500 they cannot.
     */
    public record RegisterRequest(
            @NotBlank(message = "email is required")
            @Pattern(regexp = ".+@.+\\..+", message = "invalid email")
            String email,

            @NotBlank(message = "password is required")
            @Size(min = 8, max = 72, message = "password must be 8 to 72 characters")
            String password,

            @Size(max = 40, message = "phone is too long")
            String phone) {
    }

    /**
     * {@code LoginRequest}. Deliberately not bean-validated: every bad login is the
     * same 401 {@code invalid_credentials}, so that a malformed address cannot be
     * told apart from an unknown one.
     */
    public record LoginRequest(String email, String password) {
    }

    public record RefreshRequest(@NotBlank(message = "refreshToken is required") String refreshToken) {
    }

    /** The client sends no body; when one arrives, that token is the one revoked. */
    public record LogoutRequest(String refreshToken) {
    }

    public record ForgotPasswordRequest(String email) {
    }

    /** {@code Tokens}. */
    public record TokensDto(String accessToken, String refreshToken) {
    }

    /** {@code AuthResult} — credentials plus the account they belong to. */
    public record AuthResultDto(TokensDto tokens, MeDto me) {
    }
}
