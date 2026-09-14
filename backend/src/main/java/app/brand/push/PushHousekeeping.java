package app.brand.push;

import app.brand.push.PushSender.PushMessage;
import app.brand.push.PushSender.PushResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Drains the outbox [B8]: the only place a notification actually leaves.
 *
 * <p>Shape of a pass, and why it is three steps rather than one transaction:
 *
 * <ol>
 *   <li><b>Read</b> the oldest unsent rows that still have attempts left, with the
 *       devices they go to.</li>
 *   <li><b>Send</b> — an HTTP call to a third party, outside any transaction. A
 *       database transaction held open across somebody else's network is how a
 *       connection pool dies.</li>
 *   <li><b>Apply</b> the results in one transaction: sent, or one more attempt and
 *       the reason; and delete the device rows the provider says are gone.</li>
 * </ol>
 *
 * <p>Ordering is oldest first, so a backlog drains in the order things happened.
 * After {@link PushOutbox#MAX_ATTEMPTS} the row is left alone — a notification is
 * the least durable thing in the product, and a push about something that happened
 * several minutes ago is worth less than the next one in the queue.
 *
 * <p>Like {@code BoardHousekeeping}, the bean always exists and the annotation is
 * inert unless {@code brand.housekeeping.enabled} switched scheduling on, so a test
 * drives {@link #run()} at the instant it chooses instead of racing a timer.
 */
@Component
public class PushHousekeeping {

    /** A sent row is kept this long, so "did it go out?" stays answerable. */
    public static final Duration KEEP_SENT = Duration.ofDays(7);

    private static final Logger log = LoggerFactory.getLogger(PushHousekeeping.class);

    private static final TypeReference<Map<String, Object>> DATA = new TypeReference<>() {
    };

    private final PushOutboxRepository outbox;
    private final DeviceRepository devices;
    private final PushSender sender;
    private final PushProperties properties;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public PushHousekeeping(PushOutboxRepository outbox,
                            DeviceRepository devices,
                            PushSender sender,
                            PushProperties properties,
                            ObjectMapper json,
                            Clock clock,
                            PlatformTransactionManager transactionManager) {
        this.outbox = outbox;
        this.devices = devices;
        this.sender = sender;
        this.properties = properties;
        this.json = json;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${brand.push.interval:5000}")
    public void run() {
        try {
            drain();
        } catch (RuntimeException failed) {
            // A failed pass must not kill the scheduler; the next one picks up the
            // same rows, one attempt later.
            log.warn("push drain failed", failed);
        }
        try {
            purge();
        } catch (RuntimeException failed) {
            log.warn("push purge failed", failed);
        }
    }

    /** One pass. Returns how many rows it took, which is what the tests assert on. */
    public int drain() {
        List<PushOutbox> rows = transactions.execute(status ->
                outbox.pending(PushOutbox.MAX_ATTEMPTS, Limit.of(properties.batchSize())));
        if (rows == null || rows.isEmpty()) {
            return 0;
        }
        Map<UUID, List<Device>> byUser = transactions.execute(status -> devicesFor(rows));
        List<PushMessage> batch = new ArrayList<>(rows.size());
        for (PushOutbox row : rows) {
            batch.add(message(row, byUser == null
                    ? List.of() : byUser.getOrDefault(row.getUserId(), List.of())));
        }

        List<PushResult> results;
        try {
            results = sender.send(batch);
        } catch (RuntimeException failed) {
            log.warn("push sender threw for {} row(s)", batch.size(), failed);
            results = batch.stream()
                    .map(message -> PushResult.failed(message.id(), String.valueOf(failed), List.of()))
                    .toList();
        }
        List<PushResult> applied = results;
        transactions.executeWithoutResult(status -> apply(rows, applied));
        return rows.size();
    }

    /** Sent rows older than {@link #KEEP_SENT}. An unsent row is never purged. */
    public long purge() {
        Long removed = transactions.execute(status ->
                outbox.deleteBySentAtNotNullAndSentAtBefore(Instant.now(clock).minus(KEEP_SENT)));
        return removed == null ? 0 : removed;
    }

    /* ------------------------------------------------------------- internals */

    private Map<UUID, List<Device>> devicesFor(List<PushOutbox> rows) {
        List<UUID> userIds = rows.stream().map(PushOutbox::getUserId).distinct().toList();
        Map<UUID, List<Device>> byUser = new HashMap<>();
        for (Device device : devices.findByUserIdIn(userIds)) {
            byUser.computeIfAbsent(device.getUserId(), any -> new ArrayList<>()).add(device);
        }
        return byUser;
    }

    private void apply(List<PushOutbox> rows, List<PushResult> results) {
        Map<UUID, PushResult> byId = new LinkedHashMap<>();
        Set<String> unregistered = new LinkedHashSet<>();
        for (PushResult result : results) {
            byId.put(result.outboxId(), result);
            unregistered.addAll(result.unregisteredTokens());
        }

        Instant now = Instant.now(clock);
        List<PushOutbox> changed = new ArrayList<>(rows.size());
        for (PushOutbox row : rows) {
            PushOutbox managed = outbox.findById(row.getId()).orElse(null);
            if (managed == null) {
                continue;
            }
            PushResult result = byId.get(row.getId());
            if (result == null) {
                // A row the sender said nothing about is not a row that was delivered.
                managed.markFailed("no result");
            } else if (result.delivered()) {
                managed.markSent(now);
            } else {
                managed.markFailed(result.error());
            }
            if (managed.isGivenUp()) {
                log.warn("push {} given up after {} attempts: {}",
                        managed.getKind(), managed.getAttempts(), managed.getLastError());
            }
            changed.add(managed);
        }
        outbox.saveAllAndFlush(changed);

        // The provider knows about a phone before we do: a token it rejects as
        // unregistered is an uninstalled app, and its row only costs attempts.
        for (String token : unregistered) {
            devices.deleteByPushToken(token);
        }
    }

    /** A row plus the phones it goes to, with the copy read back out of the payload. */
    private PushMessage message(PushOutbox row, List<Device> targets) {
        String title = "";
        String body = "";
        Map<String, Object> data = Map.of();
        try {
            JsonNode payload = json.readTree(row.getPayload());
            title = payload.path("title").asText("");
            body = payload.path("body").asText("");
            JsonNode node = payload.get("data");
            if (node != null && node.isObject()) {
                data = json.convertValue(node, DATA);
            }
        } catch (Exception unreadable) {
            // Written by this application one insert ago. If it is unreadable the
            // row is unsendable; it burns its attempts rather than blocking others.
            log.warn("unreadable push payload on {}", row.getId(), unreadable);
        }
        return new PushMessage(row, targets.stream().map(Device::getPushToken).toList(),
                title, body, data);
    }
}
