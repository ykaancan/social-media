package app.brand.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code PUT /me/memberships/{organisationId}/section} — [D7]/[D15] changing your
 * own section in one organisation.
 *
 * <p>The product rules on trial: the move is <b>not</b> a return to the approval
 * queue (the membership stays approved, the account stays active), the cooldown
 * boundary is <b>inclusive</b> at exactly 30 days, the 30 days are counted <b>per
 * organisation</b> (acceptance test 24), and re-picking the section you are
 * already in is a no-op that costs nothing — neither an audit row nor the month's
 * allowance.
 *
 * <p>[D11] The move is a country change too; the membership in the {@code Me} that
 * comes back says so, because country is only ever read through the section.
 */
class SectionChangeIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private TestMemberships testMemberships;

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

    private final List<UUID> created = new java.util.ArrayList<>();

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.parse("2026-04-01T09:00:00Z");
        clock.freezeAt(base);
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        for (UUID id : created) {
            jdbc.update("delete from section_change where user_id = ?", id);
        }
        created.clear();
        testMemberships.removeOrganisations();
    }

    @Test
    @DisplayName("a move writes the membership's section and one audit row with the organisation, and keeps both statuses")
    void happyPath() throws Exception {
        AppUser me = account(first());
        Section target = second();
        UUID esn = testMemberships.esnTurkiye();

        JsonNode membership = membershipIn(json(change(me, esn, target.getId().toString())
                .andExpect(status().isOk())
                // [D7] No re-approval, ever.
                .andExpect(jsonPath("$.status").value("active"))
                // [D15] There is no account-level section any more.
                .andExpect(jsonPath("$.section").doesNotExist())), esn);
        assertThat(membership.get("section").get("id").asText()).isEqualTo(target.getId().toString());
        assertThat(membership.get("section").get("name").asText()).isEqualTo(target.getName());
        // [D11] Country comes with it; it is not a field anyone picked.
        assertThat(membership.get("section").get("country").asText()).isEqualTo(target.getCountry().getName());
        assertThat(membership.get("status").asText()).isEqualTo("approved");

        assertThat(changes(me)).singleElement().satisfies(row -> {
            assertThat(row.get("from_section_id")).isEqualTo(first().getId());
            assertThat(row.get("to_section_id")).isEqualTo(target.getId());
            assertThat(row.get("organisation_id")).isEqualTo(esn);
        });
        assertThat(membershipSection(me, esn)).isEqualTo(target.getId());
    }

    @Test
    @DisplayName("the next-change date lives on the membership, 30 days out; settings no longer carry it")
    void cooldownIsOnTheMembership() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();

        assertThat(membershipIn(me(me), esn).get("sectionChangeAvailableAt").isNull()).isTrue();

        change(me, esn, second().getId().toString()).andExpect(status().isOk());

        assertThat(membershipIn(me(me), esn).get("sectionChangeAvailableAt").asText())
                .isEqualTo(base.plus(30, ChronoUnit.DAYS).toString());
        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sectionChangeAvailableAt").doesNotExist());
    }

    @Test
    @DisplayName("an unknown section, a non-id, a missing id and another organisation's section are all 422 on sectionId")
    void unknownSectionIsValidation() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();
        UUID other = testMemberships.organisation(false, true, "members");

        for (String sectionId : new String[] {
                UUID.randomUUID().toString(), "not-a-uuid", null,
                testMemberships.sectionOf(other).toString()}) {
            change(me, esn, sectionId)
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("validation"))
                    .andExpect(jsonPath("$.field").value("sectionId"));
        }

        assertThat(changes(me)).isEmpty();
        assertThat(membershipSection(me, esn)).isEqualTo(first().getId());
    }

    @Test
    @DisplayName("an organisation without sections is 422 on sectionId")
    void organisationWithoutSectionsIsValidation() throws Exception {
        AppUser me = account(first());
        UUID bar = testMemberships.organisation(false, false, "members");
        testMemberships.add(bar, me.getId(), "approved", "member", null, null);

        change(me, bar, first().getId().toString())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("sectionId"));
        assertThat(changes(me)).isEmpty();
    }

    @Test
    @DisplayName("no approved membership in that organisation is 404: none, pending, rejected, or not an id")
    void withoutAnApprovedMembershipIs404() throws Exception {
        AppUser me = account(first());
        UUID none = testMemberships.organisation(false, true, "members");
        UUID pending = testMemberships.organisation(true, true, "members");
        testMemberships.add(pending, me.getId(), "pending", "member", testMemberships.sectionOf(pending), null);
        UUID rejected = testMemberships.organisation(true, true, "members");
        testMemberships.add(rejected, me.getId(), "rejected", "member", testMemberships.sectionOf(rejected), null);
        UUID otherOfPending = testMemberships.section(pending);

        change(me, none, testMemberships.sectionOf(none).toString())
                .andExpect(status().isNotFound());
        change(me, pending, otherOfPending.toString())
                .andExpect(status().isNotFound());
        change(me, rejected, testMemberships.section(rejected).toString())
                .andExpect(status().isNotFound());
        change(me, UUID.randomUUID(), first().getId().toString())
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/me/memberships/not-a-uuid/section")
                        .header(HttpHeaders.AUTHORIZATION, bearer(me))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + first().getId() + "\"}"))
                .andExpect(status().isNotFound());

        assertThat(changes(me)).isEmpty();
    }

    @Test
    @DisplayName("picking the section I am already in is a no-op: no audit row, no cooldown spent")
    void sameSectionIsANoOp() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();

        JsonNode membership = membershipIn(json(change(me, esn, first().getId().toString())
                .andExpect(status().isOk())), esn);
        assertThat(membership.get("section").get("id").asText()).isEqualTo(first().getId().toString());

        assertThat(changes(me)).isEmpty();
        assertThat(membershipIn(me(me), esn).get("sectionChangeAvailableAt").isNull()).isTrue();
    }

    @Test
    @DisplayName("the 30-day boundary is inclusive: 429 one second before, 200 on it")
    void cooldownBoundary() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();
        Section second = second();
        Section third = third();

        change(me, esn, second.getId().toString()).andExpect(status().isOk());

        Instant boundary = base.plus(30, ChronoUnit.DAYS);

        clock.freezeAt(boundary.minusSeconds(1));
        change(me, esn, third.getId().toString())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("section_change_limited"));
        // Refused means nothing happened: still in the section they moved to.
        assertThat(membershipSection(me, esn)).isEqualTo(second.getId());

        clock.freezeAt(boundary);
        JsonNode membership = membershipIn(json(change(me, esn, third.getId().toString())
                .andExpect(status().isOk())), esn);
        assertThat(membership.get("section").get("id").asText()).isEqualTo(third.getId().toString());
        assertThat(changes(me)).hasSize(2);
    }

    @Test
    @DisplayName("[24] the limit is per organisation: a change in A does not block a change in B")
    void limitIsPerOrganisation() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();
        UUID other = testMemberships.organisation(false, true, "members");
        UUID otherFirst = testMemberships.sectionOf(other);
        UUID otherSecond = testMemberships.section(other);
        testMemberships.add(other, me.getId(), "approved", "member", otherFirst, null);

        change(me, esn, second().getId().toString()).andExpect(status().isOk());

        // The same instant, another organisation: allowed.
        JsonNode membership = membershipIn(json(change(me, other, otherSecond.toString())
                .andExpect(status().isOk())), other);
        assertThat(membership.get("section").get("id").asText()).isEqualTo(otherSecond.toString());
        assertThat(membershipSection(me, other)).isEqualTo(otherSecond);
        assertThat(jdbc.queryForObject(
                "select organisation_id from section_change where user_id = ? and to_section_id = ?",
                UUID.class, me.getId(), otherSecond)).isEqualTo(other);

        // Each organisation still has its own cooldown running.
        change(me, esn, third().getId().toString())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("section_change_limited"));
        change(me, other, otherFirst.toString())
                .andExpect(status().isTooManyRequests());
        // And the ESN membership was not touched by the move in the other one.
        assertThat(membershipSection(me, esn)).isEqualTo(second().getId());
    }

    @Test
    @DisplayName("a same-section tap inside the cooldown is still a 200, not a 429")
    void noOpIsNotRateLimited() throws Exception {
        AppUser me = account(first());
        UUID esn = testMemberships.esnTurkiye();
        Section second = second();

        change(me, esn, second.getId().toString()).andExpect(status().isOk());
        change(me, esn, second.getId().toString()).andExpect(status().isOk());

        assertThat(changes(me)).hasSize(1);
    }

    @Test
    @DisplayName("an incomplete account is refused before the rule is even reached")
    void incompleteIsRefused() throws Exception {
        AppUser incomplete = account(first());
        incomplete.setStatus(AccountStatus.INCOMPLETE);
        users.saveAndFlush(incomplete);

        change(incomplete, testMemberships.esnTurkiye(), second().getId().toString())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));
    }

    @Test
    @DisplayName("the old route PUT /me/section is gone")
    void oldRouteIsGone() throws Exception {
        AppUser me = account(first());

        int code = mockMvc.perform(put("/me/section")
                        .header(HttpHeaders.AUTHORIZATION, bearer(me))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + second().getId() + "\"}"))
                .andReturn().getResponse().getStatus();
        assertThat(code).isIn(404, 405);
        assertThat(changes(me)).isEmpty();
        assertThat(membershipSection(me, testMemberships.esnTurkiye())).isEqualTo(first().getId());
    }

    /* -------------------------------------------------------------- helpers */

    private ResultActions change(AppUser me, UUID organisationId, String sectionId) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("sectionId", sectionId);
        return mockMvc.perform(put("/me/memberships/" + organisationId + "/section")
                .header(HttpHeaders.AUTHORIZATION, bearer(me))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode me(AppUser me) throws Exception {
        return json(mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk()));
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private static JsonNode membershipIn(JsonNode me, UUID organisationId) {
        for (JsonNode membership : me.get("memberships")) {
            if (membership.get("organisation").get("id").asText().equals(organisationId.toString())) {
                return membership;
            }
        }
        throw new AssertionError("no membership in " + organisationId);
    }

    private UUID membershipSection(AppUser me, UUID organisationId) {
        return jdbc.queryForObject(
                "select section_id from organisation_member where user_id = ? and organisation_id = ?",
                UUID.class, me.getId(), organisationId);
    }

    private List<Map<String, Object>> changes(AppUser me) {
        return jdbc.queryForList(
                "select * from section_change where user_id = ? order by changed_at asc", me.getId());
    }

    private Section first() {
        return ordered().get(0);
    }

    private Section second() {
        return ordered().get(1);
    }

    private Section third() {
        return ordered().get(2);
    }

    /** ESN Türkiye's sections only: the other organisations here are this class's own. */
    private List<Section> ordered() {
        UUID esn = testMemberships.esnTurkiye();
        return sections.findAll().stream()
                .filter(section -> section.getOrganisationId().equals(esn))
                .sorted(Comparator.comparing(Section::getName))
                .toList();
    }

    /** An active, confirmed account, approved in ESN Türkiye in {@code section}. */
    private AppUser account(Section section) {
        AppUser user = AppUser.register(
                "section-change-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash",
                null, Instant.now());
        user.setStatus(AccountStatus.ACTIVE);
        // [D18] Confirmed, so the access filter judges the status alone.
        user.confirmEmail(Instant.now());
        user.setName("Deniz");
        AppUser saved = users.saveAndFlush(user);
        testMemberships.approvedInEsn(saved.getId(), section.getId());
        created.add(saved.getId());
        return saved;
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }
}
