package app.brand.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.TestMemberships;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
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
import org.springframework.test.web.servlet.ResultActions;

/**
 * [D15] Nothing reads the account's section: the hint snapshot
 * ({@code sender_section_id}) and a person's section in an event are the
 * membership section in the organisation of the event — acceptance tests 21, 22
 * and 23 in {@code TENANT_PLAN.md} §9, plus the thread snapshot.
 *
 * <p>Every case puts the same person in two organisations with different
 * sections, so reading the wrong membership (or the unmapped
 * {@code app_user.section_id}, set here to a third section on purpose) shows.
 */
class HintSnapshotIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private TestMemberships memberships;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID orgA;
    private UUID orgB;
    private UUID sectionA;
    private UUID sectionB;
    private UUID eventA;
    private UUID eventB;

    @BeforeEach
    void twoOrganisations() {
        orgA = memberships.organisation(false, true, "members");
        orgB = memberships.organisation(false, true, "members");
        sectionA = memberships.sectionOf(orgA);
        sectionB = memberships.sectionOf(orgB);
    }

    @AfterEach
    void clearUp() {
        jdbc.update("delete from request_key");
        jdbc.update("delete from thread_message");
        jdbc.update("delete from thread_participant");
        jdbc.update("delete from thread");
        jdbc.update("delete from post_reaction");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        memberships.removeOrganisations();
    }

    /* ------------------------------------------------------------------ 21 */

    @Test
    @DisplayName("[21] a message and a post snapshot the sender's section in the event's organisation, not another membership's")
    void messageAndPostSnapshotTheEventsOrganisation() throws Exception {
        AppUser sender = inBoth("Sender");
        AppUser recipient = inBoth("Recipient");
        eventA = event(orgA, sectionA, sender);
        eventB = event(orgB, sectionB, sender);
        for (UUID event : new UUID[] {eventA, eventB}) {
            join(event, sender);
            join(event, recipient);
        }

        wall(sender, eventA, recipient, hints(true, true, false)).andExpect(status().isOk());
        wall(sender, eventB, recipient, hints(true, true, false)).andExpect(status().isOk());
        roomPost(sender, eventA, "Room A", hints(true, false, false)).andExpect(status().isOk());
        roomPost(sender, eventB, "Room B", hints(true, false, false)).andExpect(status().isOk());

        assertThat(messageSnapshot(eventA, sender)).isEqualTo(sectionA);
        assertThat(messageSnapshot(eventB, sender)).isEqualTo(sectionB);
        assertThat(postSnapshot(eventA, "Room A")).isEqualTo(sectionA);
        assertThat(postSnapshot(eventB, "Room B")).isEqualTo(sectionB);

        // And the recipient's inbox shows each chip from its own snapshot.
        JsonNode inbox = json(mockMvc.perform(get("/me/inbox").header(HttpHeaders.AUTHORIZATION, bearer(recipient)))
                .andExpect(status().isOk()));
        java.util.Set<String> chips = new java.util.HashSet<>();
        inbox.get("messages").forEach(card -> chips.add(card.get("sender").get("hints").get("section").asText()));
        assertThat(chips).containsExactlyInAnyOrder(sectionName(sectionA), sectionName(sectionB));
    }

    /* ------------------------------------------------------------------ 22 */

    @Test
    @DisplayName("[22] without sections, a section or country hint is 422 on allowedHints; first letter is accepted")
    void noSectionsRefusesSectionAndCountryHints() throws Exception {
        UUID bar = memberships.organisation(false, false, "members");
        AppUser sender = account("Selin");
        AppUser recipient = account("Mert");
        memberships.add(bar, sender.getId(), "approved", "member", null, null);
        memberships.add(bar, recipient.getId(), "approved", "member", null, null);
        // A section in another organisation must not leak into this one.
        memberships.add(orgA, sender.getId(), "approved", "member", sectionA, null);
        UUID event = event(bar, null, sender);
        join(event, sender);
        join(event, recipient);

        for (AllowedHints refused : new AllowedHints[] {
                hints(true, false, false), hints(false, true, false), hints(true, true, true)}) {
            roomPost(sender, event, "No chips here", refused)
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("validation"))
                    .andExpect(jsonPath("$.field").value("allowedHints"));
            wall(sender, event, recipient, refused)
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.field").value("allowedHints"));
        }
        assertThat(count("select count(*) from board_post where event_id = ?", event)).isZero();
        assertThat(count("select count(*) from inbox_message where event_id = ?", event)).isZero();

        roomPost(sender, event, "Letter only", hints(false, false, true)).andExpect(status().isOk());
        wall(sender, event, recipient, hints(false, false, true)).andExpect(status().isOk());
        assertThat(postSnapshot(event, "Letter only")).isNull();
        assertThat(messageSnapshot(event, sender)).isNull();

        JsonNode card = json(mockMvc.perform(get("/me/inbox").header(HttpHeaders.AUTHORIZATION, bearer(recipient)))
                .andExpect(status().isOk())).get("messages").get(0).get("sender");
        assertThat(card.get("level").asText()).isEqualTo("hint");
        assertThat(card.get("hints").get("letter").asText()).isEqualTo("S");
        assertThat(card.get("hints").has("section")).isFalse();
        assertThat(card.get("hints").has("country")).isFalse();
    }

    @Test
    @DisplayName("[22] a sender with no approved membership in the event's organisation gets no snapshot and no section hint")
    void noApprovedMembershipRefusesSectionHints() throws Exception {
        AppUser sender = account("Legacy");
        AppUser recipient = inBoth("Recipient");
        // Pending in A (an impossible state for an event member, made by hand), approved in B.
        memberships.add(orgA, sender.getId(), "pending", "member", sectionA, null);
        memberships.add(orgB, sender.getId(), "approved", "member", sectionB, null);
        eventA = event(orgA, sectionA, recipient);
        join(eventA, sender);
        join(eventA, recipient);

        wall(sender, eventA, recipient, hints(false, true, false))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("allowedHints"));
        wall(sender, eventA, recipient, hints(false, false, true)).andExpect(status().isOk());
        assertThat(messageSnapshot(eventA, sender)).isNull();
    }

    /* ------------------------------------------------------------------ 23 */

    @Test
    @DisplayName("[23] a person with sections in two organisations shows the right one in each event's people list")
    void peopleListShowsTheEventsOrganisationSection() throws Exception {
        AppUser person = inBoth("Ada");
        AppUser viewer = inBoth("Viewer");
        UUID bar = memberships.organisation(false, false, "members");
        memberships.add(bar, person.getId(), "approved", "member", null, null);
        memberships.add(bar, viewer.getId(), "approved", "member", null, null);
        eventA = event(orgA, sectionA, viewer);
        eventB = event(orgB, sectionB, viewer);
        UUID eventBar = event(bar, null, viewer);
        for (UUID event : new UUID[] {eventA, eventB, eventBar}) {
            join(event, person);
            join(event, viewer);
        }

        assertThat(personIn(eventA, viewer, person).get("section").get("id").asText()).isEqualTo(sectionA.toString());
        assertThat(personIn(eventB, viewer, person).get("section").get("id").asText()).isEqualTo(sectionB.toString());
        assertThat(personIn(eventBar, viewer, person).has("section")).isFalse();

        // The wall header inside an event reads the same rule.
        JsonNode wall = json(mockMvc.perform(get("/events/" + eventB + "/people/" + person.getId() + "/wall")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
        assertThat(wall.get("person").get("section").get("id").asText()).isEqualTo(sectionB.toString());
    }

    /* -------------------------------------------------------------- threads */

    @Test
    @DisplayName("a thread opened from a post in organisation A snapshots the section from the membership in A, not B")
    void threadSnapshotsTheOriginsOrganisation() throws Exception {
        AppUser author = inBoth("Author");
        AppUser viewer = inBoth("Viewer");
        eventA = event(orgA, sectionA, author);
        // The viewer's other membership is the one an event in B would read.
        eventB = event(orgB, sectionB, author);
        join(eventA, author);
        join(eventA, viewer);

        roomPost(author, eventA, "Origin", hints(false, false, false), "anonymous").andExpect(status().isOk());
        UUID postId = jdbc.queryForObject("select id from board_post where event_id = ? and text = 'Origin'",
                UUID.class, eventA);

        Map<String, Object> body = new HashMap<>();
        body.put("origin", Map.of("kind", "post", "id", postId.toString(), "eventId", eventA.toString()));
        body.put("text", "Which section are you?");
        body.put("anonymityLevel", "hint");
        body.put("allowedHints", hints(true, true, false));
        body.put("requestId", UUID.randomUUID().toString());
        String threadId = json(mockMvc.perform(post("/threads")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())).get("id").asText();

        assertThat(jdbc.queryForObject(
                "select sender_section_id from thread_participant where thread_id = ? and user_id = ?",
                UUID.class, UUID.fromString(threadId), viewer.getId())).isEqualTo(sectionA);
        assertThat(jdbc.queryForObject(
                "select sender_section_id from thread_message where thread_id = ? and sender_id = ?",
                UUID.class, UUID.fromString(threadId), viewer.getId())).isEqualTo(sectionA);

        // The author reads the chip of A.
        JsonNode other = json(mockMvc.perform(get("/threads/" + threadId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isOk())).get("other");
        assertThat(other.get("hints").get("section").asText()).isEqualTo(sectionName(sectionA));

        // [D5] Revealing snapshots A again, and the bubble already sent is not rewritten.
        mockMvc.perform(post("/threads/" + threadId + "/reveal")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().is2xxSuccessful());
        assertThat(jdbc.queryForObject(
                "select sender_section_id from thread_participant where thread_id = ? and user_id = ?",
                UUID.class, UUID.fromString(threadId), viewer.getId())).isEqualTo(sectionA);
        assertThat(jdbc.queryForObject(
                "select anonymity_level from thread_message where thread_id = ? and sender_id = ? and seq = 1",
                String.class, UUID.fromString(threadId), viewer.getId())).isEqualTo("hint");
    }

    /* -------------------------------------------------------------- helpers */

    /** Approved in A (section A) and in B (section B); the unmapped account column points at neither. */
    private AppUser inBoth(String name) {
        AppUser user = account(name);
        memberships.add(orgA, user.getId(), "approved", "member", sectionA, null);
        memberships.add(orgB, user.getId(), "approved", "member", sectionB, null);
        return user;
    }

    private AppUser account(String name) {
        AppUser user = AppUser.register(
                "hint-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.ACTIVE);
        // [D18] Confirmed, so the access filter judges the status alone.
        user.confirmEmail(Instant.now());
        user.setName(name);
        AppUser saved = users.saveAndFlush(user);
        // [D15] The unmapped account column says a third section; nothing may read it.
        jdbc.update("update app_user set section_id = ? where id = ?", memberships.sectionOf(memberships.esnTurkiye()),
                saved.getId());
        return saved;
    }

    private UUID event(UUID organisationId, UUID sectionId, AppUser creator) {
        Instant now = Instant.now();
        return jdbc.queryForObject("""
                        insert into event (organisation_id, name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values (?, 'Hint night', ?, ?, ?, ?, 'coral', 'post_immediately', ?, ?)
                        returning id
                        """, UUID.class, organisationId, sectionId == null ? null : "section", sectionId,
                Timestamp.from(now.minusSeconds(3600)), Timestamp.from(now.plusSeconds(3600)), joinCode(),
                creator.getId());
    }

    private void join(UUID eventId, AppUser user) {
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, user.getId());
    }

    private ResultActions wall(AppUser sender, UUID eventId, AppUser recipient, AllowedHints hints) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", eventId.toString());
        body.put("recipientId", recipient.getId().toString());
        body.put("text", "Hello from " + eventId);
        body.put("anonymityLevel", "hint");
        body.put("allowedHints", hints);
        return mockMvc.perform(post("/messages/wall")
                .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions roomPost(AppUser sender, UUID eventId, String text, AllowedHints hints) throws Exception {
        return roomPost(sender, eventId, text, hints, "hint");
    }

    private ResultActions roomPost(AppUser sender, UUID eventId, String text, AllowedHints hints, String level)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", hints);
        return mockMvc.perform(post("/events/" + eventId + "/posts")
                .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode personIn(UUID eventId, AppUser viewer, AppUser person) throws Exception {
        JsonNode detail = json(mockMvc.perform(get("/events/" + eventId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
        for (JsonNode row : detail.get("people")) {
            if (row.get("id").asText().equals(person.getId().toString())) {
                return row;
            }
        }
        throw new AssertionError("not in the people list");
    }

    private UUID messageSnapshot(UUID eventId, AppUser sender) {
        return jdbc.queryForObject("select sender_section_id from inbox_message where event_id = ? and sender_id = ?",
                UUID.class, eventId, sender.getId());
    }

    private UUID postSnapshot(UUID eventId, String text) {
        return jdbc.queryForObject("select sender_section_id from board_post where event_id = ? and text = ?",
                UUID.class, eventId, text);
    }

    private String sectionName(UUID sectionId) {
        return jdbc.queryForObject("select name from section where id = ?", String.class, sectionId);
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static AllowedHints hints(boolean section, boolean country, boolean letter) {
        return new AllowedHints(section, country, letter);
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
