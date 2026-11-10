package app.brand.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.push.PushOutbox;
import app.brand.push.PushOutboxRepository;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * [D13]/[D14]/[D17]/[D19] The admin page's organisation routes:
 * TENANT_PLAN.md section 9, acceptance tests 8 to 12, plus the P7 rule that the
 * member list never carries an email or a phone.
 *
 * <p>Every organisation here is created by this class with a unique name, and
 * every event it creates is removed again, because {@code SchemaMigrationTest}
 * asserts that the shared database holds no events.
 */
class OrganisationAdminIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private AuditLogRepository auditLog;

    @Autowired
    private AdminBootstrap bootstrap;

    @Autowired
    private PushOutboxRepository outbox;

    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> fixtureEvents = new ArrayList<>();
    private final List<UUID> fixtureOrganisations = new ArrayList<>();

    /**
     * Events go ({@code SchemaMigrationTest} counts them), and so do this class's
     * memberships and sections ({@code SchemaMigrationTest} counts the sections
     * too). The organisations themselves stay; nothing counts them.
     */
    @AfterEach
    void removeFixtures() {
        for (UUID eventId : fixtureEvents) {
            jdbc.update("delete from event_member where event_id = ?", eventId);
            jdbc.update("delete from event where id = ?", eventId);
        }
        for (UUID orgId : fixtureOrganisations) {
            jdbc.update("delete from organisation_member where organisation_id = ?", orgId);
            jdbc.update("delete from section where organisation_id = ?", orgId);
        }
        fixtureEvents.clear();
        fixtureOrganisations.clear();
    }

    /* ------------------------------------------------------------ test 8 */

    @Test
    @DisplayName("test 8: a super_admin creates an organisation, changes its switches, assigns and removes an admin; each is audited")
    void superAdminManagesOrganisations() throws Exception {
        Account admin = superAdmin();
        Account person = account();

        String name = uniqueName();
        JsonNode created = json(mockMvc.perform(post("/admin/api/organisations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("name", "  " + name + "  ", "approvalRequired", true,
                                "hasSections", false, "eventCreation", "admins"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.approvalRequired").value(true))
                .andExpect(jsonPath("$.hasSections").value(false))
                .andExpect(jsonPath("$.eventCreation").value("admins"))
                .andReturn());
        UUID orgId = UUID.fromString(created.get("id").asText());
        fixtureOrganisations.add(orgId);
        assertOrganisationAudited(orgId, "create_organisation", admin.id);

        mockMvc.perform(get("/admin/api/organisations").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).contains(orgId.toString()));

        mockMvc.perform(patch("/admin/api/organisations/" + orgId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("approvalRequired", false, "eventCreation", "members"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.approvalRequired").value(false))
                .andExpect(jsonPath("$.eventCreation").value("members"));
        assertOrganisationAudited(orgId, "update_organisation", admin.id);

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/admins")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", person.email))))
                .andExpect(status().isNoContent());
        assertThat(membership(orgId, person.id)).containsEntry("status", "approved").containsEntry("role", "admin");
        assertMemberAudited(person.id, orgId, "assign_organisation_admin", admin.id);

        mockMvc.perform(delete("/admin/api/organisations/" + orgId + "/admins/" + person.id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNoContent());
        assertThat(membership(orgId, person.id)).containsEntry("status", "approved").containsEntry("role", "member");
        assertMemberAudited(person.id, orgId, "remove_organisation_admin", admin.id);
    }

    @Test
    @DisplayName("test 8: a member and an organisation admin get 403 on every super_admin organisation route")
    void onlySuperAdminManagesOrganisations() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");
        Account orgAdmin = account();
        assign(admin, orgId, orgAdmin, null);
        Account member = account();

        for (Account caller : List.of(member, orgAdmin)) {
            for (MockHttpServletRequestBuilder request : List.of(
                    get("/admin/api/organisations"),
                    post("/admin/api/organisations").contentType(MediaType.APPLICATION_JSON)
                            .content(body(Map.of("name", uniqueName(), "approvalRequired", true,
                                    "hasSections", false, "eventCreation", "members"))),
                    patch("/admin/api/organisations/" + orgId).contentType(MediaType.APPLICATION_JSON)
                            .content(body(Map.of("approvalRequired", false))),
                    post("/admin/api/organisations/" + orgId + "/admins").contentType(MediaType.APPLICATION_JSON)
                            .content(body(Map.of("email", member.email))),
                    delete("/admin/api/organisations/" + orgId + "/admins/" + orgAdmin.id))) {
                mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("forbidden"));
            }
        }
        // Nothing changed: still an admin, still requiring approval.
        assertThat(membership(orgId, orgAdmin.id)).containsEntry("role", "admin");
        assertThat(jdbc.queryForObject("select approval_required from organisation where id = ?",
                Boolean.class, orgId)).isTrue();
    }

    @Test
    @DisplayName("create and patch validate every field; P10: a patch carrying hasSections is refused")
    void createAndPatchValidate() throws Exception {
        Account admin = superAdmin();

        invalidCreate(admin, Map.of("name", "a", "approvalRequired", true, "hasSections", true,
                "eventCreation", "members"), "name");
        invalidCreate(admin, Map.of("name", "x".repeat(41), "approvalRequired", true, "hasSections", true,
                "eventCreation", "members"), "name");
        invalidCreate(admin, Map.of("name", "Bar", "hasSections", true, "eventCreation", "members"),
                "approvalRequired");
        invalidCreate(admin, Map.of("name", "Bar", "approvalRequired", true, "eventCreation", "members"),
                "hasSections");
        invalidCreate(admin, Map.of("name", "Bar", "approvalRequired", true, "hasSections", true,
                "eventCreation", "everyone"), "eventCreation");

        UUID orgId = organisation(admin, true, true, "members");
        // Written by hand: the mapper's non_null inclusion would drop the null one.
        for (String value : List.of("true", "false", "null")) {
            mockMvc.perform(patch("/admin/api/organisations/" + orgId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"approvalRequired\": false, \"hasSections\": " + value + "}"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("validation"))
                    .andExpect(jsonPath("$.field").value("hasSections"));
        }
        assertThat(jdbc.queryForMap("select has_sections, approval_required from organisation where id = ?", orgId))
                .containsEntry("has_sections", true)
                .containsEntry("approval_required", true);

        mockMvc.perform(patch("/admin/api/organisations/" + orgId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("name", " x "))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("name"));

        mockMvc.perform(patch("/admin/api/organisations/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("approvalRequired", false))))
                .andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------ test 9 */

    @Test
    @DisplayName("test 9: assigning by an email with no active, confirmed account is refused")
    void assignRequiresActiveConfirmedAccount() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");

        invalidAssign(admin, orgId, Map.of("email", "nobody-" + UUID.randomUUID() + "@example.com"), "email");

        Account incomplete = account();
        setStatus(incomplete.id, AccountStatus.INCOMPLETE);
        invalidAssign(admin, orgId, Map.of("email", incomplete.email), "email");

        Account banned = account();
        setStatus(banned.id, AccountStatus.BANNED);
        invalidAssign(admin, orgId, Map.of("email", banned.email), "email");

        Account unconfirmed = account();
        jdbc.update("update app_user set email_confirmed_at = null where id = ?", unconfirmed.id);
        invalidAssign(admin, orgId, Map.of("email", unconfirmed.email), "email");

        assertThat(jdbc.queryForObject("select count(*) from organisation_member where organisation_id = ?",
                Integer.class, orgId)).isZero();
    }

    @Test
    @DisplayName("test 9: assigning an existing member upgrades the same membership row")
    void assignUpgradesTheSameRow() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, true, "members");
        UUID section = sectionOf(orgId);
        Account person = account();
        Instant submitted = Instant.parse("2026-11-01T10:00:00Z");
        UUID eventId = event(orgId, admin.id);
        insertMembership(orgId, person.id, "pending", section, eventId, submitted);
        Timestamp createdBefore = jdbc.queryForObject(
                "select created_at from organisation_member where organisation_id = ? and user_id = ?",
                Timestamp.class, orgId, person.id);

        assign(admin, orgId, person, null);

        assertThat(jdbc.queryForObject("select count(*) from organisation_member where organisation_id = ? and user_id = ?",
                Integer.class, orgId, person.id)).isEqualTo(1);
        Map<String, Object> row = membership(orgId, person.id);
        assertThat(row).containsEntry("status", "approved").containsEntry("role", "admin")
                .containsEntry("section_id", section)
                .containsEntry("created_at", createdBefore);
        // Making a pending person an admin is also their approval: it records who
        // and when, and [D17] joins the event the request came from.
        assertThat(row).containsEntry("approved_by", admin.id).containsEntry("pending_event_id", null);
        assertThat(row.get("approved_at")).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from event_member where event_id = ? and user_id = ?",
                Integer.class, eventId, person.id)).isEqualTo(1);
    }

    @Test
    @DisplayName("a new admin membership needs a section of that organisation iff it has sections")
    void assignNewAdminSectionRule() throws Exception {
        Account admin = superAdmin();
        UUID withSections = organisation(admin, true, true, "members");
        UUID withoutSections = organisation(admin, true, false, "members");
        UUID esn = jdbc.queryForObject("select id from organisation where name = 'ESN Türkiye'", UUID.class);
        UUID foreignSection = sectionOf(esn);
        UUID ownSection = sectionOf(withSections);
        Account person = account();

        invalidAssign(admin, withSections, Map.of("email", person.email), "sectionId");
        invalidAssign(admin, withSections, Map.of("email", person.email, "sectionId", foreignSection.toString()),
                "sectionId");
        invalidAssign(admin, withSections, Map.of("email", person.email, "sectionId", "not-a-uuid"), "sectionId");
        invalidAssign(admin, withoutSections, Map.of("email", person.email, "sectionId", foreignSection.toString()),
                "sectionId");

        assign(admin, withSections, person, ownSection);
        Map<String, Object> row = membership(withSections, person.id);
        assertThat(row).containsEntry("status", "approved").containsEntry("role", "admin")
                .containsEntry("section_id", ownSection)
                .containsEntry("approved_by", admin.id);
        assertThat(row.get("approved_at")).isNotNull();

        assign(admin, withoutSections, person, null);
        assertThat(membership(withoutSections, person.id)).containsEntry("role", "admin")
                .containsEntry("section_id", null);
    }

    /* ----------------------------------------------------------- test 10 */

    @Test
    @DisplayName("test 10: an organisation admin lists, approves and rejects their own pending members; no email, no phone")
    void organisationAdminDecidesOwnMembers() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, true, "members");
        UUID section = sectionOf(orgId);
        Account orgAdmin = account();
        assign(admin, orgId, orgAdmin, section);

        Account first = account();
        Account second = account();
        insertMembership(orgId, first.id, "pending", section, null, Instant.parse("2026-11-01T10:00:00Z"));
        insertMembership(orgId, second.id, "pending", section, null, Instant.parse("2026-11-02T10:00:00Z"));

        MvcResult listed = mockMvc.perform(get("/admin/api/organisations/" + orgId + "/members")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rows = json(listed);
        assertThat(rows).hasSize(2);
        // Oldest submission first.
        assertThat(rows.get(0).get("userId").asText()).isEqualTo(first.id.toString());
        assertThat(rows.get(1).get("userId").asText()).isEqualTo(second.id.toString());
        JsonNode row = rows.get(0);
        assertThat(fieldNames(row)).containsExactlyInAnyOrder(
                "userId", "name", "bio", "section", "status", "submittedAt");
        assertThat(row.get("status").asText()).isEqualTo("pending");
        assertThat(row.get("name").asText()).isEqualTo("Person " + first.id.toString().substring(0, 4));
        assertThat(row.get("section").get("id").asText()).isEqualTo(section.toString());
        assertThat(row.get("submittedAt").asText()).startsWith("2026-11-01");
        // P7: never email, never phone — not even as a key.
        assertThat(row.has("email")).isFalse();
        assertThat(row.has("phone")).isFalse();
        assertThat(listed.getResponse().getContentAsString())
                .doesNotContain(first.email).doesNotContain("+90 555");

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + first.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist());
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + second.id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"));
        assertThat(membership(orgId, second.id)).containsEntry("status", "rejected");
        assertMemberAudited(second.id, orgId, "reject_member", orgAdmin.id);

        // Only from pending, either way.
        for (String action : List.of("approve", "reject")) {
            mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + first.id + "/" + action)
                            .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                    .andExpect(status().isConflict());
        }

        // The queue is empty now; the other statuses are listed on request.
        assertThat(json(mockMvc.perform(get("/admin/api/organisations/" + orgId + "/members?status=pending")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk()).andReturn())).isEmpty();
        assertThat(json(mockMvc.perform(get("/admin/api/organisations/" + orgId + "/members?status=rejected")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk()).andReturn()).findValuesAsText("userId"))
                .containsExactly(second.id.toString());
        mockMvc.perform(get("/admin/api/organisations/" + orgId + "/members?status=banned")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("status"));
    }

    @Test
    @DisplayName("test 10: another organisation's admin, a plain member and a pending admin get 404 on the member routes")
    void otherOrganisationIsNotFound() throws Exception {
        Account admin = superAdmin();
        UUID mine = organisation(admin, true, false, "members");
        UUID theirs = organisation(admin, true, false, "members");
        Account orgAdmin = account();
        assign(admin, mine, orgAdmin, null);
        Account candidate = account();
        insertMembership(theirs, candidate.id, "pending", null, null, Instant.now());

        Account plainMember = account();
        insertMembership(theirs, plainMember.id, "approved", null, null, Instant.now());
        Account demotedAdmin = account();
        insertMembership(theirs, demotedAdmin.id, "pending", null, null, Instant.now());
        jdbc.update("update organisation_member set role = 'admin' where organisation_id = ? and user_id = ?",
                theirs, demotedAdmin.id);

        for (Account caller : List.of(orgAdmin, plainMember, demotedAdmin)) {
            for (MockHttpServletRequestBuilder request : List.of(
                    get("/admin/api/organisations/" + theirs + "/members"),
                    post("/admin/api/organisations/" + theirs + "/members/" + candidate.id + "/approve"),
                    post("/admin/api/organisations/" + theirs + "/members/" + candidate.id + "/reject"),
                    get("/admin/api/organisations/" + UUID.randomUUID() + "/members"))) {
                mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                        .andExpect(status().isNotFound())
                        .andExpect(jsonPath("$.code").value("not_found"));
            }
        }
        assertThat(membership(theirs, candidate.id)).containsEntry("status", "pending");

        // The super admin reaches every organisation's queue.
        mockMvc.perform(get("/admin/api/organisations/" + theirs + "/members")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());
    }

    /* ----------------------------------------------------------- test 11 */

    @Test
    @DisplayName("test 11: an organisation admin gets 403 on reports, identity views, ban, promote and screening terms")
    void organisationAdminIsNotPlatformAdmin() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");
        Account orgAdmin = account();
        assign(admin, orgId, orgAdmin, null);
        Account other = account();
        UUID someReport = UUID.randomUUID();

        for (MockHttpServletRequestBuilder request : List.of(
                get("/admin/api/users"),
                get("/admin/api/users/" + other.id),
                post("/admin/api/users/" + other.id + "/ban"),
                post("/admin/api/users/" + other.id + "/promote"),
                get("/admin/api/reports"),
                // The report detail is the audited identity view.
                get("/admin/api/reports/" + someReport),
                get("/admin/api/flagged"),
                post("/admin/api/reports/" + someReport + "/dismiss"),
                post("/admin/api/reports/" + someReport + "/ban"),
                get("/admin/api/screening-terms"))) {
            mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("forbidden"));
        }
        assertThat(users.findById(other.id).orElseThrow().getStatus()).isEqualTo(AccountStatus.ACTIVE);
    }

    /* ----------------------------------------------------------- test 12 */

    @Test
    @DisplayName("test 12: approving writes approved_at / approved_by and an audit row, and enqueues the approval push")
    void approvalIsRecordedAndPushed() throws Exception {
        Account admin = superAdmin();
        String name = uniqueName();
        UUID orgId = organisation(admin, name, true, false, "members");
        Account orgAdmin = account();
        assign(admin, orgId, orgAdmin, null);
        Account person = account();
        registerDevice(person, "en");
        insertMembership(orgId, person.id, "pending", null, null, Instant.now());

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk());

        Map<String, Object> row = membership(orgId, person.id);
        assertThat(row).containsEntry("status", "approved").containsEntry("approved_by", orgAdmin.id);
        assertThat(row.get("approved_at")).isNotNull();
        assertMemberAudited(person.id, orgId, "approve_member", orgAdmin.id);

        List<PushOutbox> pushes = outbox.findByUserIdOrderByCreatedAtAsc(person.id);
        assertThat(pushes).extracting(PushOutbox::getKind).containsExactly("account_approved");
        JsonNode payload = objectMapper.readTree(pushes.get(0).getPayload());
        assertThat(payload.get("body").asText())
                .isEqualTo(name + " accepted you as a member. Open the app to get started.");

        // Rejection sends nothing, as the removed account rejection did not.
        Account refused = account();
        registerDevice(refused, "en");
        insertMembership(orgId, refused.id, "pending", null, null, Instant.now());
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + refused.id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
                .andExpect(status().isOk());
        assertThat(outbox.findByUserIdOrderByCreatedAtAsc(refused.id)).isEmpty();
    }

    @Test
    @DisplayName("the approval push is in Turkish for a Turkish phone")
    void approvalPushIsTranslated() throws Exception {
        Account admin = superAdmin();
        String name = uniqueName();
        UUID orgId = organisation(admin, name, true, false, "members");
        Account person = account();
        registerDevice(person, "tr");
        insertMembership(orgId, person.id, "pending", null, null, Instant.now());

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        JsonNode payload = objectMapper.readTree(outbox.findByUserIdOrderByCreatedAtAsc(person.id).get(0).getPayload());
        assertThat(payload.get("body").asText())
                .isEqualTo(name + " seni üye olarak kabul etti. Uygulamayı aç ve başla.");
    }

    /* ---------------------------------------------------------- [D17] event */

    @Test
    @DisplayName("[D17] approval joins the stored event and clears it")
    void approvalJoinsThePendingEvent() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");
        Account person = account();
        UUID eventId = event(orgId, admin.id);
        insertMembership(orgId, person.id, "pending", null, eventId, Instant.now());

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select is_moderator from event_member where event_id = ? and user_id = ?",
                Boolean.class, eventId, person.id)).isFalse();
        assertThat(membership(orgId, person.id)).containsEntry("pending_event_id", null);
    }

    @Test
    @DisplayName("rejection clears the stored event and joins nothing")
    void rejectionClearsThePendingEvent() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");
        Account person = account();
        UUID eventId = event(orgId, admin.id);
        insertMembership(orgId, person.id, "pending", null, eventId, Instant.now());

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        assertThat(membership(orgId, person.id)).containsEntry("status", "rejected")
                .containsEntry("pending_event_id", null);
        assertThat(jdbc.queryForObject("select count(*) from event_member where user_id = ?",
                Integer.class, person.id)).isZero();
    }

    @Test
    @DisplayName("[D17] approval whose event row is gone still succeeds")
    void approvalSurvivesAMissingEvent() throws Exception {
        Account admin = superAdmin();
        UUID orgId = organisation(admin, true, false, "members");
        Account person = account();
        UUID eventId = event(orgId, admin.id);
        insertMembership(orgId, person.id, "pending", null, eventId, Instant.now());
        jdbc.update("delete from event where id = ?", eventId);

        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/members/" + person.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
        assertThat(membership(orgId, person.id)).containsEntry("status", "approved")
                .containsEntry("pending_event_id", null);
        assertThat(jdbc.queryForObject("select count(*) from event_member where user_id = ?",
                Integer.class, person.id)).isZero();
    }

    /* ------------------------------------------------------------ helpers */

    private record Account(UUID id, String email, String accessToken) {
    }

    private static String bearer(Account account) {
        return "Bearer " + account.accessToken;
    }

    /** A registered, confirmed, active account with a name and a phone. */
    private Account account() throws Exception {
        String email = "org-test-" + UUID.randomUUID() + "@example.com";
        JsonNode registered = json(mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", email, "password", "correct horse",
                                "phone", "+90 555 000 0000"))))
                .andExpect(status().isCreated())
                .andReturn());
        UUID id = UUID.fromString(registered.get("me").get("id").asText());
        jdbc.update("update app_user set email_confirmed_at = now(), status = 'active', name = ?, bio = 'bio'"
                + " where id = ?", "Person " + id.toString().substring(0, 4), id);
        return new Account(id, email, registered.get("tokens").get("accessToken").asText());
    }

    private Account superAdmin() throws Exception {
        Account account = account();
        bootstrap.promote(account.email);
        return account;
    }

    private void setStatus(UUID id, AccountStatus status) {
        AppUser user = users.findById(id).orElseThrow();
        user.setStatus(status);
        users.save(user);
    }

    private static String uniqueName() {
        return "Org " + UUID.randomUUID().toString().substring(0, 8);
    }

    private UUID organisation(Account admin, boolean approval, boolean sections, String eventCreation)
            throws Exception {
        return organisation(admin, uniqueName(), approval, sections, eventCreation);
    }

    /** Through the API; an organisation with sections gets one section of its own by SQL. */
    private UUID organisation(Account admin, String name, boolean approval, boolean sections, String eventCreation)
            throws Exception {
        JsonNode created = json(mockMvc.perform(post("/admin/api/organisations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("name", name, "approvalRequired", approval,
                                "hasSections", sections, "eventCreation", eventCreation))))
                .andExpect(status().isOk())
                .andReturn());
        UUID id = UUID.fromString(created.get("id").asText());
        fixtureOrganisations.add(id);
        if (sections) {
            jdbc.update("insert into section (name, country_code, organisation_id) values (?, 'TR', ?)",
                    "Section of " + name, id);
        }
        return id;
    }

    private UUID sectionOf(UUID orgId) {
        return jdbc.queryForObject("select id from section where organisation_id = ? order by name limit 1",
                UUID.class, orgId);
    }

    private void assign(Account admin, UUID orgId, Account person, UUID sectionId) throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("email", person.email);
        if (sectionId != null) {
            request.put("sectionId", sectionId.toString());
        }
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/admins")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isNoContent());
    }

    private void insertMembership(UUID orgId, UUID userId, String status, UUID sectionId, UUID pendingEventId,
                                  Instant submittedAt) {
        jdbc.update("""
                insert into organisation_member (organisation_id, user_id, status, role, section_id,
                                                 pending_event_id, submitted_at)
                values (?, ?, ?, 'member', ?, ?, ?)
                """, orgId, userId, status, sectionId, pendingEventId, Timestamp.from(submittedAt));
    }

    private Map<String, Object> membership(UUID orgId, UUID userId) {
        return jdbc.queryForMap("select * from organisation_member where organisation_id = ? and user_id = ?",
                orgId, userId);
    }

    private UUID event(UUID orgId, UUID creatorId) {
        UUID id = UUID.randomUUID();
        Instant starts = Instant.now().plus(1, ChronoUnit.DAYS);
        String code = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        jdbc.update("""
                insert into event (id, organisation_id, name, starts_at, ends_at, cover, board_mode, join_code, creator_id)
                values (?, ?, 'Welcome night', ?, ?, 'azure', 'approve_first', ?, ?)
                """, id, orgId, Timestamp.from(starts), Timestamp.from(starts.plus(4, ChronoUnit.HOURS)),
                code, creatorId);
        fixtureEvents.add(id);
        return id;
    }

    private void registerDevice(Account account, String locale) throws Exception {
        mockMvc.perform(put("/me/devices")
                        .header(HttpHeaders.AUTHORIZATION, bearer(account))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("token", "ExponentPushToken[" + account.id + "]",
                                "platform", "ios", "locale", locale))))
                .andExpect(status().isNoContent());
    }

    private void invalidCreate(Account admin, Map<String, Object> request, String field) throws Exception {
        mockMvc.perform(post("/admin/api/organisations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private void invalidAssign(Account admin, UUID orgId, Map<String, Object> request, String field)
            throws Exception {
        mockMvc.perform(post("/admin/api/organisations/" + orgId + "/admins")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(request)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private void assertOrganisationAudited(UUID orgId, String action, UUID actor) {
        var rows = auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(orgId, action);
        assertThat(rows).as("audit row for %s", action).isNotEmpty();
        assertThat(rows.get(0).getActorId()).isEqualTo(actor);
        assertThat(rows.get(0).getSubjectKind()).isEqualTo("organisation");
    }

    private void assertMemberAudited(UUID subject, UUID orgId, String action, UUID actor) {
        var rows = auditLog.findBySubjectUserIdAndActionOrderByCreatedAtDesc(subject, action);
        assertThat(rows).as("audit row for %s", action).isNotEmpty();
        assertThat(rows.get(0).getActorId()).isEqualTo(actor);
        assertThat(rows.get(0).getSubjectKind()).isEqualTo("organisation");
        assertThat(rows.get(0).getSubjectId()).isEqualTo(orgId);
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        Iterator<String> it = node.fieldNames();
        it.forEachRemaining(names::add);
        return names;
    }

    private String body(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
