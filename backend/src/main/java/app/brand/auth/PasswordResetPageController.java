package app.brand.auth;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * The one server-rendered surface in the product: the page a reset link opens.
 *
 * <p>Plain HTML on purpose — it is reached from an email in whatever browser the
 * person has, not from the app, so it must not depend on the design system
 * (CLAUDE.md forbids restyling it; this simply is not part of it).
 *
 * <p>It never says whether an address exists: every bad, expired or already-used
 * token renders the same page.
 */
@Controller
public class PasswordResetPageController {

    private static final String FORM = "reset";
    private static final String DONE = "reset-done";
    private static final String INVALID = "reset-invalid";

    private final AuthService authService;

    public PasswordResetPageController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/reset")
    public String page(@RequestParam(name = "token", required = false) String token, Model model) {
        if (!authService.isResetTokenUsable(token)) {
            return INVALID;
        }
        model.addAttribute("token", token);
        model.addAttribute("minLength", AuthService.PASSWORD_MIN);
        return FORM;
    }

    @PostMapping("/reset")
    public String submit(@RequestParam(name = "token", required = false) String token,
                         @RequestParam(name = "password", required = false) String password,
                         @RequestParam(name = "confirm", required = false) String confirm,
                         Model model) {
        model.addAttribute("token", token);
        model.addAttribute("minLength", AuthService.PASSWORD_MIN);

        String problem = validate(password, confirm);
        if (problem != null) {
            if (!authService.isResetTokenUsable(token)) {
                return INVALID;
            }
            model.addAttribute("error", problem);
            return FORM;
        }

        return authService.resetPassword(token, password) ? DONE : INVALID;
    }

    private static String validate(String password, String confirm) {
        if (password == null || password.length() < AuthService.PASSWORD_MIN) {
            return "Your password must be at least " + AuthService.PASSWORD_MIN + " characters.";
        }
        if (password.length() > AuthService.PASSWORD_MAX) {
            return "Your password must be at most " + AuthService.PASSWORD_MAX + " characters.";
        }
        if (!password.equals(confirm)) {
            return "The two passwords do not match.";
        }
        return null;
    }
}
