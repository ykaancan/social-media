package app.brand.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.fail;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractWebSocketIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.lang.reflect.Type;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.messaging.simp.stomp.ConnectionLostException;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/**
 * The realtime contract [B12], driven exactly the way the app drives it: a raw
 * WebSocket at {@code /ws}, a STOMP {@code CONNECT} carrying the access token,
 * and subscriptions to the three destinations {@code http.ts} names.
 *
 * <p>Nothing here asserts on a frame's body — there is none. What is asserted is
 * who gets told and who does not.
 */
class RealtimeIntegrationTest extends AbstractWebSocketIntegrationTest {

    private static final String JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    /** The one message every refused SUBSCRIBE gets, whatever the reason. */
    private static final String REFUSED = "not allowed";

    /** How long a frame that should never arrive is waited for. */
    private static final long SILENCE_MILLIS = 1_500;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ApplicationEventPublisher publisher;

    private WebSocketStompClient client;
    private ThreadPoolTaskScheduler scheduler;
    private final List<StompSession> opened = new ArrayList<>();
    /** The {@code message} header of every STOMP ERROR frame this test received. */
    private final BlockingQueue<String> refusals = new LinkedBlockingQueue<>();

    @BeforeEach
    void startClient() {
        scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("test-stomp-");
        scheduler.initialize();

        client = new WebSocketStompClient(new StandardWebSocketClient());
        // Empty bodies: a String converter with no strict content-type match
        // reads them as "".
        client.setMessageConverter(new StringMessageConverter());
        client.setTaskScheduler(scheduler);
        client.setDefaultHeartbeat(new long[] {10_000, 10_000});
    }

    /**
     * The suite shares one database and {@code SchemaMigrationTest} asserts that
     * nothing is seeded, so every event this class creates goes away again.
     */
    @AfterEach
    void closeSessionsAndClearEvents() {
        for (StompSession session : opened) {
            try {
                if (session.isConnected()) {
                    session.disconnect();
                }
            } catch (RuntimeException ignored) {
                // A refused subscription has already closed this one.
            }
        }
        opened.clear();
        client.stop();
        scheduler.destroy();
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
    }

    /* ----------------------------------------------------------- CONNECT */

    @Test
    @DisplayName("CONNECT with a valid access token opens a session")
    void connectWithAValidToken() throws Exception {
        AppUser member = account(AccountStatus.APPROVED);

        StompSession session = connect(bearer(member));

        assertThat(session.isConnected()).isTrue();
    }

    @Test
    @DisplayName("CONNECT without an Authorization header is refused")
    void connectWithoutAToken() throws Exception {
        assertThatThrownBy(() -> connectExpectingRefusal(null))
                .as("the connect future must fail, not hand back a usable session")
                .isInstanceOf(ExecutionException.class)
                .hasRootCauseInstanceOf(ConnectionLostException.class);
        assertThat(refusal()).isEqualTo("unauthorized");
    }

    @Test
    @DisplayName("CONNECT with a token that does not verify is refused")
    void connectWithAForgedToken() throws Exception {
        assertThatThrownBy(() -> connectExpectingRefusal("Bearer not.a.token"))
                .isInstanceOf(ExecutionException.class)
                .hasRootCauseInstanceOf(ConnectionLostException.class);
        assertThat(refusal()).isEqualTo("unauthorized");
    }

    @Test
    @DisplayName("CONNECT from a pending account is refused: pending cannot use the app yet")
    void connectWhilePending() throws Exception {
        AppUser waiting = account(AccountStatus.PENDING);

        assertThatThrownBy(() -> connectExpectingRefusal(bearer(waiting)))
                .isInstanceOf(ExecutionException.class)
                .hasRootCauseInstanceOf(ConnectionLostException.class);
        // Exactly what a forged token gets: an approval queue is not a probe.
        assertThat(refusal()).isEqualTo("unauthorized");
    }

    /* --------------------------------------------- /topic/events/{id}/board */

    @Test
    @DisplayName("a member subscribed to the board topic is told when the board changes")
    void boardTopicReachesAMember() throws Exception {
        AppUser member = account(AccountStatus.APPROVED);
        UUID eventId = event(member);
        join(eventId, member);

        BlockingQueue<String> frames = subscribe(connect(bearer(member)),
                "/topic/events/" + eventId + "/board");

        awaitFrame(frames, () -> publisher.publishEvent(BoardChanged.publicOnly(eventId)));
    }

    @Test
    @DisplayName("someone who is not a member of the board hears nothing from it")
    void boardTopicIgnoresAStranger() throws Exception {
        AppUser member = account(AccountStatus.APPROVED);
        AppUser stranger = account(AccountStatus.APPROVED);
        UUID eventId = event(member);
        join(eventId, member);

        // The SUBSCRIBE is refused server-side, which ends the session; the
        // observable promise is that no frame from this board ever arrives.
        BlockingQueue<String> frames = subscribe(connect(bearer(stranger)),
                "/topic/events/" + eventId + "/board");

        publisher.publishEvent(BoardChanged.publicOnly(eventId));
        assertSilence(frames);
        assertThat(refusal()).isEqualTo(REFUSED);
    }

    @Test
    @DisplayName("a board id that does not exist is refused exactly like one you are not in")
    void boardTopicIgnoresAnUnknownEvent() throws Exception {
        AppUser member = account(AccountStatus.APPROVED);
        UUID nobodysEvent = UUID.randomUUID();

        BlockingQueue<String> frames = subscribe(connect(bearer(member)),
                "/topic/events/" + nobodysEvent + "/board");

        publisher.publishEvent(BoardChanged.publicOnly(nobodysEvent));
        assertSilence(frames);
        // Character for character what the stranger above was told, which is the
        // whole point: a join code cannot be probed over the socket either.
        assertThat(refusal()).isEqualTo(REFUSED);
    }

    /* ---------------------------------------------- /user/queue/events/{id} */

    @Test
    @DisplayName("the private board queue reaches only the people named in the event")
    void ownEventQueueIsPrivate() throws Exception {
        AppUser sender = account(AccountStatus.APPROVED);
        AppUser other = account(AccountStatus.APPROVED);
        UUID eventId = event(sender);
        join(eventId, sender);
        join(eventId, other);

        BlockingQueue<String> mine = subscribe(connect(bearer(sender)), "/user/queue/events/" + eventId);
        BlockingQueue<String> theirs = subscribe(connect(bearer(other)), "/user/queue/events/" + eventId);

        awaitFrame(mine, () -> publisher.publishEvent(new BoardChanged(eventId, Set.of(sender.getId()))));
        assertSilence(theirs);
    }

    /* ------------------------------------------------- /user/queue/threads */

    @Test
    @DisplayName("the threads queue reaches each named person and nobody else")
    void threadsQueueIsPerUser() throws Exception {
        AppUser participant = account(AccountStatus.APPROVED);
        AppUser bystander = account(AccountStatus.APPROVED);

        BlockingQueue<String> mine = subscribe(connect(bearer(participant)), "/user/queue/threads");
        BlockingQueue<String> theirs = subscribe(connect(bearer(bystander)), "/user/queue/threads");

        awaitFrame(mine, () -> publisher.publishEvent(new ThreadsChanged(Set.of(participant.getId()))));
        assertSilence(theirs);
    }

    /* ----------------------------------------------------------- the rest */

    @Test
    @DisplayName("a destination outside the three the app uses delivers nothing")
    void foreignDestinationsAreRefused() throws Exception {
        AppUser member = account(AccountStatus.APPROVED);
        UUID eventId = event(member);
        join(eventId, member);

        BlockingQueue<String> frames = subscribe(connect(bearer(member)), "/topic/anything");

        // Whatever else happens on this server, nothing lands on that topic.
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
        assertSilence(frames);
        assertThat(refusal()).isEqualTo(REFUSED);
    }

    /* ------------------------------------------------------------ helpers */

    /**
     * Publishes until a frame arrives. The SUBSCRIBE travels asynchronously, so a
     * single publish could legitimately beat the broker's registration; repeating
     * it removes the race without a sleep.
     */
    private void awaitFrame(BlockingQueue<String> frames, Runnable publish) throws InterruptedException {
        for (int attempt = 0; attempt < 25; attempt++) {
            publish.run();
            String frame = frames.poll(200, TimeUnit.MILLISECONDS);
            if (frame != null) {
                assertThat(frame).as("invalidation frames carry no content").isEmpty();
                return;
            }
        }
        fail("no invalidation frame arrived");
    }

    private void assertSilence(BlockingQueue<String> frames) throws InterruptedException {
        assertThat(frames.poll(SILENCE_MILLIS, TimeUnit.MILLISECONDS))
                .as("this subscription must never receive anything")
                .isNull();
    }

    private BlockingQueue<String> subscribe(StompSession session, String destination) {
        BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        session.subscribe(destination, new StompFrameHandler() {

            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                frames.add(payload == null ? "" : payload.toString());
            }
        });
        return frames;
    }

    private StompSession connect(String authorization) throws Exception {
        StompSession connected = connectAsync(authorization).get(10, TimeUnit.SECONDS);
        opened.add(connected);
        return connected;
    }

    /**
     * A refused CONNECT is an ERROR frame and a closed socket, so the future
     * either fails or never completes; both are "no session", and the shorter
     * timeout keeps the negative cases quick.
     */
    private void connectExpectingRefusal(String authorization) throws Exception {
        StompSession connected = connectAsync(authorization).get(5, TimeUnit.SECONDS);
        opened.add(connected);
    }

    private CompletableFuture<StompSession> connectAsync(String authorization) {
        StompHeaders connectHeaders = new StompHeaders();
        if (authorization != null) {
            connectHeaders.add("Authorization", authorization);
        }
        return client.connectAsync(
                websocketUrl(), new WebSocketHttpHeaders(), connectHeaders, new StompSessionHandlerAdapter() {

                    /** Only ERROR frames reach the session handler. */
                    @Override
                    public void handleFrame(StompHeaders headers, Object payload) {
                        String message = headers.getFirst("message");
                        refusals.add(message == null ? "" : message);
                    }
                });
    }

    /** The {@code message} header of the ERROR frame the server answered with. */
    private String refusal() throws InterruptedException {
        return refusals.poll(5, TimeUnit.SECONDS);
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private AppUser account(AccountStatus status) {
        AppUser user = AppUser.register(
                "realtime-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        user.setName("Member " + UUID.randomUUID().toString().substring(0, 4));
        user.setSection(anySection());
        return users.saveAndFlush(user);
    }

    /** Plain SQL: this suite is about frames, not about /events. */
    private UUID event(AppUser creator) {
        UUID id = UUID.randomUUID();
        Instant starts = Instant.now().minus(1, ChronoUnit.HOURS);
        jdbc.update("insert into event (id, name, scope, section_id, starts_at, ends_at, cover, board_mode,"
                        + " join_code, creator_id) values (?, ?, 'section', ?, ?, ?, 'azure', 'approve_first', ?, ?)",
                id, "Realtime night", creator.getSection().getId(),
                Timestamp.from(starts), Timestamp.from(starts.plus(4, ChronoUnit.HOURS)),
                joinCode(), creator.getId());
        return id;
    }

    private void join(UUID eventId, AppUser user) {
        jdbc.update("insert into event_member (event_id, user_id, is_moderator) values (?, ?, false)",
                eventId, user.getId());
    }

    private static String joinCode() {
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            code.append(JOIN_CODE_ALPHABET.charAt(RANDOM.nextInt(JOIN_CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    private Section anySection() {
        return sections.findAll().stream().min(Comparator.comparing(Section::getName)).orElseThrow();
    }
}
