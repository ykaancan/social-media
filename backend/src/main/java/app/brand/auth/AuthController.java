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
import jakarta.servlet.http.HttpServletRequest;
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
 *
 * <p>[D21] Register, login and forgot-password are rate limited per network
 * address (and login and forgot-password per email too) by {@link AuthRateLimiter}.
 * The address is {@link HttpServletRequest#getRemoteAddr()} and nothing else:
 * {@code X-Forwarded-For} is never parsed here. In production
 * {@code server.forward-headers-strategy: framework} makes that the forwarded
 * client address. Refresh, logout and resend-confirmation are not limited.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * 201 with an {@code incomplete}, unconfirmed Me and a usable token pair; the
     * confirmation link is sent in the language of this request [D18].
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResultDto register(@Valid @RequestBody RegisterRequest request, Locale locale,
                                  HttpServletRequest http) {
        return authService.register(request, locale, http.getRemoteAddr());
    }

    /**
     * [D18] Signed in only — {@code /auth/**} is public in {@code SecurityConfig},
     * so the required {@code @CurrentUser} is what makes a call without a bearer a
     * 401. Always 202: whether a mail went out is not observable.
     */
    @PostMapping("/resend-confirmation")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendConfirmation(@CurrentUser AppPrincipal principal, Locale locale) {
        authService.resendConfirmation(principal.id(), locale);
    }

    @PostMapping("/login")
    public AuthResultDto login(@RequestBody LoginRequest request, HttpServletRequest http) {
        return authService.login(request, http.getRemoteAddr());
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

    /** Always 202, whether or not the address exists — or 429 over a [D21] limit. */
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@RequestBody ForgotPasswordRequest request, Locale locale,
                               HttpServletRequest http) {
        authService.forgotPassword(request == null ? null : request.email(), locale, http.getRemoteAddr());
    }
}
