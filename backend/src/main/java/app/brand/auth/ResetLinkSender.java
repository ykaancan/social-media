package app.brand.auth;

import java.util.Locale;

/**
 * Delivers the password-reset link. An interface so that "no SMTP yet" is a
 * configuration choice, not a missing feature — and so tests can capture the link
 * instead of parsing a log.
 *
 * <p>The locale is the one the {@code forgot-password} request arrived with: the
 * mail is written in the language the person was just using, and nothing about
 * that preference is stored.
 */
public interface ResetLinkSender {

    void send(String email, String link, Locale locale);
}
