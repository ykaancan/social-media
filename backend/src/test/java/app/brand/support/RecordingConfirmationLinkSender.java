package app.brand.support;

import app.brand.auth.ConfirmationLinkSender;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * [D18] Records every confirmation link, then hands it to the real sender.
 *
 * <p>Unlike {@link RecordingResetLinkSender} this one delegates: with
 * {@code brand.mail.enabled = false} (the test profile) the real sender writes the
 * link to the log, and acceptance test 2 has to see that log line produced by an
 * actual registration, not by a direct call.
 */
public class RecordingConfirmationLinkSender implements ConfirmationLinkSender {

    public record Sent(String email, String link, Locale locale) {
    }

    private final ConfirmationLinkSender delegate;
    private final List<Sent> sent = new ArrayList<>();

    public RecordingConfirmationLinkSender(ConfirmationLinkSender delegate) {
        this.delegate = delegate;
    }

    @Override
    public void send(String email, String link, Locale locale) {
        synchronized (this) {
            sent.add(new Sent(email, link, locale));
        }
        delegate.send(email, link, locale);
    }

    public synchronized List<Sent> sentTo(String email) {
        return sent.stream().filter(entry -> entry.email().equalsIgnoreCase(email)).toList();
    }

    /** The {@code token} query parameter of the most recent link sent to this address. */
    public synchronized String lastTokenFor(String email) {
        List<Sent> mine = sentTo(email);
        if (mine.isEmpty()) {
            throw new IllegalStateException("no confirmation link was sent to that address");
        }
        String link = mine.get(mine.size() - 1).link();
        int at = link.indexOf("token=");
        if (at < 0) {
            throw new IllegalStateException("confirmation link carries no token: " + link);
        }
        return URLDecoder.decode(link.substring(at + "token=".length()), StandardCharsets.UTF_8);
    }
}
