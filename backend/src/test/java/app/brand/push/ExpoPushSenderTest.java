package app.brand.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import app.brand.push.PushSender.PushMessage;
import app.brand.push.PushSender.PushResult;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * The shape of the request that leaves for Expo, and what is made of the answer.
 *
 * <p>No database and no Spring context: this is the one class in the push package
 * that talks to somebody else's API, and what it is worth pinning down is the wire
 * format — one message per token so a ticket maps to a phone, the bearer when a
 * token is configured, and {@code DeviceNotRegistered} coming back as a token to
 * forget rather than as an error to retry.
 */
class ExpoPushSenderTest {

    private static final String TOKEN_A = "ExponentPushToken[aaaa]";
    private static final String TOKEN_B = "ExponentPushToken[bbbb]";

    @Test
    @DisplayName("one message per token, with the copy already rendered and the data ids attached")
    void requestShape() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExpoPushSender sender = new ExpoPushSender(builder, properties("expo-secret"));

        server.expect(requestTo(ExpoPushSender.ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer expo-secret"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].to").value(TOKEN_A))
                .andExpect(jsonPath("$[0].title").value("New message"))
                .andExpect(jsonPath("$[0].body").value("Someone wrote on your wall at Welcome night."))
                .andExpect(jsonPath("$[0].data.eventId").value("event-1"))
                .andExpect(jsonPath("$[1].to").value(TOKEN_B))
                .andRespond(withSuccess("""
                        {"data":[{"status":"ok","id":"ticket-1"},{"status":"ok","id":"ticket-2"}]}
                        """, MediaType.APPLICATION_JSON));

        PushMessage message = message(List.of(TOKEN_A, TOKEN_B));
        List<PushResult> results = sender.send(List.of(message));

        server.verify();
        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.delivered()).isTrue();
            assertThat(result.unregisteredTokens()).isEmpty();
        });
    }

    @Test
    @DisplayName("DeviceNotRegistered comes back as a token to forget, not as a failure to retry")
    void unregisteredTokenIsReported() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExpoPushSender sender = new ExpoPushSender(builder, properties(""));

        server.expect(requestTo(ExpoPushSender.ENDPOINT))
                // No access token configured: the request goes out unauthenticated.
                .andExpect(headerDoesNotExist(HttpHeaders.AUTHORIZATION))
                .andRespond(withSuccess("""
                        {"data":[
                          {"status":"ok","id":"ticket-1"},
                          {"status":"error","message":"not registered",
                           "details":{"error":"DeviceNotRegistered"}}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        List<PushResult> results = sender.send(List.of(message(List.of(TOKEN_A, TOKEN_B))));

        server.verify();
        assertThat(results).singleElement().satisfies(result -> {
            // One phone still got it, so the row is done.
            assertThat(result.delivered()).isTrue();
            assertThat(result.unregisteredTokens()).containsExactly(TOKEN_B);
        });
    }

    @Test
    @DisplayName("every phone gone means the row is finished, not retried five more times")
    void allTokensUnregisteredFinishesTheRow() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExpoPushSender sender = new ExpoPushSender(builder, properties(""));

        server.expect(requestTo(ExpoPushSender.ENDPOINT))
                .andRespond(withSuccess("""
                        {"data":[{"status":"error","message":"gone",
                                  "details":{"error":"DeviceNotRegistered"}}]}
                        """, MediaType.APPLICATION_JSON));

        List<PushResult> results = sender.send(List.of(message(List.of(TOKEN_A))));

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.delivered()).isTrue();
            assertThat(result.unregisteredTokens()).containsExactly(TOKEN_A);
        });
    }

    @Test
    @DisplayName("a refused request fails the row with its reason, and keeps every token")
    void transportFailureIsAnOrdinaryFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExpoPushSender sender = new ExpoPushSender(builder, properties("expo-secret"));

        server.expect(requestTo(ExpoPushSender.ENDPOINT)).andRespond(withServerError());

        List<PushResult> results = sender.send(List.of(message(List.of(TOKEN_A))));

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.delivered()).isFalse();
            assertThat(result.error()).isNotBlank();
            assertThat(result.unregisteredTokens()).isEmpty();
        });
    }

    @Test
    @DisplayName("an outbox row with no device left is not sent anywhere")
    void noTokensNoRequest() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExpoPushSender sender = new ExpoPushSender(builder, properties(""));

        List<PushResult> results = sender.send(List.of(message(List.of())));

        server.verify();
        assertThat(results).singleElement()
                .satisfies(result -> assertThat(result.delivered()).isFalse());
    }

    private static PushProperties properties(String accessToken) {
        return new PushProperties(true, accessToken, null, PushProperties.EXPO_MAX_BATCH);
    }

    private static PushMessage message(List<String> tokens) {
        PushOutbox row = PushOutbox.of(UUID.randomUUID(), PushKind.INBOX_NEW, "en", "{}",
                Instant.now());
        return new PushMessage(row, tokens, "New message",
                "Someone wrote on your wall at Welcome night.",
                Map.of("eventId", "event-1"));
    }
}
