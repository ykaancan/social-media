package app.brand.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the outbox [B8]. The one way a notification comes into existence.
 *
 * <p>Three decisions live here, and they are the reason this is a service rather
 * than a repository call at each listener:
 *
 * <ul>
 *   <li><b>No device, no row.</b> An account that has never opened the app on a
 *       phone — or signed out of the last one — generates nothing. The outbox is a
 *       delivery queue, not an activity log, and rows nobody can receive would
 *       only grow it.</li>
 *   <li><b>The language is the device's, decided now.</b> {@code locale} is the
 *       most recently seen device's, and the title and body are rendered into the
 *       payload at this moment [B8]. The drain is then pure transport: it never
 *       reads a message, a post, a user or a message bundle, so nothing about the
 *       copy can drift between deciding to notify and delivering it.</li>
 *   <li><b>Nothing identifying goes in.</b> {@code data} carries ids for the
 *       deep link the app will grow, never a name, a hint or any part of the
 *       text.</li>
 * </ul>
 *
 * <p>{@code REQUIRES_NEW}: every caller is an after-commit listener, so the work
 * that caused the notification is already durable. Giving the insert its own
 * transaction means a push that cannot be written (a device row deleted a
 * millisecond ago, a bundle key missing) fails as a push and never as the thing
 * that happened.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private static final Object[] NO_ARGS = new Object[0];

    private final DeviceRepository devices;
    private final PushOutboxRepository outbox;
    private final MessageSource messages;
    private final ObjectMapper json;
    private final Clock clock;

    public PushService(DeviceRepository devices,
                       PushOutboxRepository outbox,
                       MessageSource messages,
                       ObjectMapper json,
                       Clock clock) {
        this.devices = devices;
        this.outbox = outbox;
        this.messages = messages;
        this.json = json;
        this.clock = clock;
    }

    /** No event to name and nothing to deep-link to. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void enqueue(UUID userId, PushKind kind) {
        enqueue(userId, kind, List.of(), Map.of());
    }

    /**
     * @param args copy arguments; {@code args.get(0)} is the event name wherever a
     *             body names one. Empty falls back to the kind's {@code .noEvent}
     *             body when the bundle has one.
     * @param data ids the app deep-links with — {@code eventId}, {@code threadId},
     *             {@code postId}, {@code messageId}. Never a name or a hint.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void enqueue(UUID userId, PushKind kind, List<String> args, Map<String, String> data) {
        if (userId == null) {
            return;
        }
        String locale = localeOf(userId);
        if (locale == null) {
            // Nowhere to deliver. Not an error: most accounts will have a phone,
            // and the ones that do not are simply not notified.
            log.debug("no device for {}; {} not enqueued", userId, kind.wire());
            return;
        }
        List<String> copyArgs = args == null ? List.of() : List.copyOf(args);
        Locale language = language(locale);
        String title = messages.getMessage(kind.titleKey(), NO_ARGS, language);
        String body = body(kind, copyArgs, language);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", kind.wire());
        payload.put("args", copyArgs);
        payload.put("title", title);
        payload.put("body", body);
        payload.put("data", data == null ? Map.of() : new LinkedHashMap<>(data));

        Instant now = Instant.now(clock);
        outbox.save(PushOutbox.of(userId, kind, locale, write(payload), now));
    }

    /* ------------------------------------------------------------- internals */

    /** The account's language, or null when there is no phone to send to. */
    private String localeOf(UUID userId) {
        return devices.findFirstByUserIdOrderByLastSeenAtDescIdDesc(userId)
                .map(Device::getLocale)
                .map(PushService::supported)
                .orElse(null);
    }

    private String body(PushKind kind, List<String> args, Locale language) {
        if (args.isEmpty()) {
            String withoutEvent =
                    messages.getMessage(kind.bodyKeyWithoutEvent(), NO_ARGS, null, language);
            if (withoutEvent != null) {
                return withoutEvent;
            }
        }
        return messages.getMessage(kind.bodyKey(), args.toArray(), language);
    }

    private String write(Map<String, Object> payload) {
        try {
            return json.writeValueAsString(payload);
        } catch (JsonProcessingException impossible) {
            // Strings and maps of strings only.
            throw new IllegalStateException("push payload is not serialisable", impossible);
        }
    }

    /** A locale the bundle has; anything else is English, never a failed lookup. */
    static String supported(String locale) {
        return Device.LOCALE_TR.equals(locale) ? Device.LOCALE_TR : Device.LOCALE_EN;
    }

    static Locale language(String locale) {
        return Device.LOCALE_TR.equals(locale) ? Locale.forLanguageTag("tr") : Locale.ENGLISH;
    }
}
