package app.brand.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.media.AvatarStore;
import app.brand.realtime.BoardChanged;
import app.brand.realtime.ThreadsChanged;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The account itself: {@code GET /me/export}, {@code DELETE /me} and
 * {@code GET /me/entitlements}.
 *
 * <p>The export is judged on what is <b>not</b> in it as much as on its shape:
 * the JSON is grepped for the other person's id and email, for {@code senderId}
 * and for the hint <em>booleans</em>, none of which an owner's data export is
 * allowed to carry.
 *
 * <p>Deletion is judged against the whole schema. Every foreign key in
 * {@code V1__schema.sql} is {@code ON DELETE RESTRICT} unless it is deliberately
 * {@code SET NULL}, so a table this forgot would fail the statement rather than
 * leave a ghost; on top of that the test asserts what <b>survives</b> — other
 * people's posts and messages, a board that keeps its content and loses its
 * creator [D4], and the pending posts on it turning into {@code board_closed}
 * rather than waiting forever.
 */
@RecordApplicationEvents
class AccountIntegrationTest extends AbstractIntegrationTest {

    private static final String FIRE = "🔥";

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    @Autowired
    private AvatarStore avatars;

    @Autowired
    private ApplicationEvents applicationEvents;

    private final List<UUID> created = new ArrayList<>();

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.parse("2026-05-02T18:00:00Z");
        clock.freezeAt(base);
    }

    /** {@code SchemaMigrationTest} counts these tables; only this class's rows go. */
    @AfterEach
    void clearUp() {
        clock.reset();
        for (UUID id : created) {
            jdbc.update("delete from report where reporter_id = ?", id);
            jdbc.update("delete from thread_message where sender_id = ?", id);
            jdbc.update("delete from thread_participant where user_id = ?", id);
            jdbc.update("delete from request_key where user_id = ?", id);
            jdbc.update("delete from post_reaction where user_id = ?", id);
            jdbc.update("delete from block where blocker_id = ? or blocked_id = ?", id, id);
            jdbc.update("delete from push_outbox where user_id = ?", id);
            jdbc.update("delete from device where user_id = ?", id);
            jdbc.update("delete from entitlement_usage where user_id = ?", id);
            jdbc.update("delete from section_change where user_id = ?", id);
            jdbc.update("delete from refresh_token where user_id = ?", id);
            jdbc.update("delete from password_reset_token where user_id = ?", id);
            jdbc.update("delete from user_settings where user_id = ?", id);
        }
        // Threads, posts and messages are only ever made by this class's people.
        jdbc.update("delete from report where target_kind = 'thread' and target_id in "
                + "(select id from thread)");
        jdbc.update("delete from thread_message");
        jdbc.update("delete from thread_participant");
        jdbc.update("delete from thread");
        jdbc.update("delete from post_reaction");
        jdbc.update("delete from report");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        created.clear();
    }

    /* ----------------------------------------------------- GET /me/entitlements */

    @Test
    @DisplayName("the entitlement flags are all off, which is what stages 1–2 ship [brief §3]")
    void entitlementsAreOff() throws Exception {
        AppUser me = account("Deniz");

        mockMvc.perform(get("/me/entitlements").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lockedCards").value(false))
                .andExpect(jsonPath("$.freeInboxReads").value(0))
                .andExpect(jsonPath("$.coldOpenLimit").value(0))
                .andExpect(jsonPath("$.revealPaid").value(false));
    }

    @Test
    @DisplayName("a pending account cannot read the entitlements or the export")
    void memberRoutesNeedApproval() throws Exception {
        AppUser pending = account("Ece");
        pending.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(pending);

        mockMvc.perform(get("/me/entitlements").header(HttpHeaders.AUTHORIZATION, bearer(pending)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
        mockMvc.perform(get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(pending)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    /* ----------------------------------------------------------- GET /me/export */

    @Test
    @DisplayName("the export carries every section the mock's exportAccount does")
    void exportShape() throws Exception {
        Fixture f = fixture();
        jdbc.update("""
                insert into section_change (user_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?)
                """, f.me.getId(), f.sectionB.getId(), f.sectionA.getId(), Timestamp.from(base));

        JsonNode export = json(mockMvc.perform(
                get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(f.me)))
                .andExpect(status().isOk()));

        assertThat(export.get("profile").get("id").asText()).isEqualTo(f.me.getId().toString());
        assertThat(export.get("profile").get("email").asText()).isEqualTo(f.me.getEmail());
        assertThat(export.get("settings").get("writingPolicy").asText()).isEqualTo("anyone");
        assertThat(export.get("blocks").isArray()).isTrue();

        // The inbox, exactly as GET /me/inbox renders it: the hint is a value, and
        // the hint booleans behind it never leave the server.
        assertThat(texts(export.get("inbox"))).contains("A note for you");
        JsonNode card = element(export.get("inbox"), "A note for you");
        assertThat(card.get("sender").get("level").asText()).isEqualTo("hint");
        assertThat(card.get("sender").get("hints").get("section").asText())
                .isEqualTo(f.sectionA.getName());

        // The owner's own writing, which no screen shows back to them.
        assertThat(texts(export.get("sentMessages"))).contains("Nice to meet you");
        assertThat(texts(export.get("posts"))).contains("Anyone for karaoke");
        assertThat(element(export.get("posts"), "Anyone for karaoke")
                .get("sender").get("level").asText()).isEqualTo("anonymous");

        // One conversation: the card it started from, then every bubble.
        assertThat(export.get("threads")).hasSize(1);
        JsonNode thread = export.get("threads").get(0);
        assertThat(thread.get("origin").get("text").asText()).isEqualTo("A note for you");
        assertThat(thread.get("origin").has("id")).isFalse();
        assertThat(texts(thread.get("messages"))).containsExactly("Who is this", "Guess");

        // [D7] Section moves, by name — an id is not something a person can read.
        assertThat(export.get("sectionChanges")).hasSize(1);
        assertThat(export.get("sectionChanges").get(0).get("from").asText())
                .isEqualTo(f.sectionB.getName());
        assertThat(export.get("sectionChanges").get(0).get("to").asText())
                .isEqualTo(f.sectionA.getName());
    }

    @Test
    @DisplayName("the export carries no one else's identity and no hidden field")
    void exportIsPrivate() throws Exception {
        Fixture f = fixture();

        String body = mockMvc.perform(get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(f.me)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain(f.other.getId().toString())
                .doesNotContain(f.other.getEmail())
                .doesNotContain(f.bystander.getId().toString())
                .doesNotContain(f.bystander.getEmail())
                .doesNotContain("senderId")
                .doesNotContain("recipientId")
                .doesNotContain("hintSection")
                .doesNotContain("hintCountry")
                .doesNotContain("hintLetter")
                .doesNotContain("passwordHash");
    }

    @Test
    @DisplayName("a second export inside the minute is 429; a minute later it is fine")
    void exportIsThrottled() throws Exception {
        AppUser me = account("Kaan");

        mockMvc.perform(get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));

        clock.freezeAt(base.plusSeconds(61));
        mockMvc.perform(get("/me/export").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk());
    }

    /* --------------------------------------------------------------- DELETE /me */

    @Test
    @DisplayName("deletion takes the whole account and leaves everyone else's content standing")
    void deletionIsReal() throws Exception {
        Fixture f = fixture();
        UUID me = f.me.getId();
        String token = bearer(f.me);

        // Rows no surface in this test would otherwise create, so every table the
        // deletion touches has something in it.
        jdbc.update("insert into device (user_id, push_token, platform, locale) values (?, ?, 'android', 'tr')",
                me, "ExponentPushToken[" + UUID.randomUUID() + "]");
        jdbc.update("insert into push_outbox (user_id, kind, locale, payload) values (?, 'inbox', 'tr', '{}'::jsonb)",
                me);
        jdbc.update("insert into entitlement_usage (user_id, period_start) values (?, current_date)", me);
        jdbc.update("insert into refresh_token (user_id, token_hash, expires_at) values (?, ?, ?)",
                me, "hash-" + UUID.randomUUID(), Timestamp.from(base.plus(30, ChronoUnit.DAYS)));
        jdbc.update("insert into password_reset_token (user_id, token_hash, expires_at) values (?, ?, ?)",
                me, "hash-" + UUID.randomUUID(), Timestamp.from(base.plusSeconds(3600)));
        jdbc.update("""
                insert into section_change (user_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?)
                """, me, f.sectionB.getId(), f.sectionA.getId(), Timestamp.from(base));

        // [B10] An avatar is a file on disk and nothing cascades to it.
        String avatarKey = avatars.store(new byte[] {1, 2, 3});
        f.me.setAvatarKey(avatarKey);
        users.saveAndFlush(f.me);
        assertThat(avatars.read(avatarKey)).isPresent();

        long threadEventsBefore = applicationEvents.stream(ThreadsChanged.class).count();
        long boardEventsBefore = applicationEvents.stream(BoardChanged.class).count();

        mockMvc.perform(delete("/me").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        /* ------------------------------------------------ nothing of theirs left */

        assertThat(count("select count(*) from app_user where id = ?", me)).isZero();
        for (String sql : List.of(
                "select count(*) from inbox_message where sender_id = ? or recipient_id = ?",
                "select count(*) from block where blocker_id = ? or blocked_id = ?")) {
            assertThat(count(sql, me, me)).as(sql).isZero();
        }
        for (String table : List.of("post_reaction", "request_key", "device", "push_outbox",
                "entitlement_usage", "section_change", "refresh_token", "password_reset_token",
                "user_settings", "event_member", "thread_participant")) {
            assertThat(count("select count(*) from " + table + " where user_id = ?", me))
                    .as(table).isZero();
        }
        assertThat(count("select count(*) from thread_message where sender_id = ?", me)).isZero();
        assertThat(count("select count(*) from board_post where sender_id = ?", me)).isZero();
        assertThat(count("select count(*) from report where reporter_id = ?", me)).isZero();
        // The whole conversation went, not the deleter's half of it.
        assertThat(count("select count(*) from thread where id = ?", f.thread)).isZero();
        assertThat(count("select count(*) from thread_message where thread_id = ?", f.thread)).isZero();
        // A report against content that no longer exists cannot outlive it.
        assertThat(count("select count(*) from report where target_id = ?", f.myApprovedPost)).isZero();

        /* ----------------------------------------------- everyone else untouched */

        assertThat(users.findById(f.other.getId())).isPresent();
        assertThat(count("select count(*) from board_post where id = ?", f.otherApprovedPost)).isOne();
        assertThat(count("select count(*) from inbox_message where id = ?", f.otherToBystander)).isOne();
        assertThat(count("select count(*) from report where id = ?", f.bystanderReport)).isOne();
        assertThat(count("select count(*) from thread where id = ?", f.otherThread)).isOne();
        // The board's copy of a message that went, went with it; the message the
        // other person still has did not.
        assertThat(count("select count(*) from board_post where inbox_message_id = ?", f.myPersonMessage))
                .isZero();

        /* ------------------------------------------------------------- the board */

        Map<String, Object> event = jdbc.queryForMap("select * from event where id = ?", f.eventId);
        assertThat(event.get("creator_id")).isNull();
        assertThat(event.get("closed_at")).isNotNull();
        assertThat(event.get("closed_by")).isNull();

        Map<String, Object> stranded = jdbc.queryForMap(
                "select * from board_post where id = ?", f.otherPendingPost);
        assertThat(stranded.get("state")).isEqualTo("rejected");
        assertThat(stranded.get("rejection_reason")).isEqualTo("board_closed");
        assertThat(stranded.get("rejection_undo_token")).isNull();

        /* -------------------------------------------------- files, tokens, frames */

        assertThat(avatars.read(avatarKey)).isEmpty();

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isUnauthorized());

        assertThat(applicationEvents.stream(ThreadsChanged.class).skip(threadEventsBefore))
                .anySatisfy(changed -> assertThat(changed.userIds())
                        .containsExactly(f.other.getId()));
        assertThat(applicationEvents.stream(BoardChanged.class).skip(boardEventsBefore))
                .anySatisfy(changed -> {
                    assertThat(changed.eventId()).isEqualTo(f.eventId);
                    assertThat(changed.privateUserIds()).isEmpty();
                });
    }

    @Test
    @DisplayName("a pending account may delete itself too — they still own their data")
    void pendingMayDelete() throws Exception {
        AppUser pending = account("Zeynep");
        pending.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(pending);

        mockMvc.perform(delete("/me").header(HttpHeaders.AUTHORIZATION, bearer(pending)))
                .andExpect(status().isNoContent());
        assertThat(users.findById(pending.getId())).isEmpty();
    }

    /* -------------------------------------------------------------- the fixture */

    private record Fixture(AppUser me, AppUser other, AppUser bystander,
                           Section sectionA, Section sectionB, UUID eventId,
                           UUID myApprovedPost, UUID otherApprovedPost, UUID otherPendingPost,
                           UUID myPersonMessage, UUID otherToBystander,
                           UUID thread, UUID otherThread, UUID bystanderReport) {
    }

    /**
     * Three people on one live board the deleter created: posts in every state,
     * messages both ways, reactions, reports, two threads and two blocks.
     */
    private Fixture fixture() throws Exception {
        List<Section> all = sections.findAll().stream()
                .sorted(Comparator.comparing(Section::getName)).toList();
        Section sectionA = all.get(0);
        Section sectionB = all.get(1);

        AppUser me = account(sectionA, "Deniz");
        AppUser other = account(sectionA, "Ece");
        AppUser bystander = account(sectionA, "Kaan");

        UUID eventId = event(sectionA, me.getId());
        join(eventId, me.getId(), true);
        join(eventId, other.getId(), false);
        join(eventId, bystander.getId(), false);

        // Room posts. The creator is a moderator, so theirs publishes at once [D9];
        // everyone else's waits in the queue.
        roomPost(me, eventId, "Anyone for karaoke", "anonymous");
        roomPost(other, eventId, "Board rules please", "named");
        roomPost(other, eventId, "Still waiting", "named");
        UUID myApprovedPost = postId(me, "Anyone for karaoke");
        UUID otherApprovedPost = postId(other, "Board rules please");
        UUID otherPendingPost = postId(other, "Still waiting");
        approve(me, eventId, otherApprovedPost);

        // A post to a person: an inbox message plus the board's linked copy.
        personPost(me, eventId, other, "Find me later");
        UUID myPersonMessage = messageId(me, other, "Find me later");

        // Wall messages: one to the deleter, one that has nothing to do with them.
        wallMessage(other, eventId, me, "A note for you", true);
        wallMessage(other, eventId, bystander, "Coffee tomorrow", false);
        wallMessage(me, eventId, other, "Nice to meet you", false);
        wallMessage(bystander, eventId, me, "Welcome", false);
        UUID noteForMe = messageId(other, me, "A note for you");
        UUID otherToBystander = messageId(other, bystander, "Coffee tomorrow");
        UUID welcome = messageId(bystander, me, "Welcome");

        // Reactions, both directions.
        react(me, eventId, otherApprovedPost);
        react(other, eventId, myApprovedPost);

        // Reports: one filed by the deleter, one against their content, one that
        // has nothing to do with them.
        reportMessage(me, noteForMe);
        reportPost(other, eventId, myApprovedPost);
        reportPost(bystander, eventId, otherApprovedPost);
        UUID bystanderReport = jdbc.queryForObject(
                "select id from report where reporter_id = ?", UUID.class, bystander.getId());

        // Two threads: one the deleter is in, one they are not.
        UUID thread = openThread(me, noteForMe, "Who is this");
        threadReply(other, thread, "Guess");
        UUID otherThread = openThread(bystander, otherToBystander, "Sure");

        // [D6] Blocks in both directions, by message id — done last, because a
        // block refuses the writes the rest of this fixture depends on.
        blockByMessage(me, welcome);
        blockByMessage(other, myPersonMessage);

        return new Fixture(me, other, bystander, sectionA, sectionB, eventId,
                myApprovedPost, otherApprovedPost, otherPendingPost, myPersonMessage,
                otherToBystander, thread, otherThread, bystanderReport);
    }

    /* -------------------------------------------------------------- API helpers */

    private void roomPost(AppUser sender, UUID eventId, String text, String level) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", eventId.toString());
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", new HashMap<String, Object>());
        mockMvc.perform(post("/events/" + eventId + "/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private void personPost(AppUser sender, UUID eventId, AppUser recipient, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", eventId.toString());
        body.put("recipientId", recipient.getId().toString());
        body.put("text", text);
        body.put("anonymityLevel", "named");
        body.put("allowedHints", new HashMap<String, Object>());
        mockMvc.perform(post("/events/" + eventId + "/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private void wallMessage(AppUser sender, UUID eventId, AppUser recipient, String text,
                             boolean hinted) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", eventId.toString());
        body.put("recipientId", recipient.getId().toString());
        body.put("text", text);
        body.put("anonymityLevel", hinted ? "hint" : "named");
        Map<String, Object> hints = new HashMap<>();
        hints.put("section", hinted);
        hints.put("country", false);
        hints.put("letter", false);
        body.put("allowedHints", hints);
        mockMvc.perform(post("/messages/wall")
                        .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private void approve(AppUser moderator, UUID eventId, UUID postId) throws Exception {
        mockMvc.perform(post("/events/" + eventId + "/moderation/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(moderator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("ids", List.of(postId.toString())))))
                .andExpect(status().isNoContent());
    }

    private void react(AppUser viewer, UUID eventId, UUID postId) throws Exception {
        mockMvc.perform(put("/events/" + eventId + "/posts/" + postId + "/reaction")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("emoji", FIRE))))
                .andExpect(status().isNoContent());
    }

    private void reportMessage(AppUser viewer, UUID messageId) throws Exception {
        mockMvc.perform(post("/messages/" + messageId + "/report")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "spam"))))
                .andExpect(status().isNoContent());
    }

    private void reportPost(AppUser viewer, UUID eventId, UUID postId) throws Exception {
        mockMvc.perform(post("/events/" + eventId + "/posts/" + postId + "/report")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "spam"))))
                .andExpect(status().isNoContent());
    }

    private UUID openThread(AppUser viewer, UUID messageId, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("origin", Map.of("kind", "inbox", "id", messageId.toString()));
        body.put("text", text);
        body.put("anonymityLevel", "anonymous");
        body.put("allowedHints", new HashMap<String, Object>());
        body.put("requestId", UUID.randomUUID().toString());
        JsonNode opened = json(mockMvc.perform(post("/threads")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk()));
        return UUID.fromString(opened.get("id").asText());
    }

    private void threadReply(AppUser viewer, UUID threadId, String text) throws Exception {
        mockMvc.perform(post("/threads/" + threadId + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("text", text, "requestId", UUID.randomUUID().toString()))))
                .andExpect(status().isNoContent());
    }

    private void blockByMessage(AppUser viewer, UUID messageId) throws Exception {
        mockMvc.perform(post("/messages/" + messageId + "/block")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNoContent());
    }

    /* --------------------------------------------------------------- SQL helpers */

    private UUID event(Section section, UUID creatorId) {
        UUID id = jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values ('Welcome night', 'section', ?, ?, ?, 'coral', 'approve_first', ?, ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(base.minusSeconds(3600)),
                Timestamp.from(base.plusSeconds(3600)), joinCode(), creatorId);
        return id;
    }

    private void join(UUID eventId, UUID userId, boolean moderator) {
        jdbc.update("insert into event_member (event_id, user_id, is_moderator) values (?, ?, ?)",
                eventId, userId, moderator);
    }

    private UUID postId(AppUser sender, String text) {
        return jdbc.queryForObject("select id from board_post where sender_id = ? and text = ?",
                UUID.class, sender.getId(), text);
    }

    private UUID messageId(AppUser sender, AppUser recipient, String text) {
        return jdbc.queryForObject(
                "select id from inbox_message where sender_id = ? and recipient_id = ? and text = ?",
                UUID.class, sender.getId(), recipient.getId(), text);
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private AppUser account(String name) {
        return account(sections.findAll().stream()
                .min(Comparator.comparing(Section::getName)).orElseThrow(), name);
    }

    private AppUser account(Section section, String name) {
        AppUser user = AppUser.register(
                "account-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash",
                null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        AppUser saved = users.saveAndFlush(user);
        created.add(saved.getId());
        return saved;
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private static List<String> texts(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(node -> out.add(node.get("text").asText()));
        return out;
    }

    private static JsonNode element(JsonNode array, String text) {
        for (JsonNode node : array) {
            if (text.equals(node.get("text").asText())) {
                return node;
            }
        }
        throw new AssertionError("no element with text " + text);
    }
}
