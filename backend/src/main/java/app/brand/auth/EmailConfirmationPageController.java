package app.brand.auth;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * [D18] The page a confirmation link opens. Modelled on
 * {@link PasswordResetPageController}: plain server-rendered HTML outside the
 * design system, copy from {@code messages_en} / {@code messages_tr}, language
 * from {@code Accept-Language}.
 *
 * <p>Opening a usable link confirms the email at once — there is nothing to fill
 * in. A used, expired or unknown token renders one "no longer works" page and
 * changes nothing; like the reset page, it never says whether an address exists.
 */
@Controller
public class EmailConfirmationPageController {

    private static final String DONE = "confirm-done";
    private static final String INVALID = "confirm-invalid";

    private final AuthService authService;

    public EmailConfirmationPageController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/confirm")
    public String confirm(@RequestParam(name = "token", required = false) String token) {
        return authService.confirmEmail(token) ? DONE : INVALID;
    }
}
