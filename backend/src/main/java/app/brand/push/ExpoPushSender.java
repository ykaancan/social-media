package app.brand.push;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * [B8] Expo's push service: one server credential, and it fans out to FCM and
 * APNs. The right cost for a few hundred people at one event, and the reason the
 * app can stay on the Expo toolchain.
 *
 * <p>One request carries at most {@link PushProperties#EXPO_MAX_BATCH} messages
 * and one message carries exactly one token, because Expo answers with a ticket
 * per message <em>in request order</em> — one token per message is what makes
 * "this ticket is about this phone" a fact rather than an assumption about how the
 * service expands an array.
 *
 * <p>The one ticket status that means something durable is
 * {@code DeviceNotRegistered}: the app was uninstalled, or the token was rotated.
 * It is reported back so the device row is deleted rather than retried five times
 * and then given up on for the rest of that phone's life. Every other failure is
 * an ordinary error and the row is tried again on the next pass.
 */
public class ExpoPushSender implements PushSender {

    /** Expo's documented endpoint. */
    public static final String ENDPOINT = "https://exp.host/--/api/v2/push/send";

    /** The ticket detail that means "this token is dead". */
    private static final String DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);

    private final RestClient http;
    private final PushProperties properties;

    public ExpoPushSender(RestClient.Builder builder, PushProperties properties) {
        this.properties = properties;
        RestClient.Builder configured = builder
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                // Expo's own client sends these two; without them the service may
                // answer a gzipped body the default converters will not read.
                .defaultHeader(HttpHeaders.ACCEPT_ENCODING, "gzip, deflate");
        if (properties.hasAccessToken()) {
            configured = configured.defaultHeader(HttpHeaders.AUTHORIZATION,
                    "Bearer " + properties.expoAccessToken());
        }
        this.http = configured.build();
    }

    @Override
    public List<PushResult> send(List<PushMessage> batch) {
        // One entry per (message, token). Tickets come back in this order.
        List<PushMessage> owners = new ArrayList<>();
        List<String> tokens = new ArrayList<>();
        List<Map<String, Object>> requests = new ArrayList<>();
        Map<UUID, Outcome> outcomes = new LinkedHashMap<>();

        for (PushMessage message : batch) {
            outcomes.put(message.id(), new Outcome());
            for (String token : message.tokens()) {
                owners.add(message);
                tokens.add(token);
                requests.add(body(message, token));
            }
        }

        for (int from = 0; from < requests.size(); from += PushProperties.EXPO_MAX_BATCH) {
            int to = Math.min(from + PushProperties.EXPO_MAX_BATCH, requests.size());
            post(requests.subList(from, to), owners.subList(from, to), tokens.subList(from, to),
                    outcomes);
        }

        List<PushResult> results = new ArrayList<>(batch.size());
        for (PushMessage message : batch) {
            Outcome outcome = outcomes.get(message.id());
            List<String> dead = List.copyOf(outcome.unregistered);
            // Every phone this was addressed to is gone: there is nothing left to
            // retry, so the row is finished rather than tried five more times.
            boolean nobodyLeft = !message.tokens().isEmpty() && dead.size() == message.tokens().size();
            results.add(outcome.delivered || nobodyLeft
                    ? PushResult.delivered(message.id(), dead)
                    : PushResult.failed(message.id(),
                            outcome.error == null ? "no ticket" : outcome.error, dead));
        }
        return results;
    }

    /* ------------------------------------------------------------- internals */

    private void post(List<Map<String, Object>> requests,
                      List<PushMessage> owners,
                      List<String> tokens,
                      Map<UUID, Outcome> outcomes) {
        JsonNode response;
        try {
            response = http.post()
                    .uri(ENDPOINT)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requests)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException failed) {
            // The whole chunk is undelivered; every row in it is tried again.
            String error = failed.getMessage();
            log.warn("expo push request failed for {} message(s)", requests.size(), failed);
            for (PushMessage owner : owners) {
                outcomes.get(owner.id()).fail(error);
            }
            return;
        }

        JsonNode tickets = response == null ? null : response.get("data");
        for (int index = 0; index < owners.size(); index++) {
            Outcome outcome = outcomes.get(owners.get(index).id());
            JsonNode ticket = tickets != null && tickets.isArray() && index < tickets.size()
                    ? tickets.get(index) : null;
            if (ticket == null) {
                outcome.fail("no ticket");
                continue;
            }
            if ("ok".equals(ticket.path("status").asText())) {
                outcome.deliver();
                continue;
            }
            String detail = ticket.path("details").path("error").asText("");
            if (DEVICE_NOT_REGISTERED.equals(detail)) {
                outcome.unregistered.add(tokens.get(index));
                // A phone that no longer exists is not a failure of this
                // notification; it is a device row that should not exist either.
                outcome.fail(DEVICE_NOT_REGISTERED);
                continue;
            }
            outcome.fail(ticket.path("message").asText(detail.isEmpty() ? "push refused" : detail));
        }
    }

    private Map<String, Object> body(PushMessage message, String token) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("to", token);
        body.put("title", message.title());
        body.put("body", message.body());
        body.put("sound", "default");
        body.put("data", message.data());
        return body;
    }

    /** What the tickets for one outbox row added up to. */
    private static final class Outcome {
        private boolean delivered;
        private String error;
        private final Set<String> unregistered = new LinkedHashSet<>();

        void deliver() {
            delivered = true;
        }

        void fail(String message) {
            if (error == null) {
                error = message;
            }
        }
    }
}
