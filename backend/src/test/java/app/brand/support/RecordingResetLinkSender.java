package app.brand.support;

import app.brand.auth.ResetLinkSender;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Captures reset links instead of mailing or logging them, so the reset flow can
 * be exercised end to end without reading a log or storing a token in the clear.
 */
public class RecordingResetLinkSender implements ResetLinkSender {

    public record Sent(String email, String link, Locale locale) {
    }

    private final List<Sent> sent = new ArrayList<>();

    @Override
    public synchronized void send(String email, String link, Locale locale) {
        sent.add(new Sent(email, link, locale));
    }

    public synchronized void clear() {
        sent.clear();
    }

    public synchronized List<Sent> sent() {
        return List.copyOf(sent);
    }

    /** The {@code token} query parameter of the most recent link. */
    public synchronized String lastToken() {
        if (sent.isEmpty()) {
            throw new IllegalStateException("no reset link was sent");
        }
        String link = sent.get(sent.size() - 1).link();
        int at = link.indexOf("token=");
        if (at < 0) {
            throw new IllegalStateException("reset link carries no token: " + link);
        }
        return java.net.URLDecoder.decode(link.substring(at + "token=".length()),
                java.nio.charset.StandardCharsets.UTF_8);
    }
}
