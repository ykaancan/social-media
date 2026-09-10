package app.brand.auth;

/**
 * Delivers the password-reset link. An interface so that "no SMTP yet" is a
 * configuration choice, not a missing feature — and so tests can capture the link
 * instead of parsing a log.
 */
public interface ResetLinkSender {

    void send(String email, String link);
}
