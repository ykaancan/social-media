package app.brand.auth;

import java.util.Locale;

/**
 * [D18] Delivers the email-confirmation link. The same seam as
 * {@link ResetLinkSender}: "no SMTP yet" is a configuration choice, and tests
 * capture the link instead of parsing a log.
 *
 * <p>The locale is the one the register or resend request arrived with.
 */
public interface ConfirmationLinkSender {

    void send(String email, String link, Locale locale);
}
