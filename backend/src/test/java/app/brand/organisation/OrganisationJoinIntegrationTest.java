package app.brand.organisation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.TestMemberships;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * [D17] Entering an organisation through an event join code:
 * {@code POST /events/join}'s membership answers and {@code POST /organisations/join}.
 * TENANT_PLAN.md §9 tests 13 to 18, plus re-submitting from each status and two
 * identical requests at once.
 *
 * <p>Every organisation is created by this test with a unique name
 * ({@link TestMemberships#organisation}); every event is removed again, because
 * {@code SchemaMigrationTest} asserts that the shared database holds none.
 */
class OrganisationJoinIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TestMemberships memberships;

    private final List<UUID> fixtureEvents = new ArrayList<>();

    @AfterEach
    void removeFixtures() {
        for (UUID eventId : fixtureEvents) {
            jdbc.update("delete from event_member where event_id = ?", eventId);
            jdbc.update("delete from event where id = ?", eventId);
        }
        fixtureEvents.clear();
        memberships.removeOrganisations();
    }

    /* ------------------------------------------------- POST /events/join */

    @Test
    @DisplayName("test 13: the code of an open organisation without sections makes an approved membership and joins, in one call")
    void openOrganisationJoinsInOneCall() throws Exception {
        UUID orgId = memberships.organisation(false, false, "members");
        Event event = event(orgId, null);
        AppUser person = account();

        mockMvc.perform(joinEvent(person, event.code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.event.id").value(event.id.toString()))
                .andExpect(jsonPath("$.event.organisation.id").value(orgId.toString()));

        Map<String, Object> row = membership(orgId, person.getId());
        assertThat(row).containsEntry("status", "approved")
                .containsEntry("role", "member")
                .containsEntry("section_id", null)
                .containsEntry("approved_by", null)
                .containsEntry("pending_event_id", null);
        assertThat(row.get("approved_at")).isNotNull();
        assertThat(inEvent(event.id, person.getId())).isTrue();
    }

    @Test
    @DisplayName("test 14: the code of an approval organisation answers membership_required and writes nothing")
    void approvalOrganisationNeedsAMembership() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        Event event = event(orgId, memberships.sectionOf(orgId));
        AppUser person = account();

        mockMvc.perform(joinEvent(person, event.code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("membership_required"))
                .andExpect(jsonPath("$.organisation.id").value(orgId.toString()))
                .andExpect(jsonPath("$.organisation.name").isNotEmpty())
                .andExpect(jsonPath("$.organisation.hasSections").value(true))
                .andExpect(jsonPath("$.approvalRequired").value(true))
                .andExpect(jsonPath("$.eventName").value("Welcome night"))
                .andExpect(jsonPath("$.event").doesNotExist());

        assertThat(membershipCount(orgId, person.getId())).isZero();
        assertThat(inEvent(event.id, person.getId())).isFalse();
    }

    @Test
    @DisplayName("an organisation with approval off but with sections still asks for the section: membership_required")
    void openOrganisationWithSectionsNeedsTheSection() throws Exception {
        UUID orgId = memberships.organisation(false, true, "members");
        Event event = event(orgId, memberships.sectionOf(orgId));
        AppUser person = account();

        mockMvc.perform(joinEvent(person, event.code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("membership_required"))
                .andExpect(jsonPath("$.approvalRequired").value(false));
        assertThat(membershipCount(orgId, person.getId())).isZero();
        assertThat(inEvent(event.id, person.getId())).isFalse();
    }

    @Test
    @DisplayName("an approved member joins; already being in the event comes before the membership answers")
    void approvedMemberJoinsAndAlreadyJoinedComesFirst() throws Exception {
        UUID orgId = memberships.organisation(true, false, "members");
        Event event = event(orgId, null);
        AppUser member = account();
        memberships.add(orgId, member.getId(), "approved", "member", null, null);

        mockMvc.perform(joinEvent(member, event.code))
                .andExpect(jsonPath("$.ok").value(true));
        mockMvc.perform(joinEvent(member, event.code))
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("already_joined"))
                .andExpect(jsonPath("$.eventName").value("Welcome night"))
                .andExpect(jsonPath("$.organisation").doesNotExist());

        // Someone already in the event whose membership is not approved still
        // hears "already joined": that check is second, the membership third.
        AppUser pendingButIn = account();
        memberships.add(orgId, pendingButIn.getId(), "pending", "member", null, null);
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", event.id, pendingButIn.getId());
        mockMvc.perform(joinEvent(pendingButIn, event.code))
                .andExpect(jsonPath("$.reason").value("already_joined"));
    }

    /* ------------------------------------------ POST /organisations/join */

    @Test
    @DisplayName("test 15: a section is required where the organisation has sections, and must be one of its own")
    void sectionRules() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        Event event = event(orgId, memberships.sectionOf(orgId));
        UUID otherOrg = memberships.organisation(true, true, "members");
        AppUser person = account();

        invalidRequest(person, event.code, null);
        invalidRequest(person, event.code, memberships.sectionOf(otherOrg).toString());
        invalidRequest(person, event.code, "not-a-section");
        invalidRequest(person, event.code, UUID.randomUUID().toString());
        assertThat(membershipCount(orgId, person.getId())).isZero();

        // Without sections, a section sent is refused too.
        UUID noSections = memberships.organisation(true, false, "members");
        Event barNight = event(noSections, null);
        invalidRequest(person, barNight.code, memberships.sectionOf(orgId).toString());
        assertThat(membershipCount(noSections, person.getId())).isZero();
    }

    @Test
    @DisplayName("an unknown or empty code is 404")
    void unknownCodeIsNotFound() throws Exception {
        AppUser person = account();
        mockMvc.perform(requestMembership(person, "ZZZZZZ", null))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mockMvc.perform(requestMembership(person, "", null))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("test 16: in an approval organisation the membership is pending, the event is not joined, and a join answers membership_pending")
    void approvalOrganisationRequestIsPending() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        Event event = event(orgId, sectionId);
        AppUser person = account();

        mockMvc.perform(requestMembership(person, event.code, sectionId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.role").value("member"))
                .andExpect(jsonPath("$.organisation.id").value(orgId.toString()))
                .andExpect(jsonPath("$.section.id").value(sectionId.toString()))
                .andExpect(jsonPath("$.canCreateEvents").value(false))
                .andExpect(jsonPath("$.pendingEventName").value("Welcome night"));

        Map<String, Object> row = membership(orgId, person.getId());
        assertThat(row).containsEntry("status", "pending")
                .containsEntry("pending_event_id", event.id)
                .containsEntry("approved_at", null);
        assertThat(inEvent(event.id, person.getId())).isFalse();

        mockMvc.perform(joinEvent(person, event.code))
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("membership_pending"))
                .andExpect(jsonPath("$.organisation.id").value(orgId.toString()))
                .andExpect(jsonPath("$.approvalRequired").value(true))
                .andExpect(jsonPath("$.eventName").value("Welcome night"));
    }

    @Test
    @DisplayName("approval off: the membership is approved at once and the event is joined")
    void openOrganisationRequestIsApproved() throws Exception {
        UUID orgId = memberships.organisation(false, true, "members");
        UUID sectionId = memberships.sectionOf(orgId);
        Event event = event(orgId, sectionId);
        AppUser person = account();

        mockMvc.perform(requestMembership(person, event.code, sectionId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.canCreateEvents").value(true))
                .andExpect(jsonPath("$.pendingEventName").doesNotExist());

        Map<String, Object> row = membership(orgId, person.getId());
        assertThat(row).containsEntry("status", "approved")
                .containsEntry("section_id", sectionId)
                .containsEntry("approved_by", null)
                .containsEntry("pending_event_id", null);
        assertThat(row.get("approved_at")).isNotNull();
        assertThat(inEvent(event.id, person.getId())).isTrue();
    }

    @Test
    @DisplayName("test 17: approving the request joins the stored event; with the event gone, approval still succeeds")
    void approvalJoinsTheRequestedEvent() throws Exception {
        UUID orgId = memberships.organisation(true, false, "members");
        AppUser admin = account();
        memberships.add(orgId, admin.getId(), "approved", "admin", null, null);
        Event event = event(orgId, null);
        AppUser person = account();

        mockMvc.perform(requestMembership(person, event.code, null))
                .andExpect(jsonPath("$.status").value("pending"));
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.getId() + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());
        assertThat(inEvent(event.id, person.getId())).isTrue();

        // The second person's event is deleted before the approval.
        Event gone = event(orgId, null);
        AppUser second = account();
        mockMvc.perform(requestMembership(second, gone.code, null))
                .andExpect(jsonPath("$.status").value("pending"));
        jdbc.update("delete from event where id = ?", gone.id);
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + second.getId() + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
        assertThat(membership(orgId, second.getId())).containsEntry("status", "approved");
    }

    @Test
    @DisplayName("test 18: a rejected member answers membership_rejected and can ask again: pending, new section, new event, new submitted_at")
    void rejectedMemberAsksAgain() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID firstSection = memberships.sectionOf(orgId);
        UUID secondSection = memberships.section(orgId);
        Event first = event(orgId, firstSection);
        Event second = event(orgId, firstSection);
        AppUser person = account();
        memberships.add(orgId, person.getId(), "rejected", "member", firstSection, null);
        jdbc.update("update organisation_member set submitted_at = ? where organisation_id = ? and user_id = ?",
                Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), orgId, person.getId());
        Timestamp before = (Timestamp) membership(orgId, person.getId()).get("submitted_at");

        mockMvc.perform(joinEvent(person, first.code))
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.reason").value("membership_rejected"))
                .andExpect(jsonPath("$.approvalRequired").value(true))
                .andExpect(jsonPath("$.eventName").value("Welcome night"));

        mockMvc.perform(requestMembership(person, second.code, secondSection.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.section.id").value(secondSection.toString()));

        Map<String, Object> row = membership(orgId, person.getId());
        assertThat(row).containsEntry("status", "pending")
                .containsEntry("section_id", secondSection)
                .containsEntry("pending_event_id", second.id);
        assertThat((Timestamp) row.get("submitted_at")).isAfter(before);
        assertThat(inEvent(second.id, person.getId())).isFalse();
        assertThat(membershipCount(orgId, person.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("approval switched off later: a waiting and a rejected person are let in by the event code")
    void approvalSwitchedOffLetsWaitingAndRejectedInByCode() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID section = memberships.sectionOf(orgId);
        Event event = event(orgId, section);
        AppUser waiting = account();
        AppUser rejected = account();
        memberships.add(orgId, waiting.getId(), "pending", "member", section, event.id);
        memberships.add(orgId, rejected.getId(), "rejected", "member", section, null);
        jdbc.update("update organisation set approval_required = false where id = ?", orgId);

        for (AppUser person : List.of(waiting, rejected)) {
            mockMvc.perform(joinEvent(person, event.code))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.ok").value(true));

            Map<String, Object> row = membership(orgId, person.getId());
            assertThat(row).containsEntry("status", "approved")
                    .containsEntry("section_id", section)
                    .containsEntry("pending_event_id", null);
            assertThat(row.get("approved_at")).isNotNull();
            assertThat(inEvent(event.id, person.getId())).isTrue();
        }
    }

    @Test
    @DisplayName("approval switched off later: a rejected person asking again is approved with the section sent now")
    void approvalSwitchedOffLetsRejectedInByRequest() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID firstSection = memberships.sectionOf(orgId);
        UUID secondSection = memberships.section(orgId);
        Event event = event(orgId, firstSection);
        AppUser person = account();
        memberships.add(orgId, person.getId(), "rejected", "member", firstSection, null);
        jdbc.update("update organisation set approval_required = false where id = ?", orgId);

        mockMvc.perform(requestMembership(person, event.code, secondSection.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.section.id").value(secondSection.toString()));

        assertThat(membership(orgId, person.getId())).containsEntry("status", "approved")
                .containsEntry("section_id", secondSection)
                .containsEntry("pending_event_id", null);
        assertThat(inEvent(event.id, person.getId())).isTrue();
    }

    @Test
    @DisplayName("a pending member asking again stays pending; section and stored event become this request's")
    void pendingMemberAsksAgain() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID firstSection = memberships.sectionOf(orgId);
        UUID secondSection = memberships.section(orgId);
        Event first = event(orgId, firstSection);
        Event second = event(orgId, firstSection);
        AppUser person = account();

        mockMvc.perform(requestMembership(person, first.code, firstSection.toString()))
                .andExpect(jsonPath("$.status").value("pending"));
        Timestamp submitted = (Timestamp) membership(orgId, person.getId()).get("submitted_at");

        mockMvc.perform(requestMembership(person, second.code, secondSection.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.section.id").value(secondSection.toString()));

        Map<String, Object> row = membership(orgId, person.getId());
        assertThat(row).containsEntry("status", "pending")
                .containsEntry("section_id", secondSection)
                .containsEntry("pending_event_id", second.id)
                .containsEntry("submitted_at", submitted);
        assertThat(inEvent(first.id, person.getId())).isFalse();
        assertThat(inEvent(second.id, person.getId())).isFalse();
    }

    @Test
    @DisplayName("an approved member asking again changes nothing about the membership and joins the event, idempotently")
    void approvedMemberAsksAgain() throws Exception {
        UUID orgId = memberships.organisation(true, true, "members");
        UUID ownSection = memberships.sectionOf(orgId);
        UUID otherSection = memberships.section(orgId);
        Event event = event(orgId, ownSection);
        AppUser person = account();
        memberships.add(orgId, person.getId(), "approved", "admin", ownSection, null);
        Map<String, Object> before = membership(orgId, person.getId());

        for (int i = 0; i < 2; i++) {
            mockMvc.perform(requestMembership(person, event.code, otherSection.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("approved"))
                    .andExpect(jsonPath("$.role").value("admin"))
                    .andExpect(jsonPath("$.section.id").value(ownSection.toString()));
        }
        assertThat(membership(orgId, person.getId())).isEqualTo(before);
        assertThat(inEvent(event.id, person.getId())).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from event_member where event_id = ? and user_id = ?",
                Integer.class, event.id, person.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("two identical requests at once never answer 500: one membership row, both 200")
    void concurrentIdenticalRequests() throws Exception {
        UUID approvalOrg = memberships.organisation(true, true, "members");
        UUID sectionId = memberships.sectionOf(approvalOrg);
        Event approvalEvent = event(approvalOrg, sectionId);
        UUID openOrg = memberships.organisation(false, false, "members");
        Event openEvent = event(openOrg, null);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 5; round++) {
                AppUser person = account();
                List<Integer> statuses = race(pool, () -> mockMvc.perform(
                        requestMembership(person, approvalEvent.code, sectionId.toString()))
                        .andReturn().getResponse().getStatus());
                assertThat(statuses).containsOnly(200);
                assertThat(membershipCount(approvalOrg, person.getId())).isEqualTo(1);

                AppUser opener = account();
                List<Integer> openStatuses = race(pool, () -> mockMvc.perform(
                        requestMembership(opener, openEvent.code, null))
                        .andReturn().getResponse().getStatus());
                assertThat(openStatuses).containsOnly(200);
                assertThat(membershipCount(openOrg, opener.getId())).isEqualTo(1);
                assertThat(inEvent(openEvent.id, opener.getId())).isTrue();

                AppUser joiner = account();
                List<Integer> joinStatuses = race(pool, () -> mockMvc.perform(joinEvent(joiner, openEvent.code))
                        .andReturn().getResponse().getStatus());
                assertThat(joinStatuses).containsOnly(200);
                assertThat(membershipCount(openOrg, joiner.getId())).isEqualTo(1);
                assertThat(inEvent(openEvent.id, joiner.getId())).isTrue();
            }
        } finally {
            pool.shutdownNow();
        }
    }

    /* ------------------------------------------------------------ helpers */

    private record Event(UUID id, String code) {
    }

    private static List<Integer> race(ExecutorService pool, Callable<Integer> call) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                return call.call();
            }));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> future : futures) {
            statuses.add(future.get());
        }
        return statuses;
    }

    /** An active, confirmed account with a name and no membership anywhere. */
    private AppUser account() {
        AppUser user = AppUser.register(
                "join-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.ACTIVE);
        user.confirmEmail(Instant.now());
        user.setName("Person " + UUID.randomUUID().toString().substring(0, 4));
        return users.saveAndFlush(user);
    }

    /** A live event of the organisation, by SQL; with a section only where the organisation has them. */
    private Event event(UUID orgId, UUID sectionId) {
        String code = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        Instant starts = Instant.now().minus(1, ChronoUnit.HOURS);
        UUID id = jdbc.queryForObject("""
                        insert into event (organisation_id, name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code)
                        values (?, 'Welcome night', ?, ?, ?, ?, 'azure', 'approve_first', ?)
                        returning id
                        """, UUID.class, orgId, sectionId == null ? null : "national", sectionId,
                Timestamp.from(starts), Timestamp.from(starts.plus(4, ChronoUnit.HOURS)), code);
        fixtureEvents.add(id);
        return new Event(id, code);
    }

    private MockHttpServletRequestBuilder joinEvent(
            AppUser user, String code) throws Exception {
        return post("/events/join")
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("code", code)));
    }

    private MockHttpServletRequestBuilder requestMembership(
            AppUser user, String code, String sectionId) throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("code", code);
        if (sectionId != null) {
            request.put("sectionId", sectionId);
        }
        return post("/organisations/join")
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(request));
    }

    private void invalidRequest(AppUser user, String code, String sectionId) throws Exception {
        mockMvc.perform(requestMembership(user, code, sectionId))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("sectionId"));
    }

    private Map<String, Object> membership(UUID orgId, UUID userId) {
        return jdbc.queryForMap("select * from organisation_member where organisation_id = ? and user_id = ?",
                orgId, userId);
    }

    private int membershipCount(UUID orgId, UUID userId) {
        return jdbc.queryForObject("select count(*) from organisation_member where organisation_id = ? and user_id = ?",
                Integer.class, orgId, userId);
    }

    private boolean inEvent(UUID eventId, UUID userId) {
        return jdbc.queryForObject("select count(*) from event_member where event_id = ? and user_id = ?",
                Integer.class, eventId, userId) > 0;
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private String body(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
