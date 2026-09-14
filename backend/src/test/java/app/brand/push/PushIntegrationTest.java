package app.brand.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.events.AccountApproved;
import app.brand.common.events.PostModerated;
import app.brand.common.events.ThreadMessageSent;
import app.brand.common.events.UserWarned;
import app.brand.message.InboxMessageDelivered;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.support.RecordingPushSender;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/**
 * [B8] Push: the device registry, the copy, and who is notified about what.
 *
 * <p>The cases worth naming: a token that moves to another phone's owner re-binds
 * rather than notifying the wrong person; an account with no device generates no
 * row at all; a muted word suppresses the push and tells the sender nothing [D10];
 * a Turkish device gets Turkish copy; and nothing a body says could identify an
 * anonymous sender.
 *
 * <p>The listeners are driven by publishing the domain events directly. They are
 * {@code AFTER_COMMIT, fallbackExecution = true}, so a publish outside a
 * transaction runs them at once — which is exactly what makes "does this event
 * produce this notification" a question with one answer.
 */
class PushIntegrationTest extends AbstractIntegrationTest {

    private static final String TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
    private static final String OTHER_TOKEN = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private DeviceRepository devices;

    @Autowired
    private PushOutboxRepository outbox;

    @Autowired
    private PushHousekeeping housekeeping;

    @Autowired
    private RecordingPushSender sender;

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        clock.freezeAt(base);
        sender.reset();
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        sender.reset();
        jdbc.update("delete from push_outbox");
        jdbc.update("delete from device");
        jdbc.update("delete from thread");
        jdbc.update("delete from board_post");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'push-%')");
    }

    /* ------------------------------------------------------ PUT /me/devices */

    @Test
    @DisplayName("registering is an upsert by token, and a token that moves accounts re-binds")
    void registrationUpsertsByToken() throws Exception {
        AppUser owner = approved("Deniz");
        AppUser second = approved("Ece");

        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        Device device = devices.findByPushToken(TOKEN).orElseThrow();
        assertThat(device.getUserId()).isEqualTo(owner.getId());
        assertThat(device.getPlatform()).isEqualTo("ios");
        assertThat(device.getLocale()).isEqualTo("en");
        assertThat(device.getLastSeenAt()).isEqualTo(base);

        clock.freezeAt(base.plusSeconds(60));
        register(owner, TOKEN, "android", "tr").andExpect(status().isNoContent());
        assertThat(devices.findAll()).hasSize(1);
        device = devices.findByPushToken(TOKEN).orElseThrow();
        assertThat(device.getPlatform()).isEqualTo("android");
        assertThat(device.getLocale()).isEqualTo("tr");
        assertThat(device.getLastSeenAt()).isEqualTo(base.plusSeconds(60));

        // The phone was handed to somebody else, who signed in. One row, one owner.
        register(second, TOKEN, "android", "tr").andExpect(status().isNoContent());
        assertThat(devices.findAll()).hasSize(1);
        assertThat(devices.findByPushToken(TOKEN).orElseThrow().getUserId()).isEqualTo(second.getId());
        assertThat(devices.findByUserId(owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("the platform and the locale are validated, and a regional tag narrows to its language")
    void registrationValidates() throws Exception {
        AppUser owner = approved("Deniz");

        register(owner, "  ", "ios", "en")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("token"));
        register(owner, TOKEN, "windows", "en")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("platform"));
        register(owner, TOKEN, "ios", "de")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("locale"));
        assertThat(devices.findAll()).isEmpty();

        register(owner, TOKEN, "IOS", "tr-TR").andExpect(status().isNoContent());
        Device device = devices.findByPushToken(TOKEN).orElseThrow();
        assertThat(device.getPlatform()).isEqualTo("ios");
        assertThat(device.getLocale()).isEqualTo("tr");

        // No locale at all is English, the product's default.
        register(owner, OTHER_TOKEN, "web", null).andExpect(status().isNoContent());
        assertThat(devices.findByPushToken(OTHER_TOKEN).orElseThrow().getLocale()).isEqualTo("en");
    }

    @Test
    @DisplayName("sign-out deletes only the caller's own device row")
    void unregisterIsScopedToTheCaller() throws Exception {
        AppUser owner = approved("Deniz");
        AppUser other = approved("Ece");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        register(other, OTHER_TOKEN, "android", "tr").andExpect(status().isNoContent());

        mockMvc.perform(delete("/me/devices/" + OTHER_TOKEN)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());
        assertThat(devices.findByPushToken(OTHER_TOKEN)).isPresent();

        mockMvc.perform(delete("/me/devices/" + TOKEN)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());
        assertThat(devices.findByPushToken(TOKEN)).isEmpty();
    }

    @Test
    @DisplayName("device registration is a member route: a pending account is refused")
    void registrationRequiresApproval() throws Exception {
        AppUser pending = approved("Mert");
        pending.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(pending);

        register(pending, TOKEN, "ios", "en")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    /* ------------------------------------------------------------- the outbox */

    @Test
    @DisplayName("an account with no device produces no outbox row at all")
    void noDeviceNoRow() {
        AppUser owner = approved("Deniz");
        UUID eventId = event("Welcome night");

        publisher.publishEvent(new InboxMessageDelivered(UUID.randomUUID(), owner.getId(), eventId, false));
        publisher.publishEvent(new AccountApproved(owner.getId()));

        assertThat(outbox.findAll()).isEmpty();
    }

    @Test
    @DisplayName("a delivered message names the event, carries ids only, and says nothing about the sender")
    void inboxPushIsGenericAndCarriesIds() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        UUID eventId = event("Welcome night");
        UUID messageId = UUID.randomUUID();

        publisher.publishEvent(new InboxMessageDelivered(messageId, owner.getId(), eventId, false));

        PushOutbox row = only(owner);
        assertThat(row.getKind()).isEqualTo("inbox_new");
        assertThat(row.getLocale()).isEqualTo("en");
        assertThat(row.getSentAt()).isNull();
        assertThat(row.getAttempts()).isZero();

        JsonNode payload = objectMapper.readTree(row.getPayload());
        assertThat(payload.get("title").asText()).isEqualTo("New message");
        assertThat(payload.get("body").asText()).isEqualTo("Someone wrote on your wall at Welcome night.");
        assertThat(payload.get("data").get("messageId").asText()).isEqualTo(messageId.toString());
        assertThat(payload.get("data").get("eventId").asText()).isEqualTo(eventId.toString());
        // Nothing that could name the person who wrote it.
        assertThat(row.getPayload()).doesNotContain("senderId").doesNotContain("Deniz");
    }

    @Test
    @DisplayName("[D10] a suppressed push writes nothing: a muted word never reaches a lock screen")
    void suppressedDeliveryWritesNothing() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());

        publisher.publishEvent(new InboxMessageDelivered(
                UUID.randomUUID(), owner.getId(), event("Welcome night"), true));

        assertThat(outbox.findAll()).isEmpty();
    }

    @Test
    @DisplayName("the copy is the device's language, decided when the row is written")
    void copyFollowsTheDeviceLocale() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "android", "tr").andExpect(status().isNoContent());
        UUID eventId = event("Hoş geldin gecesi");

        publisher.publishEvent(new InboxMessageDelivered(UUID.randomUUID(), owner.getId(), eventId, false));

        PushOutbox row = only(owner);
        assertThat(row.getLocale()).isEqualTo("tr");
        JsonNode payload = objectMapper.readTree(row.getPayload());
        assertThat(payload.get("title").asText()).isEqualTo("Yeni mesaj");
        assertThat(payload.get("body").asText())
                .isEqualTo("Hoş geldin gecesi etkinliğinde biri duvarına yazdı.");
    }

    @Test
    @DisplayName("two phones in two languages: the one last seen decides")
    void mostRecentlySeenDeviceDecidesTheLanguage() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        clock.freezeAt(base.plusSeconds(30));
        register(owner, OTHER_TOKEN, "android", "tr").andExpect(status().isNoContent());

        publisher.publishEvent(new AccountApproved(owner.getId()));

        assertThat(only(owner).getLocale()).isEqualTo("tr");
    }

    @Test
    @DisplayName("a thread reply is notified only while thread notifications are on")
    void threadPushRespectsItsPreference() throws Exception {
        AppUser owner = approved("Deniz");
        AppUser other = approved("Ece");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        UUID eventId = event("Welcome night");
        UUID threadId = thread(eventId, other);

        publisher.publishEvent(new ThreadMessageSent(threadId, UUID.randomUUID(), other.getId(),
                owner.getId()));

        PushOutbox row = only(owner);
        assertThat(row.getKind()).isEqualTo("thread_message");
        JsonNode payload = objectMapper.readTree(row.getPayload());
        assertThat(payload.get("body").asText()).isEqualTo("New reply in a thread from Welcome night.");
        assertThat(payload.get("data").get("threadId").asText()).isEqualTo(threadId.toString());

        settings(owner, true, false, true);
        publisher.publishEvent(new ThreadMessageSent(threadId, UUID.randomUUID(), other.getId(),
                owner.getId()));
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(owner.getId())).hasSize(1);
    }

    @Test
    @DisplayName("all three moderation outcomes reach the sender, gated by board notifications")
    void moderationPushes() throws Exception {
        AppUser poster = approved("Mert");
        register(poster, TOKEN, "ios", "en").andExpect(status().isNoContent());
        UUID eventId = event("Welcome night");
        UUID postId = UUID.randomUUID();

        publisher.publishEvent(new PostModerated(postId, eventId, poster.getId(),
                PostModerated.Outcome.APPROVED));
        publisher.publishEvent(new PostModerated(postId, eventId, poster.getId(),
                PostModerated.Outcome.REJECTED));
        publisher.publishEvent(new PostModerated(postId, eventId, poster.getId(),
                PostModerated.Outcome.BOARD_CLOSED));

        List<PushOutbox> rows = outbox.findByUserIdOrderByCreatedAtAsc(poster.getId());
        assertThat(rows).extracting(PushOutbox::getKind)
                .containsExactly("post_approved", "post_rejected", "post_board_closed");
        assertThat(bodyOf(rows.get(0))).isEqualTo("Your post is on the board at Welcome night.");
        assertThat(bodyOf(rows.get(1))).isEqualTo("Your post at Welcome night was not published.");
        assertThat(bodyOf(rows.get(2)))
                .isEqualTo("The board at Welcome night closed before your post was reviewed.");
        assertThat(objectMapper.readTree(rows.get(0).getPayload()).get("data").get("postId").asText())
                .isEqualTo(postId.toString());

        // The closest switch a person has to "the board on my lock screen".
        settings(poster, true, true, false);
        publisher.publishEvent(new PostModerated(postId, eventId, poster.getId(),
                PostModerated.Outcome.APPROVED));
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(poster.getId())).hasSize(3);
    }

    @Test
    @DisplayName("approval and a warning have no preference to turn them off")
    void adminPushesAreNotOptional() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        settings(owner, false, false, false);
        UUID reportId = UUID.randomUUID();

        publisher.publishEvent(new AccountApproved(owner.getId()));
        publisher.publishEvent(new UserWarned(owner.getId(), reportId));

        List<PushOutbox> rows = outbox.findByUserIdOrderByCreatedAtAsc(owner.getId());
        assertThat(rows).extracting(PushOutbox::getKind).containsExactly("account_approved", "warned");
        assertThat(bodyOf(rows.get(0)))
                .isEqualTo("Your account has been approved. Open the app to get started.");
        assertThat(objectMapper.readTree(rows.get(1).getPayload()).get("data").get("reportId").asText())
                .isEqualTo(reportId.toString());
    }

    @Test
    @DisplayName("an event the row cannot name still notifies, without the 'at ...' half")
    void missingEventFallsBackToTheShorterBody() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());

        publisher.publishEvent(new InboxMessageDelivered(UUID.randomUUID(), owner.getId(), null, false));

        assertThat(bodyOf(only(owner))).isEqualTo("Someone wrote on your wall.");
    }

    /* ------------------------------------------------------------ the drain */

    @Test
    @DisplayName("the drain sends oldest first, marks them sent and leaves nothing pending")
    void drainSendsInOrder() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        UUID first = event("First night");
        UUID second = event("Second night");

        publisher.publishEvent(new InboxMessageDelivered(UUID.randomUUID(), owner.getId(), first, false));
        clock.freezeAt(base.plusSeconds(10));
        publisher.publishEvent(new InboxMessageDelivered(UUID.randomUUID(), owner.getId(), second, false));

        assertThat(housekeeping.drain()).isEqualTo(2);
        assertThat(sender.sent()).extracting(PushSender.PushMessage::body)
                .containsExactly("Someone wrote on your wall at First night.",
                        "Someone wrote on your wall at Second night.");
        assertThat(sender.sent().get(0).tokens()).containsExactly(TOKEN);
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(owner.getId()))
                .allSatisfy(row -> {
                    assertThat(row.getSentAt()).isNotNull();
                    assertThat(row.getAttempts()).isEqualTo(1);
                    assertThat(row.getLastError()).isNull();
                });
        assertThat(housekeeping.drain()).isZero();
    }

    @Test
    @DisplayName("a failure is recorded and retried, and the row is given up on after five attempts")
    void failuresAreRetriedThenGivenUp() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        publisher.publishEvent(new InboxMessageDelivered(
                UUID.randomUUID(), owner.getId(), event("Welcome night"), false));
        sender.failEverythingWith("expo is down");

        for (int pass = 1; pass <= PushOutbox.MAX_ATTEMPTS; pass++) {
            assertThat(housekeeping.drain()).isEqualTo(1);
            PushOutbox row = only(owner);
            assertThat(row.getAttempts()).isEqualTo(pass);
            assertThat(row.getLastError()).isEqualTo("expo is down");
            assertThat(row.getSentAt()).isNull();
        }

        // Five is the end of it: the row stays for the record and is never taken again.
        assertThat(housekeeping.drain()).isZero();
        assertThat(only(owner).isGivenUp()).isTrue();
    }

    @Test
    @DisplayName("a token the provider says is unregistered deletes that device row")
    void unregisteredTokensDeleteTheDevice() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        publisher.publishEvent(new InboxMessageDelivered(
                UUID.randomUUID(), owner.getId(), event("Welcome night"), false));
        sender.reportUnregistered();

        housekeeping.drain();

        assertThat(devices.findByPushToken(TOKEN)).isEmpty();
        // And the next enqueue for this account has nowhere to go, so it writes nothing.
        publisher.publishEvent(new AccountApproved(owner.getId()));
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(owner.getId())).hasSize(1);
    }

    @Test
    @DisplayName("sent rows are purged after a week; unsent rows never are")
    void purgeKeepsWhatHasNotBeenSent() throws Exception {
        AppUser owner = approved("Deniz");
        register(owner, TOKEN, "ios", "en").andExpect(status().isNoContent());
        publisher.publishEvent(new InboxMessageDelivered(
                UUID.randomUUID(), owner.getId(), event("Welcome night"), false));
        housekeeping.drain();

        publisher.publishEvent(new AccountApproved(owner.getId()));
        sender.failEverythingWith("still down");
        housekeeping.drain();

        clock.freezeAt(base.plus(PushHousekeeping.KEEP_SENT).plusSeconds(1));
        assertThat(housekeeping.purge()).isEqualTo(1);
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(owner.getId()))
                .singleElement()
                .satisfies(row -> assertThat(row.getKind()).isEqualTo("account_approved"));
    }

    /* --------------------------------------------------------------- helpers */

    private ResultActions register(AppUser user, String token, String platform, String locale)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("token", token);
        body.put("platform", platform);
        body.put("locale", locale);
        return mockMvc.perform(put("/me/devices")
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private PushOutbox only(AppUser user) {
        List<PushOutbox> rows = outbox.findByUserIdOrderByCreatedAtAsc(user.getId());
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    private String bodyOf(PushOutbox row) throws Exception {
        return objectMapper.readTree(row.getPayload()).get("body").asText();
    }

    private void settings(AppUser user, boolean inbox, boolean threads, boolean board) {
        jdbc.update("delete from user_settings where user_id = ?", user.getId());
        jdbc.update("""
                insert into user_settings (user_id, writing_policy, muted_words,
                                           muted_words_normalized, notify_inbox, notify_threads,
                                           notify_board_mentions)
                values (?, 'anyone', '{}', '{}', ?, ?, ?)
                """, user.getId(), inbox, threads, board);
    }

    private AppUser approved(String name) {
        Section section = sections.findAll().stream()
                .min(java.util.Comparator.comparing(Section::getName))
                .orElseThrow();
        AppUser user = AppUser.register(
                "push-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null,
                Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        return users.saveAndFlush(user);
    }

    private UUID event(String name) {
        Section section = sections.findAll().stream()
                .min(java.util.Comparator.comparing(Section::getName))
                .orElseThrow();
        return jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code)
                        values (?, 'section', ?, ?, ?, 'coral', 'approve_first', ?)
                        returning id
                        """,
                UUID.class, name, section.getId(), Timestamp.from(base.minusSeconds(3600)),
                Timestamp.from(base.plusSeconds(3600)), joinCode());
    }

    /** A thread needs a real origin; the push layer only ever reads its event. */
    private UUID thread(UUID eventId, AppUser author) {
        UUID postId = jdbc.queryForObject("""
                        insert into board_post (event_id, sender_id, text, anonymity_level, state,
                                                approval_kind)
                        values (?, ?, 'Origin', 'anonymous', 'approved', 'immediate')
                        returning id
                        """, UUID.class, eventId, author.getId());
        return jdbc.queryForObject("""
                        insert into thread (origin_kind, origin_post_id, event_id, last_message_at)
                        values ('post', ?, ?, now())
                        returning id
                        """, UUID.class, postId, eventId);
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int index = 0; index < 6; index++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }
}
