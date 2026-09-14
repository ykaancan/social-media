package app.brand.section;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.TextNormalizer;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * {@code GET /sections} and {@code GET /sections/{id}} — readable at any signed-in
 * status, because the profile-setup screen needs the picker before there is any
 * approval at all.
 *
 * <p>Counts are real: a section nobody has joined reads 0, and a pending account
 * is not a member of anyone's roster but their own. The event rows the
 * {@code wallEventId} case needs are inserted with plain SQL — step B-2 owns the
 * events feature, and nothing here builds it early.
 */
class SectionIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    /** The events this class created, so the clean-up takes those and nothing else. */
    private final List<UUID> fixtureEvents = new ArrayList<>();

    /**
     * The suite shares one database, and {@code SchemaMigrationTest} checks that
     * nothing is seeded (principle 4) by counting the event tables. The fixture
     * events below would turn that check into a coin toss on class order.
     *
     * <p>Only this class's own rows, and the rows that reference them first: a
     * blanket delete would take another class's fixtures with it, and would fail
     * outright against a board that has posts on it.
     */
    @AfterEach
    void clearFixtureEvents() {
        for (UUID eventId : fixtureEvents) {
            jdbc.update("delete from board_post where event_id = ?", eventId);
            jdbc.update("delete from inbox_message where event_id = ?", eventId);
            jdbc.update("delete from event_member where event_id = ?", eventId);
            jdbc.update("delete from event where id = ?", eventId);
        }
        fixtureEvents.clear();
    }

    /* ------------------------------------------------------------ GET /sections */

    @Test
    @DisplayName("the list counts approved members only, and an empty section reads 0")
    void listCountsApprovedMembers() throws Exception {
        UUID populated = section("QA Populated");
        UUID empty = section("QA Empty");
        member("Ada", populated, AccountStatus.APPROVED);
        member("Bora", populated, AccountStatus.APPROVED);
        member("Ceyda", populated, AccountStatus.PENDING);
        member("Derya", populated, AccountStatus.REJECTED);

        AppUser viewer = member("Viewer", section("QA Viewers"), AccountStatus.PENDING);
        JsonNode list = read(mockMvc.perform(get("/sections").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(memberCount(list, populated)).isEqualTo(2);
        assertThat(memberCount(list, empty)).isZero();
        // The reference data [B13] is there too, and carries its country.
        assertThat(list.size()).isGreaterThanOrEqualTo(26);
        JsonNode first = list.get(0);
        assertThat(first.get("country").asText()).isEqualTo("Türkiye");
        assertThat(first.has("memberCount")).isTrue();
    }

    @Test
    @DisplayName("sections come back ordered by the normalised name")
    void listIsOrderedByNormalisedName() throws Exception {
        AppUser viewer = member("Viewer", section("QA Order"), AccountStatus.PENDING);

        JsonNode list = read(mockMvc.perform(get("/sections").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        List<String> normalised = new ArrayList<>();
        list.forEach(node -> normalised.add(TextNormalizer.normalizeForSearch(node.get("name").asText())));
        assertThat(normalised).isSorted();
    }

    @Test
    @DisplayName("the list is readable while the account is still incomplete")
    void listIsReadableBeforeApproval() throws Exception {
        AppUser viewer = member(null, null, AccountStatus.INCOMPLETE);

        mockMvc.perform(get("/sections").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/sections")).andExpect(status().isUnauthorized());
    }

    /* ------------------------------------------------------- GET /sections/{id} */

    @Test
    @DisplayName("an unknown section is 404")
    void unknownSectionIsNotFound() throws Exception {
        AppUser viewer = member("Viewer", section("QA Missing"), AccountStatus.PENDING);

        mockMvc.perform(get("/sections/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mockMvc.perform(get("/sections/not-a-uuid").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a pending viewer heads their own roster and is counted once in rosterTotal")
    void pendingViewerIsFirstInOwnSection() throws Exception {
        UUID sectionId = section("QA Roster");
        member("Işıl", sectionId, AccountStatus.APPROVED);
        member("Irmak", sectionId, AccountStatus.APPROVED);
        member("Nobody", sectionId, AccountStatus.PENDING);
        AppUser viewer = member("Viewer", sectionId, AccountStatus.PENDING);

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.country").value("Türkiye"))
                .andReturn());

        assertThat(body.get("memberCount").asLong()).isEqualTo(2);
        // The viewer is in the roster but not in the approved count, so they are
        // added once: "and N more" is rosterTotal - roster.length and never negative.
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(3);

        JsonNode roster = body.get("roster");
        assertThat(names(roster)).containsExactly("Viewer", "Irmak", "Işıl");
        // A person row carries no email, no status and no country of its own [D11].
        JsonNode row = roster.get(1);
        assertThat(row.has("email")).isFalse();
        assertThat(row.has("status")).isFalse();
        assertThat(row.has("country")).isFalse();
        assertThat(row.get("section").get("country").asText()).isEqualTo("Türkiye");
    }

    @Test
    @DisplayName("an approved viewer appears once, at the top, and rosterTotal is the count")
    void approvedViewerIsNotCountedTwice() throws Exception {
        UUID sectionId = section("QA Approved viewer");
        member("Zeynep", sectionId, AccountStatus.APPROVED);
        AppUser viewer = member("Ali", sectionId, AccountStatus.APPROVED);

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(names(body.get("roster"))).containsExactly("Ali", "Zeynep");
        assertThat(body.get("memberCount").asLong()).isEqualTo(2);
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(2);
    }

    @Test
    @DisplayName("someone else's section shows its approved members and not the viewer")
    void otherSectionRoster() throws Exception {
        UUID theirs = section("QA Theirs");
        member("Baran", theirs, AccountStatus.APPROVED);
        AppUser viewer = member("Viewer", section("QA Mine"), AccountStatus.APPROVED);

        JsonNode body = read(mockMvc.perform(get("/sections/" + theirs)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(names(body.get("roster"))).containsExactly("Baran");
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(1);
    }

    @Test
    @DisplayName("a big roster is one page of 50 and rosterTotal carries the rest")
    void rosterIsOnePageOfFifty() throws Exception {
        UUID sectionId = section("QA Big");
        for (int i = 0; i < 60; i++) {
            member(String.format("Member %02d", i), sectionId, AccountStatus.APPROVED);
        }
        AppUser viewer = member("Aaa Viewer", sectionId, AccountStatus.PENDING);

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(body.get("roster").size()).isEqualTo(50);
        assertThat(body.get("memberCount").asLong()).isEqualTo(60);
        // "and N more" = rosterTotal - roster.length = 11: the 10 members the page
        // left out, plus nobody counted twice.
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(61);
        assertThat(names(body.get("roster")).get(0)).isEqualTo("Aaa Viewer");
        assertThat(names(body.get("roster")).get(1)).isEqualTo("Member 00");
    }

    @Test
    @DisplayName("wallEventId appears only for a member the viewer shares an event with, live preferred")
    void wallEventIdIsOnlyForSharedEvents() throws Exception {
        UUID sectionId = section("QA Events");
        AppUser shared = member("Shared", sectionId, AccountStatus.APPROVED);
        AppUser unrelated = member("Unrelated", sectionId, AccountStatus.APPROVED);
        AppUser viewer = member("Viewer", sectionId, AccountStatus.APPROVED);

        Instant now = Instant.now();
        UUID archived = event(sectionId, now.minus(3, ChronoUnit.DAYS), now.minus(2, ChronoUnit.DAYS));
        UUID live = event(sectionId, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        UUID theirsOnly = event(sectionId, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));

        join(archived, viewer.getId());
        join(archived, shared.getId());
        join(live, viewer.getId());
        join(live, shared.getId());
        // An event the other person is in on their own is not a shared wall.
        join(theirsOnly, unrelated.getId());

        JsonNode roster = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn()).get("roster");

        assertThat(row(roster, "Shared").get("wallEventId").asText()).isEqualTo(live.toString());
        assertThat(row(roster, "Unrelated").has("wallEventId")).isFalse();
        // The viewer's own row never links to a wall through an event.
        assertThat(row(roster, "Viewer").has("wallEventId")).isFalse();
        assertThat(archived).isNotEqualTo(live);
    }

    /* -------------------------------------------------------------- helpers */

    private static List<String> names(JsonNode roster) {
        List<String> names = new ArrayList<>();
        roster.forEach(node -> names.add(node.get("name").asText()));
        return names;
    }

    private static JsonNode row(JsonNode roster, String name) {
        for (JsonNode node : roster) {
            if (node.get("name").asText().equals(name)) {
                return node;
            }
        }
        throw new AssertionError("no roster row for " + name);
    }

    private static long memberCount(JsonNode list, UUID sectionId) {
        for (JsonNode node : list) {
            if (node.get("id").asText().equals(sectionId.toString())) {
                return node.get("memberCount").asLong();
            }
        }
        throw new AssertionError("section " + sectionId + " missing from the list");
    }

    /** A section of this test's own, so counts do not depend on what else ran. */
    private UUID section(String label) {
        return jdbc.queryForObject(
                "insert into section (name, country_code) values (?, 'TR') returning id",
                UUID.class,
                label + " " + UUID.randomUUID());
    }

    private AppUser member(String name, UUID sectionId, AccountStatus status) {
        AppUser user = AppUser.register(
                "section-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        user.setName(name);
        if (sectionId != null) {
            user.setSection(sections.findById(sectionId).orElseThrow());
        }
        return users.saveAndFlush(user);
    }

    /** Plain SQL: the events feature is step B-2's, and this only needs two rows. */
    private UUID event(UUID sectionId, Instant startsAt, Instant endsAt) {
        UUID id = jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover, board_mode, join_code)
                        values (?, 'national', ?, ?, ?, 'magenta', 'approve_first', ?)
                        returning id
                        """,
                UUID.class,
                "QA Event",
                sectionId,
                java.sql.Timestamp.from(startsAt),
                java.sql.Timestamp.from(endsAt),
                joinCode());
        fixtureEvents.add(id);
        return id;
    }

    private void join(UUID eventId, UUID userId) {
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, userId);
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private JsonNode read(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }
}
