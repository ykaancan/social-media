package app.brand.section;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.TextNormalizer;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.TestMemberships;
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
 * [D15] {@code GET /organisations/{id}/sections} and {@code GET /sections/{id}}.
 *
 * <p>The list is readable by any active account, because the section picker runs
 * before a membership exists; a section's page only by an approved member of its
 * organisation (TENANT_PLAN.md §9 test 25). Counts are real: a person counts in a
 * section when their membership is approved with that section and their account
 * is active, and a section nobody has joined reads 0.
 *
 * <p>Each test works in an organisation of its own ({@link TestMemberships}), so
 * counts do not depend on what else ran. The event rows the {@code wallEventId}
 * case needs are inserted with plain SQL.
 */
class SectionIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TestMemberships memberships;

    /** The events this class created, so the clean-up takes those and nothing else. */
    private final List<UUID> fixtureEvents = new ArrayList<>();

    /**
     * The suite shares one database, and {@code SchemaMigrationTest} checks that
     * nothing is seeded (principle 4) by counting the event and section tables.
     *
     * <p>Only this class's own rows, and the rows that reference them first: a
     * blanket delete would take another class's fixtures with it, and would fail
     * outright against a board that has posts on it.
     */
    @AfterEach
    void clearFixtures() {
        for (UUID eventId : fixtureEvents) {
            jdbc.update("delete from board_post where event_id = ?", eventId);
            jdbc.update("delete from inbox_message where event_id = ?", eventId);
            jdbc.update("delete from event_member where event_id = ?", eventId);
            jdbc.update("delete from event where id = ?", eventId);
        }
        fixtureEvents.clear();
        memberships.removeOrganisations();
    }

    /* ------------------------------------------ GET /organisations/{id}/sections */

    @Test
    @DisplayName("the list counts approved memberships of active accounts only, and an empty section reads 0")
    void listCountsApprovedActiveMembers() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID populated = memberships.sectionOf(orgId);
        UUID empty = memberships.section(orgId);
        member("Ada", populated, AccountStatus.ACTIVE, "approved");
        member("Bora", populated, AccountStatus.ACTIVE, "approved");
        member("Ceyda", populated, AccountStatus.INCOMPLETE, "approved");
        member("Derya", populated, AccountStatus.BANNED, "approved");
        member("Ece", populated, AccountStatus.ACTIVE, "pending");
        member("Fikret", populated, AccountStatus.ACTIVE, "rejected");

        // An active account with no membership at all can read it.
        AppUser viewer = account("Viewer", AccountStatus.ACTIVE);
        JsonNode list = read(mockMvc.perform(get("/organisations/" + orgId + "/sections")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(list.size()).isEqualTo(2);
        assertThat(memberCount(list, populated)).isEqualTo(2);
        assertThat(memberCount(list, empty)).isZero();
        assertThat(list.get(0).get("country").asText()).isEqualTo("Türkiye");
    }

    @Test
    @DisplayName("ESN Türkiye's list is its 26 sections, ordered by the normalised name")
    void listIsOrderedByNormalisedName() throws Exception {
        AppUser viewer = account("Viewer", AccountStatus.ACTIVE);

        JsonNode list = read(mockMvc.perform(get("/organisations/" + memberships.esnTurkiye() + "/sections")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        // Another organisation's sections are not in it.
        UUID other = memberships.organisation(true, true, "members");
        UUID otherSection = memberships.sectionOf(other);
        List<String> ids = new ArrayList<>();
        list.forEach(node -> ids.add(node.get("id").asText()));
        assertThat(ids).doesNotContain(otherSection.toString());

        List<String> normalised = new ArrayList<>();
        list.forEach(node -> normalised.add(TextNormalizer.normalizeForSearch(node.get("name").asText())));
        assertThat(normalised).isSorted();
        assertThat(list.size()).isGreaterThanOrEqualTo(26);
    }

    @Test
    @DisplayName("an organisation without sections lists none; an unknown or malformed organisation is 404")
    void listEdges() throws Exception {
        AppUser viewer = account("Viewer", AccountStatus.ACTIVE);
        UUID noSections = memberships.organisation(false, false, "members");

        mockMvc.perform(get("/organisations/" + noSections + "/sections")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/organisations/" + UUID.randomUUID() + "/sections")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mockMvc.perform(get("/organisations/not-a-uuid/sections")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the list needs an active account: incomplete is 403 account_not_active, signed out is 401")
    void listNeedsAnActiveAccount() throws Exception {
        AppUser incomplete = account(null, AccountStatus.INCOMPLETE);
        String path = "/organisations/" + memberships.esnTurkiye() + "/sections";

        mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(incomplete)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));
        mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
    }

    /* ------------------------------------------------------- GET /sections/{id} */

    @Test
    @DisplayName("test 25: a roster is 404 to an active account that is not an approved member; the list is 200")
    void rosterNeedsAnApprovedMembership() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        member("Baran", sectionId, AccountStatus.ACTIVE, "approved");

        AppUser outsider = account("Outsider", AccountStatus.ACTIVE);
        AppUser pending = member("Pending", sectionId, AccountStatus.ACTIVE, "pending");
        AppUser rejected = member("Rejected", sectionId, AccountStatus.ACTIVE, "rejected");
        UUID otherOrg = memberships.organisation(true, true, "members");
        AppUser elsewhere = member("Elsewhere", memberships.sectionOf(otherOrg), AccountStatus.ACTIVE, "approved");

        for (AppUser viewer : List.of(outsider, pending, rejected, elsewhere)) {
            mockMvc.perform(get("/sections/" + sectionId).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("not_found"));
            mockMvc.perform(get("/organisations/" + orgId + "/sections")
                            .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                    .andExpect(status().isOk());
        }
    }

    @Test
    @DisplayName("an unknown section is 404")
    void unknownSectionIsNotFound() throws Exception {
        AppUser viewer = account("Viewer", AccountStatus.ACTIVE);

        mockMvc.perform(get("/sections/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mockMvc.perform(get("/sections/not-a-uuid").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the roster is approved members of active accounts; the viewer heads their own section")
    void viewerIsFirstInOwnSection() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        member("Işıl", sectionId, AccountStatus.ACTIVE, "approved");
        member("Irmak", sectionId, AccountStatus.ACTIVE, "approved");
        member("Nobody", sectionId, AccountStatus.INCOMPLETE, "approved");
        member("Waiting", sectionId, AccountStatus.ACTIVE, "pending");
        AppUser viewer = member("Viewer", sectionId, AccountStatus.ACTIVE, "approved");

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.country").value("Türkiye"))
                .andReturn());

        assertThat(body.get("memberCount").asLong()).isEqualTo(3);
        // The viewer is a member like everyone else in the roster, so nobody is
        // counted twice: "and N more" is rosterTotal - roster.length.
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
    @DisplayName("an approved member sees another section of the same organisation, without themselves in it")
    void otherSectionRoster() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID theirs = memberships.sectionOf(orgId);
        UUID mine = memberships.section(orgId);
        member("Baran", theirs, AccountStatus.ACTIVE, "approved");
        AppUser viewer = member("Viewer", mine, AccountStatus.ACTIVE, "approved");

        JsonNode body = read(mockMvc.perform(get("/sections/" + theirs)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(names(body.get("roster"))).containsExactly("Baran");
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(1);
    }

    @Test
    @DisplayName("the roster reads the membership's section, not the account's own section column")
    void rosterReadsTheMembership() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        AppUser viewer = member("Viewer", sectionId, AccountStatus.ACTIVE, "approved");
        // The account column points at this section, but there is no membership.
        AppUser columnOnly = account("Column only", AccountStatus.ACTIVE);
        jdbc.update("update app_user set section_id = ? where id = ?", sectionId, columnOnly.getId());

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());
        // Before the assertion, so the clean-up can always delete the section.
        jdbc.update("update app_user set section_id = null where id = ?", columnOnly.getId());

        assertThat(names(body.get("roster"))).containsExactly("Viewer");
    }

    @Test
    @DisplayName("a big roster is one page of 50 and rosterTotal carries the rest")
    void rosterIsOnePageOfFifty() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        for (int i = 0; i < 60; i++) {
            member(String.format("Member %02d", i), sectionId, AccountStatus.ACTIVE, "approved");
        }
        AppUser viewer = member("Zzz Viewer", sectionId, AccountStatus.ACTIVE, "approved");

        JsonNode body = read(mockMvc.perform(get("/sections/" + sectionId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(body.get("roster").size()).isEqualTo(50);
        assertThat(body.get("memberCount").asLong()).isEqualTo(61);
        // "and N more" = rosterTotal - roster.length = 11.
        assertThat(body.get("rosterTotal").asLong()).isEqualTo(61);
        // The viewer sorts last by name and is still first on the page.
        assertThat(names(body.get("roster")).get(0)).isEqualTo("Zzz Viewer");
        assertThat(names(body.get("roster")).get(1)).isEqualTo("Member 00");
    }

    @Test
    @DisplayName("wallEventId appears only for a member the viewer shares an event with, live preferred")
    void wallEventIdIsOnlyForSharedEvents() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        AppUser shared = member("Shared", sectionId, AccountStatus.ACTIVE, "approved");
        AppUser unrelated = member("Unrelated", sectionId, AccountStatus.ACTIVE, "approved");
        AppUser viewer = member("Viewer", sectionId, AccountStatus.ACTIVE, "approved");

        Instant now = Instant.now();
        UUID archived = event(orgId, sectionId, now.minus(3, ChronoUnit.DAYS), now.minus(2, ChronoUnit.DAYS));
        UUID live = event(orgId, sectionId, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        UUID theirsOnly = event(orgId, sectionId, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));

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

    /** A confirmed account with no membership. */
    private AppUser account(String name, AccountStatus status) {
        AppUser user = AppUser.register(
                "section-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        // [D18] Confirmed, so the access filter judges the status alone.
        user.confirmEmail(Instant.now());
        user.setName(name);
        return users.saveAndFlush(user);
    }

    /** An account with a membership of this status in the section's organisation, with that section. */
    private AppUser member(String name, UUID sectionId, AccountStatus accountStatus, String membershipStatus) {
        AppUser user = account(name, accountStatus);
        UUID orgId = jdbc.queryForObject("select organisation_id from section where id = ?", UUID.class, sectionId);
        memberships.add(orgId, user.getId(), membershipStatus, "member", sectionId, null);
        return user;
    }

    /** Plain SQL: only the rows the shared-event lookup reads. */
    private UUID event(UUID orgId, UUID sectionId, Instant startsAt, Instant endsAt) {
        UUID id = jdbc.queryForObject("""
                        insert into event (organisation_id, name, scope, section_id, starts_at, ends_at, cover, board_mode, join_code)
                        values (?, ?, 'national', ?, ?, ?, 'magenta', 'approve_first', ?)
                        returning id
                        """,
                UUID.class,
                orgId,
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
