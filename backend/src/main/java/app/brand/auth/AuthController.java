package app.brand.auth;

import app.brand.auth.AuthDtos.AuthResultDto;
import app.brand.auth.AuthDtos.ForgotPasswordRequest;
import app.brand.auth.AuthDtos.LoginRequest;
import app.brand.auth.AuthDtos.LogoutRequest;
import app.brand.auth.AuthDtos.RefreshRequest;
import app.brand.auth.AuthDtos.RegisterRequest;
import app.brand.auth.AuthDtos.TokensDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /auth/*} — the only routes that answer 401 with "wrong credentials"
 * rather than "session gone". {@code http.ts} marks them {@code auth: true} and
 * never spends a refresh token on their 401s.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 201 with an {@code incomplete} Me and a usable token pair. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResultDto register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResultDto login(@RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** Spent at most once per 401, by the client, without user interaction. */
    @PostMapping("/refresh")
    public TokensDto refresh(@Valid @RequestBody RefreshRequest request) {
        return authService.refresh(request.refreshToken());
    }

    /**
     * Best effort from the client's side — it signs out locally whatever happens —
     * so this never fails on a missing body or an unknown token.
     */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestBody(required = false) LogoutRequest request,
                       @CurrentUser(required = false) AppPrincipal principal) {
        authService.logout(
                principal == null ? null : principal.sessionId(),
                request == null ? null : request.refreshToken());
    }

    /** Always 202, whether or not the address exists. */
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@RequestBody ForgotPasswordRequest request, Locale locale) {
        authService.forgotPassword(request == null ? null : request.email(), locale);
    }
}
