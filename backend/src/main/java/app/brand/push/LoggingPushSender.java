package app.brand.push;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The default sender: {@code brand.push.enabled = false}.
 *
 * <p>It is not a no-op and not a stub. Everything up to the HTTP call runs exactly
 * as it will in production — the listener decides, the copy is rendered in the
 * device's language, the row is written, the drain picks it up in order and marks
 * it sent — and the last step writes a log line instead of buzzing a phone. That
 * is what makes switching the flag on a configuration change rather than a code
 * path nobody has exercised.
 *
 * <p>The line carries the kind, the locale and the number of devices. It carries
 * no body: the copy is generic by design, but a log file is still the wrong place
 * for anything addressed to a person.
 */
public class LoggingPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPushSender.class);

    @Override
    public List<PushResult> send(List<PushMessage> batch) {
        List<PushResult> results = new ArrayList<>(batch.size());
        for (PushMessage message : batch) {
            log.info("push {} to {} device(s) in {} [disabled: not sent]",
                    message.row().getKind(), message.tokens().size(), message.row().getLocale());
            results.add(PushResult.delivered(message.id(), List.of()));
        }
        return results;
    }
}
