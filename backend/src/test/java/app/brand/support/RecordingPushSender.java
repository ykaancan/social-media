package app.brand.support;

import app.brand.push.PushSender;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

/**
 * The transport, in a test: records what would have gone out and answers whatever
 * the test needs it to.
 *
 * <p>It is {@code @Primary} in {@link TestEndpointsConfig} rather than a per-class
 * {@code @TestConfiguration} so the whole suite keeps sharing one Spring context —
 * and so any test that happens to enqueue a push has somewhere harmless for it to
 * go. Tests that care call {@link #reset()} first.
 */
public class RecordingPushSender implements PushSender {

    private final List<PushMessage> sent = new CopyOnWriteArrayList<>();

    private volatile Function<PushMessage, PushResult> answer =
            message -> PushResult.delivered(message.id(), List.of());

    @Override
    public List<PushResult> send(List<PushMessage> batch) {
        sent.addAll(batch);
        List<PushResult> results = new ArrayList<>(batch.size());
        for (PushMessage message : batch) {
            results.add(answer.apply(message));
        }
        return results;
    }

    /** Every message this sender was handed, in the order the drain sent them. */
    public List<PushMessage> sent() {
        return List.copyOf(sent);
    }

    public void reset() {
        sent.clear();
        answer = message -> PushResult.delivered(message.id(), List.of());
    }

    /** Nothing gets through; every row takes one more attempt and this reason. */
    public void failEverythingWith(String error) {
        answer = message -> PushResult.failed(message.id(), error, List.of());
    }

    /** The provider says these tokens no longer exist; their device rows go. */
    public void reportUnregistered() {
        answer = message -> PushResult.failed(message.id(), "DeviceNotRegistered", message.tokens());
    }

    public void answerWith(Function<PushMessage, PushResult> answer) {
        this.answer = answer;
    }
}
