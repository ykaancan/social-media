package app.brand.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.Role;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Brief §4.9 — the admin queue, and the rule that only a {@code super_admin}
 * reaches it. Every decision is checked for its audit row as well as its effect:
 * an unaudited ban is a bug, not a detail.
 */
class AdminApiIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private AuditLogRepository auditLog;

    @Autowired
    private AdminBootstrap bootstrap;

    /* ------------------------------------------------------------- access */

    @Test
    @DisplayName("no token is 401")
    void withoutTokenIsUnauthorized() throws Exception {
        mockMvc.perform(get("/admin/api/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    @DisplayName("an approved member is 403 forbidden, not 404")
    void memberIsForbidden() throws Exception {
        Account member = account(AccountStatus.APPROVED);

        mockMvc.perform(get("/admin/api/users").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
    }

    /* --------------------------------------------------------------- list */

    @Test
    @DisplayName("the list defaults to pending, oldest submission first, with the identity fields")
    void listsPendingOldestFirst() throws Exception {
        Account admin = admin();
        Section section = sections.findAll().get(0);

        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        Account older = pending(section, base, "Older Person", "first bio");
        Account newer = pending(section, base.plusSeconds(3600), "Newer Person", "second bio");

        MvcResult result = mockMvc.perform(get("/admin/api/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();

        List<String> ids = idsOf(result);
        assertThat(ids).contains(older.id.toString(), newer.id.toString());
        assertThat(ids.indexOf(older.id.toString())).isLessThan(ids.indexOf(newer.id.toString()));

        JsonNode row = rowFor(result, older.id);
        assertThat(row.get("email").asText()).isEqualTo(older.email);
        assertThat(row.get("phone").asText()).isEqualTo("+90 555 000 0000");
        assertThat(row.get("name").asText()).isEqualTo("Older Person");
        assertThat(row.get("bio").asText()).isEqualTo("first bio");
        assertThat(row.get("status").asText()).isEqualTo("pending");
        assertThat(row.get("role").asText()).isEqualTo("member");
        assertThat(row.get("submittedAt").asText()).startsWith("2026-01-01");
        // [D11] country rides on the section and is never a field of its own.
        assertThat(row.get("section").get("name").asText()).isEqualTo(section.getName());
        assertThat(row.get("section").get("country").asText()).isEqualTo(section.getCountry().getName());
        assertThat(row.has("country")).isFalse();
        // Optional fields are absent, never null, as everywhere else in the API.
        assertThat(row.has("avatarUrl")).isFalse();
        assertThat(row.has("approvedAt")).isFalse();
        // Nothing internal ever leaves the server.
        assertThat(row.has("passwordHash")).isFalse();
        assertThat(row.has("approvedBy")).isFalse();
    }

    @Test
    @DisplayName("status=all lists every account and an unknown status is 422")
    void listFilters() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.APPROVED);

        MvcResult all = mockMvc.perform(get("/admin/api/users?status=all")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(idsOf(all)).contains(member.id.toString(), admin.id.toString());

        MvcResult approved = mockMvc.perform(get("/admin/api/users?status=approved")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(idsOf(approved)).contains(member.id.toString());

        mockMvc.perform(get("/admin/api/users?status=nonsense")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("status"));
    }

    @Test
    @DisplayName("one account by id, and 404 for an id that is not an account")
    void readsOneAccount() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.APPROVED);

        mockMvc.perform(get("/admin/api/users/" + member.id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(member.id.toString()))
                .andExpect(jsonPath("$.email").value(member.email));

        mockMvc.perform(get("/admin/api/users/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    /* ------------------------------------------------------------ approve */

    @Test
    @DisplayName("approve stamps approved_at/approved_by and writes an audit row")
    void approvesPendingAccount() throws Exception {
        Account admin = admin();
        Account waiting = pending(sections.findAll().get(0), Instant.parse("2026-02-01T00:00:00Z"),
                "Waiting Person", "hello");

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.approvedAt").isNotEmpty());

        AppUser stored = users.findById(waiting.id).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.APPROVED);
        assertThat(stored.getApprovedBy()).isEqualTo(admin.id);
        assertAudited(waiting.id, "approve_user", admin.id);

        // Approving twice is a conflict, not a second audit row.
        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));
        assertThat(auditLog.findBySubjectUserIdAndActionOrderByCreatedAtDesc(waiting.id, "approve_user"))
                .hasSize(1);
    }

    /* ------------------------------------------------------------- reject */

    @Test
    @DisplayName("reject moves a pending account to rejected and is audited")
    void rejectsPendingAccount() throws Exception {
        Account admin = admin();
        Account waiting = pending(sections.findAll().get(0), Instant.parse("2026-02-02T00:00:00Z"),
                "Rejected Person", null);

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"));

        assertThat(users.findById(waiting.id).orElseThrow().getStatus())
                .isEqualTo(AccountStatus.REJECTED);
        assertAudited(waiting.id, "reject_user", admin.id);
    }

    @Test
    @DisplayName("rejecting an account that is not pending is 409")
    void rejectNeedsPending() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.APPROVED);

        mockMvc.perform(post("/admin/api/users/" + member.id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));
    }

    /* ---------------------------------------------------------------- ban */

    @Test
    @DisplayName("ban revokes every refresh token; the account can neither refresh nor be banned twice")
    void banEndsTheSession() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.APPROVED);

        mockMvc.perform(post("/admin/api/users/" + member.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("banned"));

        AppUser stored = users.findById(member.id).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.BANNED);
        assertThat(stored.getBannedAt()).isNotNull();
        assertAudited(member.id, "ban_user", admin.id);

        // [B3] the refresh token is dead, so the 15-minute access token cannot be renewed.
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("refreshToken", member.refreshToken))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/admin/api/users/" + member.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));
    }

    @Test
    @DisplayName("a banned account still reads its own status, so the app can say why")
    void bannedAccountStillReadsMe() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.APPROVED);

        mockMvc.perform(post("/admin/api/users/" + member.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("banned"));
    }

    /* ------------------------------------------------------------ promote */

    @Test
    @DisplayName("promote makes an approved member a super_admin; a pending one is 409")
    void promotesApprovedMember() throws Exception {
        Account admin = admin();
        Account waiting = pending(sections.findAll().get(0), Instant.parse("2026-03-01T00:00:00Z"),
                "Future Admin", null);

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/promote")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/promote")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("super_admin"));

        assertThat(users.findById(waiting.id).orElseThrow().getRole()).isEqualTo(Role.SUPER_ADMIN);
        assertAudited(waiting.id, "promote_admin", admin.id);

        // The role is data: the newly promoted account reaches the queue at once.
        mockMvc.perform(get("/admin/api/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer(waiting)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/promote")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict());
    }

    /* ----------------------------------------------------------- the page */

    @Test
    @DisplayName("[B11] the admin page is served at /admin/ and /admin/index.html")
    void servesTheStaticPage() throws Exception {
        for (String path : List.of("/admin/", "/admin", "/admin/index.html")) {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
        }
    }

    /* ------------------------------------------------------------ helpers */

    private record Account(UUID id, String email, String accessToken, String refreshToken) {
    }

    private static String bearer(Account account) {
        return "Bearer " + account.accessToken;
    }

    /** Registers a real account through the API, then puts it in the state under test. */
    private Account account(AccountStatus status) throws Exception {
        String email = "admin-test-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "correct horse",
                                "phone", "+90 555 000 0000"))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        UUID id = UUID.fromString(body.get("me").get("id").asText());
        if (status != AccountStatus.INCOMPLETE) {
            setStatus(id, status);
        }
        return new Account(id, email,
                body.get("tokens").get("accessToken").asText(),
                body.get("tokens").get("refreshToken").asText());
    }

    /**
     * A registration waiting in the queue, as {@code PUT /me/profile} leaves it.
     * Written directly so this suite does not depend on that endpoint's own rules.
     */
    private Account pending(Section section, Instant submittedAt, String name, String bio) throws Exception {
        Account created = account(AccountStatus.INCOMPLETE);
        AppUser user = users.findById(created.id).orElseThrow();
        user.setName(name);
        user.setBio(bio);
        user.setSection(sections.findById(section.getId()).orElseThrow());
        user.setSubmittedAt(submittedAt);
        user.setStatus(AccountStatus.PENDING);
        users.save(user);
        return created;
    }

    private void setStatus(UUID id, AccountStatus status) {
        AppUser user = users.findById(id).orElseThrow();
        user.setStatus(status);
        users.save(user);
    }

    private Account admin() throws Exception {
        Account account = account(AccountStatus.INCOMPLETE);
        bootstrap.promote(account.email);
        return account;
    }

    private void assertAudited(UUID subject, String action, UUID actor) {
        var rows = auditLog.findBySubjectUserIdAndActionOrderByCreatedAtDesc(subject, action);
        assertThat(rows).as("audit row for %s", action).isNotEmpty();
        assertThat(rows.get(0).getActorId()).isEqualTo(actor);
        assertThat(rows.get(0).getSubjectKind()).isEqualTo("user");
    }

    private List<String> idsOf(MvcResult result) throws Exception {
        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString());
        return rows.findValuesAsText("id");
    }

    private JsonNode rowFor(MvcResult result, UUID id) throws Exception {
        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString());
        for (JsonNode row : rows) {
            if (row.get("id").asText().equals(id.toString())) {
                return row;
            }
        }
        throw new AssertionError("no row for " + id);
    }
}
