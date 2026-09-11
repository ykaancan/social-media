package app.brand.auth;

import java.util.Locale;
import org.springframework.context.MessageSource;
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
 * (CLAUDE.md forbids restyling it; this simply is not part of it). Its copy is
 * i18n like every other string: the templates read {@code messages_en} and
 * {@code messages_tr}, and the language comes from {@code Accept-Language}
 * (see {@code WebMvcConfig#localeResolver}).
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
    private final MessageSource messages;

    public PasswordResetPageController(AuthService authService, MessageSource messages) {
        this.authService = authService;
        this.messages = messages;
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
                         Locale locale,
                         Model model) {
        model.addAttribute("token", token);
        model.addAttribute("minLength", AuthService.PASSWORD_MIN);

        String problem = validate(password, confirm, locale);
        if (problem != null) {
            if (!authService.isResetTokenUsable(token)) {
                return INVALID;
            }
            model.addAttribute("error", problem);
            return FORM;
        }

        return authService.resetPassword(token, password) ? DONE : INVALID;
    }

    private String validate(String password, String confirm, Locale locale) {
        if (password == null || password.length() < AuthService.PASSWORD_MIN) {
            return message("reset.form.error.tooShort", locale, AuthService.PASSWORD_MIN);
        }
        if (password.length() > AuthService.PASSWORD_MAX) {
            return message("reset.form.error.tooLong", locale, AuthService.PASSWORD_MAX);
        }
        if (!password.equals(confirm)) {
            return message("reset.form.error.mismatch", locale);
        }
        return null;
    }

    private String message(String code, Locale locale, Object... args) {
        return messages.getMessage(code, args, locale == null ? Locale.ENGLISH : locale);
    }
}
