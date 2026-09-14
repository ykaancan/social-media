package app.brand.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.board.BoardHousekeeping;
import app.brand.common.events.PostModerated;
import app.brand.common.events.ThreadMessageSent;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The two events the board and the thread services publish for the push layer
 * [B8], asserted where they are raised rather than where they are consumed.
 *
 * <p>{@code PostModerated} has four paths into it and they must all be covered,
 * because three of them are the same code and the fourth is easy to forget: a
 * moderator approving, a rejection finalised lazily on the next board read, the
 * same finalisation reached by the housekeeping job [B5], and a board closed with
 * posts still queued [D4].
 *
 * <p>{@code ThreadMessageSent} is published for a message somebody wrote and
 * <b>not</b> for the system row a reveal appends [D5] — a reveal is not a reply,
 * and buzzing a phone for it would be telling somebody there is something new to
 * read when there is not.
 */
@RecordApplicationEvents
class PushDomainEventsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private BoardHousekeeping boardHousekeeping;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    @Autowired
    private ApplicationEvents applicationEvents;

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        clock.freezeAt(base);
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        jdbc.update("delete from push_outbox");
        jdbc.update("delete from device");
        jdbc.update("delete from request_key");
        jdbc.update("delete from thread_message");
        jdbc.update("delete from thread_participant");
        jdbc.update("delete from thread");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'pushevent-%')");
    }

    /* ---------------------------------------------------------- PostModerated */

    @Test
    @DisplayName("a moderator releasing a post tells its sender, once, with the outcome")
    void approvalPublishes() throws Exception {
        Fixture f = fixture("approve_first");
        sendRoom(f.member, f.eventId, "Waiting");
        String postId = queueId(f.creator, f.eventId);

        mockMvc.perform(post("/events/" + f.eventId + "/moderation/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(postId)))))
                .andExpect(status().isNoContent());

        assertThat(moderated()).singleElement().satisfies(event -> {
            assertThat(event.postId()).hasToString(postId);
            assertThat(event.eventId()).isEqualTo(f.eventId);
            assertThat(event.senderId()).isEqualTo(f.member.getId());
            assertThat(event.outcome()).isEqualTo(PostModerated.Outcome.APPROVED);
        });
    }

    @Test
    @DisplayName("[B6] a rejection is announced when its undo window has passed, not when it is tapped")
    void rejectionPublishesOnlyOnceItIsFinal() throws Exception {
        Fixture f = fixture("approve_first");
        sendRoom(f.member, f.eventId, "Waiting");
        String postId = queueId(f.creator, f.eventId);

        mockMvc.perform(post("/events/" + f.eventId + "/posts/" + postId + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator)))
                .andExpect(status().isOk());
        // Still inside the five seconds: the sender has been told nothing at all.
        assertThat(moderated()).isEmpty();

        clock.freezeAt(base.plusSeconds(10));
        board(f.creator, f.eventId);

        assertThat(moderated()).singleElement().satisfies(event -> {
            assertThat(event.senderId()).isEqualTo(f.member.getId());
            assertThat(event.outcome()).isEqualTo(PostModerated.Outcome.REJECTED);
        });
    }

    @Test
    @DisplayName("[B5] the housekeeping pass finalises the same rejection and announces it the same way")
    void housekeepingPublishesTheSameRejection() throws Exception {
        Fixture f = fixture("approve_first");
        sendRoom(f.member, f.eventId, "Waiting");
        String postId = queueId(f.creator, f.eventId);

        mockMvc.perform(post("/events/" + f.eventId + "/posts/" + postId + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator)))
                .andExpect(status().isOk());
        clock.freezeAt(base.plusSeconds(10));
        boardHousekeeping.run();

        assertThat(moderated()).singleElement().satisfies(event ->
                assertThat(event.outcome()).isEqualTo(PostModerated.Outcome.REJECTED));

        // And it is announced once: a later read finds nothing left to transition.
        board(f.creator, f.eventId);
        assertThat(moderated()).hasSize(1);
    }

    @Test
    @DisplayName("[D4] closing a board announces board_closed, never a moderator's rejection")
    void closingPublishesBoardClosed() throws Exception {
        Fixture f = fixture("approve_first");
        sendRoom(f.member, f.eventId, "Waiting");

        mockMvc.perform(post("/events/" + f.eventId + "/close")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator)))
                .andExpect(status().isNoContent());

        assertThat(moderated()).singleElement().satisfies(event -> {
            assertThat(event.senderId()).isEqualTo(f.member.getId());
            assertThat(event.outcome()).isEqualTo(PostModerated.Outcome.BOARD_CLOSED);
        });
    }

    @Test
    @DisplayName("a post that publishes immediately was never moderated, and says nothing")
    void immediatePostsAnnounceNothing() throws Exception {
        Fixture f = fixture("post_immediately");
        sendRoom(f.member, f.eventId, "Straight up");

        assertThat(moderated()).isEmpty();
    }

    /* ------------------------------------------------------- ThreadMessageSent */

    @Test
    @DisplayName("opening a thread and replying tell the other side; revealing yourself does not")
    void threadMessagesPublishButRevealDoesNot() throws Exception {
        Fixture f = fixture("post_immediately");
        sendRoom(f.member, f.eventId, "Who is coming?");
        String postId = board(f.member, f.eventId).get("posts").get(0).get("id").asText();

        String threadId = open(f.creator, postId, f.eventId);
        assertThat(sentMessages()).singleElement().satisfies(event -> {
            assertThat(event.senderId()).isEqualTo(f.creator.getId());
            assertThat(event.recipientId()).isEqualTo(f.member.getId());
            assertThat(event.threadId()).hasToString(threadId);
        });

        mockMvc.perform(post("/threads/" + threadId + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.member))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("text", "Me", "requestId", UUID.randomUUID().toString()))))
                .andExpect(status().isNoContent());
        assertThat(sentMessages()).hasSize(2);
        assertThat(sentMessages().get(1).recipientId()).isEqualTo(f.creator.getId());

        // [D5] The reveal appends a system row. Nothing was written, so nothing buzzes.
        mockMvc.perform(post("/threads/" + threadId + "/reveal")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator)))
                .andExpect(status().isNoContent());
        assertThat(sentMessages()).hasSize(2);
    }

    /* --------------------------------------------------------------- helpers */

    private List<PostModerated> moderated() {
        return applicationEvents.stream(PostModerated.class).toList();
    }

    private List<ThreadMessageSent> sentMessages() {
        return applicationEvents.stream(ThreadMessageSent.class).toList();
    }

    private String open(AppUser viewer, String postId, UUID eventId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("origin", Map.of("kind", "post", "id", postId, "eventId", eventId.toString()));
        body.put("text", "Me!");
        body.put("anonymityLevel", "anonymous");
        body.put("allowedHints", new HashMap<String, Object>());
        body.put("requestId", UUID.randomUUID().toString());
        String response = mockMvc.perform(post("/threads")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asText();
    }

    private JsonNode board(AppUser viewer, UUID eventId) throws Exception {
        String response = mockMvc.perform(get("/events/" + eventId + "/board")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private String queueId(AppUser moderator, UUID eventId) throws Exception {
        return board(moderator, eventId).get("queue").get(0).get("id").asText();
    }

    private ResultActions sendRoom(AppUser sender, UUID eventId, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("anonymityLevel", "anonymous");
        body.put("allowedHints", new HashMap<String, Object>());
        return mockMvc.perform(post("/events/" + eventId + "/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private Fixture fixture(String boardMode) {
        Section section = sections.findAll().stream()
                .min(java.util.Comparator.comparing(Section::getName))
                .orElseThrow();
        AppUser creator = approved(section, "Deniz");
        AppUser member = approved(section, "Mert");
        UUID eventId = jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values ('Welcome night', 'section', ?, ?, ?, 'coral', ?, ?, ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(base.minusSeconds(3600)),
                Timestamp.from(base.plusSeconds(3600)), boardMode, joinCode(), creator.getId());
        join(eventId, creator.getId(), true);
        join(eventId, member.getId(), false);
        return new Fixture(eventId, creator, member);
    }

    private void join(UUID eventId, UUID userId, boolean moderator) {
        jdbc.update("insert into event_member (event_id, user_id, is_moderator) values (?, ?, ?)",
                eventId, userId, moderator);
    }

    private AppUser approved(Section section, String name) {
        AppUser user = AppUser.register(
                "pushevent-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null,
                Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        return users.saveAndFlush(user);
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

    private record Fixture(UUID eventId, AppUser creator, AppUser member) {
    }
}
