package app.brand.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.ApiException;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.support.TestMemberships;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * {@code /events} — the rules in BACKEND_PLAN.md §3 "Events", which are
 * {@code mock.ts}'s rules unchanged.
 *
 * <p>The ones worth naming: status is derived, so the boundaries are tested by
 * moving the clock rather than by waiting [B5]; the event's section is the
 * creator's membership section and is never sent by the client [D11]/[D15]; and
 * a board you are not in is 404, not 403, so a join code cannot be probed for.
 *
 * <p>[D13]/[D16] Creating needs an {@code organisationId} and an approved
 * membership the organisation's switch allows: TENANT_PLAN.md §9 tests 19 and 20.
 * The join refusals [D17] are in {@code OrganisationJoinIntegrationTest}.
 */
class EventIntegrationTest extends AbstractIntegrationTest {

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
    private EventAccess access;

    @Autowired
    private EventRepository events;

    @Autowired
    private TestMemberships memberships;

    /**
     * The suite shares one database, and {@code SchemaMigrationTest} checks that
     * nothing is seeded (principle 4) by counting these tables. A test that leaves
     * events behind would turn that check into a coin toss on class order, so this
     * class clears up after itself.
     */
    @AfterEach
    void unfreezeTheClockAndClearEvents() {
        clock.reset();
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        memberships.removeOrganisations();
    }

    /* ------------------------------------------------------- POST /events */

    @Test
    @DisplayName("a created event takes the creator's membership section, not the account's, and the creator moderates it")
    void createTakesTheCreatorsSection() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        // [D15] The account's own (unmapped) section column says something else;
        // the event must not read it.
        jdbc.update("update app_user set section_id = ? where id = ?",
                otherSection(section).getId(), creator.getId());
        Instant starts = Instant.parse("2026-10-01T18:00:00Z");
        // `upcoming` is derived from now [B5]: stand a day before the start, not on
        // whatever today is.
        clock.freezeAt(starts.minus(1, ChronoUnit.DAYS));

        JsonNode created = json(mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request("  Welcome night  ", "section",
                                starts.toString(), starts.plus(4, ChronoUnit.HOURS).toString(),
                                "magenta", "approve_first"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Welcome night"))
                .andExpect(jsonPath("$.organisation.id").value(memberships.esnTurkiye().toString()))
                .andExpect(jsonPath("$.organisation.name").value(TestMemberships.ESN_TURKIYE))
                .andExpect(jsonPath("$.organisation.hasSections").value(true))
                .andExpect(jsonPath("$.section.id").value(section.getId().toString()))
                .andExpect(jsonPath("$.country").value(section.getCountry().getName()))
                .andExpect(jsonPath("$.isModerator").value(true))
                .andExpect(jsonPath("$.memberCount").value(1))
                .andExpect(jsonPath("$.postCount").value(0))
                .andExpect(jsonPath("$.status").value("upcoming"))
                .andExpect(jsonPath("$.closedAt").doesNotExist())
                .andReturn());

        assertThat(created.get("joinCode").asText())
                .hasSize(JoinCodeGenerator.LENGTH)
                .matches("[" + JoinCodeGenerator.ALPHABET + "]+");
        assertThat(created.get("people")).hasSize(1);
        assertThat(created.get("people").get(0).get("id").asText()).isEqualTo(creator.getId().toString());
        assertThat(created.toString()).doesNotContain("senderId").doesNotContain("email");

        UUID eventId = UUID.fromString(created.get("id").asText());
        assertThat(jdbc.queryForObject(
                "select is_moderator from event_member where event_id = ? and user_id = ?",
                Boolean.class, eventId, creator.getId())).isTrue();
        assertThat(jdbc.queryForObject("select section_id from event where id = ?", UUID.class, eventId))
                .isEqualTo(section.getId());
    }

    @Test
    @DisplayName("a national event hides the section but still carries the country [D11]")
    void nationalEventHidesTheSection() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        Instant starts = Instant.parse("2026-10-01T18:00:00Z");

        mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request("National meeting", "national",
                                starts.toString(), starts.plus(1, ChronoUnit.DAYS).toString(),
                                "azure", "post_immediately"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("national"))
                .andExpect(jsonPath("$.section").doesNotExist())
                .andExpect(jsonPath("$.country").value(section.getCountry().getName()));
    }

    @Test
    @DisplayName("every create field names itself when it is wrong")
    void createValidationNamesTheField() throws Exception {
        AppUser creator = account(anySection());
        String starts = "2026-10-01T18:00:00Z";
        String ends = "2026-10-01T22:00:00Z";

        invalidCreate(creator, request("a", "section", starts, ends, "magenta", "approve_first"), "name");
        invalidCreate(creator, request("x".repeat(41), "section", starts, ends, "magenta", "approve_first"), "name");
        invalidCreate(creator, request("Party", "section", "tonight", ends, "magenta", "approve_first"), "startsAt");
        invalidCreate(creator, request("Party", "section", starts, null, "magenta", "approve_first"), "endsAt");
        invalidCreate(creator, request("Party", "section", ends, starts, "magenta", "approve_first"), "endsAt");
        invalidCreate(creator, request("Party", "section", starts, starts, "magenta", "approve_first"), "endsAt");
        invalidCreate(creator, request("Party", "region", starts, ends, "magenta", "approve_first"), "scope");
        invalidCreate(creator, request("Party", "section", starts, ends, "beige", "approve_first"), "cover");
        invalidCreate(creator, request("Party", "section", starts, ends, "magenta", "free_for_all"), "boardMode");
        // [P9] An organisation with sections needs a scope.
        invalidCreate(creator, request("Party", null, starts, ends, "magenta", "approve_first"), "scope");
        // [D13] The organisation is required.
        Map<String, Object> noOrganisation = request("Party", "section", starts, ends, "magenta", "approve_first");
        noOrganisation.remove("organisationId");
        invalidCreate(creator, noOrganisation, "organisationId");
    }

    /* ------------------------------------------- [D16] the creation switch */

    @Test
    @DisplayName("test 19: with event_creation = admins a member gets 403 event_creation_not_allowed and an admin succeeds")
    void adminsOnlyOrganisation() throws Exception {
        UUID orgId = memberships.organisation(true, false, "admins");
        AppUser member = account(null);
        AppUser admin = account(null);
        memberships.add(orgId, member.getId(), "approved", "member", null, null);
        memberships.add(orgId, admin.getId(), "approved", "admin", null, null);

        refusedCreate(member, openRequest(orgId));
        createIn(admin, openRequest(orgId));
    }

    @Test
    @DisplayName("test 19: with event_creation = members an approved member succeeds; pending, rejected and no membership get 403")
    void membersOrganisation() throws Exception {
        UUID orgId = memberships.organisation(true, false, "members");
        AppUser approved = account(null);
        AppUser pending = account(null);
        AppUser rejected = account(null);
        AppUser outsider = account(null);
        memberships.add(orgId, approved.getId(), "approved", "member", null, null);
        memberships.add(orgId, pending.getId(), "pending", "member", null, null);
        memberships.add(orgId, rejected.getId(), "rejected", "member", null, null);

        createIn(approved, openRequest(orgId));
        refusedCreate(pending, openRequest(orgId));
        refusedCreate(rejected, openRequest(orgId));
        refusedCreate(outsider, openRequest(orgId));
        // An organisation that does not exist, or an id that is not one, is no
        // organisation this person can create in either: the same answer.
        refusedCreate(approved, openRequest(UUID.randomUUID()));
        Map<String, Object> malformed = openRequest(orgId);
        malformed.put("organisationId", "not-an-id");
        refusedCreate(approved, malformed);
        // A membership elsewhere is not a membership here.
        refusedCreate(account(anySection()), openRequest(orgId));
    }

    @Test
    @DisplayName("test 20: an event in an organisation without sections has no scope, no section and no country")
    void organisationWithoutSections() throws Exception {
        UUID orgId = memberships.organisation(false, false, "members");
        AppUser creator = account(anySection());
        memberships.add(orgId, creator.getId(), "approved", "member", null, null);

        JsonNode created = createIn(creator, openRequest(orgId));
        assertThat(created.has("scope")).isFalse();
        assertThat(created.has("section")).isFalse();
        assertThat(created.has("country")).isFalse();
        assertThat(created.get("organisation").get("id").asText()).isEqualTo(orgId.toString());
        assertThat(created.get("organisation").get("hasSections").asBoolean()).isFalse();
        UUID eventId = UUID.fromString(created.get("id").asText());
        Map<String, Object> row = jdbc.queryForMap(
                "select scope, section_id, organisation_id from event where id = ?", eventId);
        assertThat(row.get("scope")).isNull();
        assertThat(row.get("section_id")).isNull();
        assertThat(row.get("organisation_id")).isEqualTo(orgId);

        // The summary list says the same.
        JsonNode mine = json(mockMvc.perform(get("/events").header(HttpHeaders.AUTHORIZATION, bearer(creator)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(mine.get(0).has("scope")).isFalse();
        assertThat(mine.get(0).has("country")).isFalse();
        assertThat(mine.get(0).get("organisation").get("id").asText()).isEqualTo(orgId.toString());

        // A scope sent anyway is a validation error.
        Map<String, Object> withScope = openRequest(orgId);
        withScope.put("scope", "national");
        invalidCreate(creator, withScope, "scope");
    }

    /* -------------------------------------------------- POST /events/join */

    @Test
    @DisplayName("a join code is read as people say it: spaces, dashes and lowercase all join")
    void joinNormalisesTheCode() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        String code = createEvent(creator, "Join me", "section", Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(3600)).get("joinCode").asText();
        AppUser joiner = account(section);

        String typed = " " + code.substring(0, 2).toLowerCase() + "-" + code.substring(2, 4)
                + " " + code.substring(4) + " ";

        mockMvc.perform(post("/events/join")
                        .header(HttpHeaders.AUTHORIZATION, bearer(joiner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("code", typed))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.event.name").value("Join me"))
                .andExpect(jsonPath("$.event.memberCount").value(2))
                // The joiner is not a moderator, and the roster puts them first.
                .andExpect(jsonPath("$.event.isModerator").value(false))
                .andExpect(jsonPath("$.event.people[0].id").value(joiner.getId().toString()))
                .andExpect(jsonPath("$.event.people[1].id").value(creator.getId().toString()));

        // And the creator sees the joiner, with themselves first.
        mockMvc.perform(get("/events/" + createdEventIdFor(code))
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.people[0].id").value(creator.getId().toString()))
                .andExpect(jsonPath("$.people[1].id").value(joiner.getId().toString()));
    }

    @Test
    @DisplayName("an unknown code is ok:false not_found, not a 404")
    void joinUnknownCode() throws Exception {
        AppUser joiner = account(anySection());

        mockMvc.perform(post("/events/join")
                        .header(HttpHeaders.AUTHORIZATION, bearer(joiner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("code", "ZZZZZZ"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("not_found"))
                .andExpect(jsonPath("$.event").doesNotExist());
    }

    @Test
    @DisplayName("joining twice answers already_joined and names the event")
    void joinTwice() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        String code = createEvent(creator, "Second time", "section", Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(3600)).get("joinCode").asText();

        mockMvc.perform(post("/events/join")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("code", code))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("already_joined"))
                .andExpect(jsonPath("$.eventName").value("Second time"));
    }

    /* -------------------------------------------------------- GET /events */

    @Test
    @DisplayName("my events are live first, then upcoming soonest first, then archived by most recent end")
    void listOrdersLiveFirst() throws Exception {
        Section section = anySection();
        AppUser viewer = account(section);
        Instant now = Instant.parse("2026-11-01T20:00:00Z");
        clock.freezeAt(now);

        UUID archivedOlder = event(section, now.minus(9, ChronoUnit.DAYS), now.minus(8, ChronoUnit.DAYS));
        UUID archivedNewer = event(section, now.minus(3, ChronoUnit.DAYS), now.minus(2, ChronoUnit.DAYS));
        UUID upcomingLater = event(section, now.plus(5, ChronoUnit.DAYS), now.plus(6, ChronoUnit.DAYS));
        UUID upcomingSooner = event(section, now.plus(1, ChronoUnit.DAYS), now.plus(2, ChronoUnit.DAYS));
        UUID live = event(section, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        UUID closedEarly = event(section, now.minus(2, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        jdbc.update("update event set closed_at = ? where id = ?",
                java.sql.Timestamp.from(now.minus(1, ChronoUnit.MINUTES)), closedEarly);
        // An event the viewer never joined is not in their list, at any status.
        UUID someoneElses = event(section, now.minus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));

        for (UUID id : List.of(archivedOlder, archivedNewer, upcomingLater, upcomingSooner, live, closedEarly)) {
            join(id, viewer.getId());
        }
        join(someoneElses, account(section).getId());

        JsonNode list = json(mockMvc.perform(get("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn());

        // The element's own id, not `findValues`: a section-scoped summary carries a
        // nested section id too.
        List<String> ids = new java.util.ArrayList<>();
        list.forEach(summary -> ids.add(summary.get("id").asText()));
        assertThat(ids).containsExactly(
                live.toString(),
                upcomingSooner.toString(), upcomingLater.toString(),
                // Closed early ends later than the two that ran out, so it is the
                // most recent end of the three archived rows [D4].
                closedEarly.toString(), archivedNewer.toString(), archivedOlder.toString());
        assertThat(ids).doesNotContain(someoneElses.toString());
        assertThat(list.get(0).get("status").asText()).isEqualTo("live");
        assertThat(list.get(1).get("status").asText()).isEqualTo("upcoming");
        assertThat(list.get(3).get("status").asText()).isEqualTo("archived");
        assertThat(list.get(3).get("closedAt").asText()).isNotBlank();
        assertThat(list.get(0).get("memberCount").asInt()).isEqualTo(1);
        assertThat(list.get(0).get("postCount").asInt()).isZero();
        // A summary never carries the roster or the code.
        assertThat(list.get(0).has("people")).isFalse();
        assertThat(list.get(0).has("joinCode")).isFalse();
    }

    /* --------------------------------------------------- GET /events/{id} */

    @Test
    @DisplayName("an event you have not joined is 404, and so is a malformed id")
    void getRequiresMembership() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        AppUser stranger = account(section);
        UUID eventId = event(section, Instant.now().minusSeconds(60), Instant.now().plusSeconds(3600));
        join(eventId, creator.getId());

        mockMvc.perform(get("/events/" + eventId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));

        mockMvc.perform(get("/events/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/events/not-a-uuid")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    /* ---------------------------------------------------- derived status */

    @Test
    @DisplayName("status flips exactly at startsAt and endsAt, and closing archives at once [B5][D4]")
    void statusBoundaries() throws Exception {
        Section section = anySection();
        AppUser viewer = account(section);
        Instant starts = Instant.parse("2026-12-05T19:00:00Z");
        Instant ends = starts.plus(4, ChronoUnit.HOURS);
        UUID eventId = event(section, starts, ends);
        join(eventId, viewer.getId());

        clock.freezeAt(starts.minusMillis(1));
        assertThat(statusOf(viewer, eventId)).isEqualTo("upcoming");

        clock.freezeAt(starts);
        assertThat(statusOf(viewer, eventId)).isEqualTo("live");

        clock.freezeAt(ends.minusMillis(1));
        assertThat(statusOf(viewer, eventId)).isEqualTo("live");

        clock.freezeAt(ends);
        assertThat(statusOf(viewer, eventId)).isEqualTo("archived");

        // Closed early: archived while now is still inside the window, and the app
        // renders "Closed" from closedAt rather than from a fourth status.
        clock.freezeAt(starts.plus(1, ChronoUnit.HOURS));
        assertThat(statusOf(viewer, eventId)).isEqualTo("live");
        jdbc.update("update event set closed_at = ? where id = ?",
                java.sql.Timestamp.from(starts.plus(30, ChronoUnit.MINUTES)), eventId);
        assertThat(statusOf(viewer, eventId)).isEqualTo("archived");
    }

    @Test
    @DisplayName("requireLive refuses an upcoming, an archived and a closed board with 409 board_read_only")
    void requireLiveRefusesEverythingButLive() {
        Section section = anySection();
        Instant now = Instant.parse("2026-12-06T19:00:00Z");
        clock.freezeAt(now);

        Event upcoming = events.findById(event(section, now.plusSeconds(60), now.plusSeconds(3600))).orElseThrow();
        Event archived = events.findById(event(section, now.minusSeconds(3600), now.minusSeconds(60))).orElseThrow();
        UUID closedId = event(section, now.minusSeconds(60), now.plusSeconds(3600));
        jdbc.update("update event set closed_at = ? where id = ?", java.sql.Timestamp.from(now), closedId);
        Event closed = events.findById(closedId).orElseThrow();
        Event live = events.findById(event(section, now.minusSeconds(60), now.plusSeconds(3600))).orElseThrow();

        for (Event event : List.of(upcoming, archived, closed)) {
            assertThatThrownBy(() -> access.requireLive(event))
                    .isInstanceOfSatisfying(ApiException.class, ex -> {
                        assertThat(ex.status().value()).isEqualTo(409);
                        assertThat(ex.code()).isEqualTo("board_read_only");
                    });
        }
        access.requireLive(live);
    }

    /* ------------------------------------------------------- post counts */

    @Test
    @DisplayName("postCount is published posts only: the recipient, not the board, decides [D12]")
    void postCountCountsPublishedRowsOnly() throws Exception {
        Section section = anySection();
        AppUser viewer = account(section);
        AppUser other = account(section);
        UUID eventId = event(section, Instant.now().minusSeconds(60), Instant.now().plusSeconds(3600));
        join(eventId, viewer.getId());
        join(eventId, other.getId());

        // Counted: an approved room post that is not hidden.
        roomPost(eventId, other.getId(), "approved", false);
        // Not counted: approved but hidden by a moderator, and still pending.
        roomPost(eventId, other.getId(), "approved", true);
        roomPost(eventId, other.getId(), "pending", false);
        // Counted: a post to a person whose message they put on their wall.
        personPost(eventId, other.getId(), viewer.getId(), "approved", false);
        // Not counted: kept private, and approved-then-deleted.
        personPost(eventId, other.getId(), viewer.getId(), "private", false);
        personPost(eventId, other.getId(), viewer.getId(), "approved", true);

        mockMvc.perform(get("/events/" + eventId).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.postCount").value(2))
                .andExpect(jsonPath("$.memberCount").value(2));
    }

    @Test
    @DisplayName("joining a board you are already on never rewrites the membership row")
    void joinTwiceKeepsTheModeratorRow() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        JsonNode created = createEvent(creator, "Already in", "section",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(3600));
        String code = created.get("joinCode").asText();
        UUID eventId = UUID.fromString(created.get("id").asText());

        // The creator's row is a moderator row, and it is already there — which is
        // exactly the shape of a lost race: the insert conflicts. It must answer
        // already_joined rather than 500, and it must not update the row it found.
        mockMvc.perform(post("/events/join")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("code", code))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("already_joined"))
                .andExpect(jsonPath("$.eventName").value("Already in"))
                .andExpect(jsonPath("$.event").doesNotExist());

        assertThat(jdbc.queryForObject(
                "select is_moderator from event_member where event_id = ? and user_id = ?",
                Boolean.class, eventId, creator.getId())).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from event_member where event_id = ?",
                Integer.class, eventId)).isEqualTo(1);
    }

    @Test
    @DisplayName("memberCount is the membership, not the roster: a member with no name still counts")
    void memberCountIsMembershipNotRoster() throws Exception {
        Section section = anySection();
        AppUser creator = account(section);
        UUID eventId = UUID.fromString(createEvent(creator, "Counted", "section",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(3600)).get("id").asText());

        AppUser nameless = account(section);
        nameless.setName(null);
        users.saveAndFlush(nameless);
        join(eventId, nameless.getId());

        // GET /events and GET /events/{id} count the same people, whatever the
        // roster can render.
        mockMvc.perform(get("/events/" + eventId).header(HttpHeaders.AUTHORIZATION, bearer(creator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memberCount").value(2))
                .andExpect(jsonPath("$.people.length()").value(1));
        JsonNode mine = json(mockMvc.perform(get("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(mine.get(0).get("memberCount").asInt()).isEqualTo(2);
    }

    /* ------------------------------------------------------------ helpers */

    private String statusOf(AppUser viewer, UUID eventId) throws Exception {
        return json(mockMvc.perform(get("/events/" + eventId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andReturn())
                .get("status").asText();
    }

    private void refusedCreate(AppUser creator, Map<String, Object> request) throws Exception {
        mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("event_creation_not_allowed"));
    }

    private JsonNode createIn(AppUser creator, Map<String, Object> request) throws Exception {
        return json(mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isModerator").value(true))
                .andReturn());
    }

    /** A valid create request for an organisation without sections: no scope. */
    private static Map<String, Object> openRequest(UUID organisationId) {
        Map<String, Object> body = new HashMap<>();
        body.put("organisationId", organisationId.toString());
        body.put("name", "Quiz night");
        body.put("startsAt", "2026-12-01T18:00:00Z");
        body.put("endsAt", "2026-12-01T22:00:00Z");
        body.put("cover", "lime");
        body.put("boardMode", "post_immediately");
        return body;
    }

    private void invalidCreate(AppUser creator, Map<String, Object> request, String field) throws Exception {
        mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private JsonNode createEvent(AppUser creator, String name, String scope, Instant starts, Instant ends)
            throws Exception {
        return json(mockMvc.perform(post("/events")
                        .header(HttpHeaders.AUTHORIZATION, bearer(creator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request(name, scope, starts.toString(), ends.toString(),
                                "coral", "approve_first"))))
                .andExpect(status().isOk())
                .andReturn());
    }

    private UUID createdEventIdFor(String joinCode) {
        return jdbc.queryForObject("select id from event where join_code = ?", UUID.class, joinCode);
    }

    /** Null values are meaningful here, so this is not {@code Map.of}. An ESN Türkiye event. */
    private Map<String, Object> request(String name, String scope, String startsAt, String endsAt,
                                        String cover, String boardMode) {
        Map<String, Object> body = new HashMap<>();
        body.put("organisationId", memberships.esnTurkiye().toString());
        body.put("name", name);
        body.put("scope", scope);
        body.put("startsAt", startsAt);
        body.put("endsAt", endsAt);
        body.put("cover", cover);
        body.put("boardMode", boardMode);
        return body;
    }

    /** Plain SQL where the endpoint would only get in the way of arranging time. */
    private UUID event(Section section, Instant startsAt, Instant endsAt) {
        return jdbc.queryForObject("""
                        insert into event (organisation_id, name, scope, section_id, starts_at, ends_at, cover, board_mode, join_code)
                        values ((select id from organisation where name = 'ESN Türkiye'), 'Fixture', 'section', ?, ?, ?, 'mint', 'approve_first', ?)
                        returning id
                        """,
                UUID.class, section.getId(),
                java.sql.Timestamp.from(startsAt), java.sql.Timestamp.from(endsAt),
                randomCode());
    }

    private void join(UUID eventId, UUID userId) {
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, userId);
    }

    private void roomPost(UUID eventId, UUID senderId, String state, boolean hidden) {
        jdbc.update("""
                insert into board_post (event_id, sender_id, text, anonymity_level, state, hidden_at)
                values (?, ?, 'on the board', 'anonymous', ?, ?)
                """, eventId, senderId, state, hidden ? java.sql.Timestamp.from(Instant.now()) : null);
    }

    private void personPost(UUID eventId, UUID senderId, UUID recipientId, String state, boolean deleted) {
        UUID messageId = jdbc.queryForObject("""
                        insert into inbox_message (sender_id, recipient_id, event_id, text, anonymity_level,
                                                   state, from_board, deleted_at)
                        values (?, ?, ?, 'for you', 'anonymous', ?, true, ?)
                        returning id
                        """,
                UUID.class, senderId, recipientId, eventId, state,
                deleted ? java.sql.Timestamp.from(Instant.now()) : null);
        jdbc.update("""
                insert into board_post (event_id, sender_id, text, anonymity_level, state, inbox_message_id)
                values (?, ?, 'for you', 'anonymous', 'approved', ?)
                """, eventId, senderId, messageId);
    }

    private static String randomCode() {
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < JoinCodeGenerator.LENGTH; i++) {
            code.append(JoinCodeGenerator.ALPHABET.charAt(
                    (int) (Math.random() * JoinCodeGenerator.ALPHABET.length())));
        }
        return code.toString();
    }

    /**
     * An active, confirmed account. With a section: also an approved member of
     * ESN Türkiye in that section [D14]/[D15]. With null: no membership at all.
     */
    private AppUser account(Section section) {
        AppUser user = AppUser.register(
                "event-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.ACTIVE);
        // [D18] Confirmed, so the access filter judges the status alone.
        user.confirmEmail(Instant.now());
        user.setName("Member " + UUID.randomUUID().toString().substring(0, 4));
        AppUser saved = users.saveAndFlush(user);
        if (section != null) {
            memberships.approvedInEsn(saved.getId(), section.getId());
        }
        return saved;
    }

    /** The first ESN Türkiye section by name. */
    private Section anySection() {
        UUID esn = memberships.esnTurkiye();
        return sections.findAll().stream()
                .filter(section -> section.getOrganisationId().equals(esn))
                .min(Comparator.comparing(Section::getName))
                .orElseThrow();
    }

    /** Another ESN Türkiye section than {@code not}. */
    private Section otherSection(Section not) {
        UUID esn = memberships.esnTurkiye();
        return sections.findAll().stream()
                .filter(section -> section.getOrganisationId().equals(esn) && !section.getId().equals(not.getId()))
                .min(Comparator.comparing(Section::getName))
                .orElseThrow();
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private String body(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private JsonNode json(org.springframework.test.web.servlet.MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
