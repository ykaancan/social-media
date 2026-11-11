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
import app.brand.support.TestMemberships;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Brief §4.9 — the admin account list, and the rule that only a {@code super_admin}
 * reaches it. [D14] Account approve and reject are gone; ban and promote stay. Every decision is checked for its audit row as well as its effect:
 * an unaudited ban is a bug, not a detail.
 */
class AdminApiIntegrationTest extends AbstractIntegrationTest {

    /** [D15] People get their section through an approved ESN Türkiye membership. */
    @Autowired
    private TestMemberships testMemberships;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private AuditLogRepository auditLog;

    @Autowired
    private AdminBootstrap bootstrap;

    @Autowired
    private JdbcTemplate jdbc;

    /* ------------------------------------------------------------- access */

    @Test
    @DisplayName("no token is 401")
    void withoutTokenIsUnauthorized() throws Exception {
        mockMvc.perform(get("/admin/api/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    @DisplayName("an active member is 403 forbidden, not 404")
    void memberIsForbidden() throws Exception {
        Account member = account(AccountStatus.ACTIVE);

        mockMvc.perform(get("/admin/api/users").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
    }

    @Test
    @DisplayName("a banned super_admin is 403: /admin/api is status-checked like every other route")
    void bannedAdminLosesTheQueue() throws Exception {
        Account admin = admin();
        setStatus(admin.id, AccountStatus.BANNED);

        mockMvc.perform(get("/admin/api/users").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));
    }

    @Test
    @DisplayName("a super_admin whose account is incomplete, or whose email is unconfirmed, is 403 as well")
    void inactiveAdminLosesTheQueue() throws Exception {
        Account admin = admin();
        setStatus(admin.id, AccountStatus.INCOMPLETE);

        mockMvc.perform(post("/admin/api/users/" + UUID.randomUUID() + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));

        setStatus(admin.id, AccountStatus.ACTIVE);
        jdbc.update("update app_user set email_confirmed_at = null where id = ?", admin.id);
        mockMvc.perform(get("/admin/api/users").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("email_unconfirmed"));
    }

    /* --------------------------------------------------------------- list */

    @Test
    @DisplayName("the list defaults to every account, newest first, with the identity fields")
    void listsEveryAccountNewestFirst() throws Exception {
        Account admin = admin();
        Section section = sections.findAll().get(0);

        Account older = active(section, Instant.parse("2026-01-01T00:00:00Z"), "Older Person", "first bio");
        Account newer = active(section, Instant.parse("2026-01-01T01:00:00Z"), "Newer Person", "second bio");

        MvcResult result = mockMvc.perform(get("/admin/api/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();

        // Ordered by created_at: `newer` registered after `older`.
        List<String> ids = idsOf(result);
        assertThat(ids).contains(older.id.toString(), newer.id.toString());
        assertThat(ids.indexOf(newer.id.toString())).isLessThan(ids.indexOf(older.id.toString()));

        JsonNode row = rowFor(result, older.id);
        assertThat(row.get("email").asText()).isEqualTo(older.email);
        assertThat(row.get("phone").asText()).isEqualTo("+90 555 000 0000");
        assertThat(row.get("name").asText()).isEqualTo("Older Person");
        assertThat(row.get("bio").asText()).isEqualTo("first bio");
        assertThat(row.get("status").asText()).isEqualTo("active");
        assertThat(row.get("role").asText()).isEqualTo("member");
        assertThat(row.get("submittedAt").asText()).startsWith("2026-01-01");
        // [D15] The account has no section (the person has one through a membership),
        // and [D11] there is never a country field of its own.
        assertThat(row.has("section")).isFalse();
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
        Account member = account(AccountStatus.ACTIVE);

        MvcResult all = mockMvc.perform(get("/admin/api/users?status=all")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(idsOf(all)).contains(member.id.toString(), admin.id.toString());

        MvcResult active = mockMvc.perform(get("/admin/api/users?status=active")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(idsOf(active)).contains(member.id.toString());

        // [D14] the approval statuses are no longer account statuses.
        for (String unknown : List.of("nonsense", "pending", "approved", "rejected")) {
            mockMvc.perform(get("/admin/api/users?status=" + unknown)
                            .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("validation"))
                    .andExpect(jsonPath("$.field").value("status"));
        }
    }

    @Test
    @DisplayName("one account by id, and 404 for an id that is not an account")
    void readsOneAccount() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.ACTIVE);

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

    /* ---------------------------------------------------------------- ban */

    @Test
    @DisplayName("ban revokes every refresh token; the account can neither refresh nor be banned twice")
    void banEndsTheSession() throws Exception {
        Account admin = admin();
        Account member = account(AccountStatus.ACTIVE);

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
        Account member = account(AccountStatus.ACTIVE);

        mockMvc.perform(post("/admin/api/users/" + member.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("banned"));
    }

    @Test
    @DisplayName("a super_admin cannot be banned through the API: 409, demote first")
    void adminCannotBeBanned() throws Exception {
        Account first = admin();
        Account second = admin();

        mockMvc.perform(post("/admin/api/users/" + second.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        assertThat(users.findById(second.id).orElseThrow().getStatus())
                .isEqualTo(AccountStatus.ACTIVE);
        // Including themselves: the founder cannot be locked out by a mis-tap either.
        mockMvc.perform(post("/admin/api/users/" + first.id + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a path variable that is not a UUID is a 404 in the error shape, not a 500")
    void malformedIdIsNotFound() throws Exception {
        Account admin = admin();

        mockMvc.perform(get("/admin/api/users/not-a-uuid")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    /* ------------------------------------------------------------ promote */

    @Test
    @DisplayName("promote makes an active account a super_admin; an incomplete one is 409")
    void promotesActiveAccount() throws Exception {
        Account admin = admin();
        Account future = account(AccountStatus.INCOMPLETE);

        mockMvc.perform(post("/admin/api/users/" + future.id + "/promote")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        setStatus(future.id, AccountStatus.ACTIVE);

        mockMvc.perform(post("/admin/api/users/" + future.id + "/promote")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("super_admin"));

        assertThat(users.findById(future.id).orElseThrow().getRole()).isEqualTo(Role.SUPER_ADMIN);
        assertAudited(future.id, "promote_admin", admin.id);

        // The role is data: the newly promoted account reaches the admin API at once.
        mockMvc.perform(get("/admin/api/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer(future)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/admin/api/users/" + future.id + "/promote")
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

    @Test
    @DisplayName("the page stays reachable with any account state: only /admin/api is status-checked")
    void staticPageIsNotStatusChecked() throws Exception {
        Account banned = account(AccountStatus.BANNED);

        for (String path : List.of("/admin/", "/admin", "/admin/index.html")) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(banned)))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
        }

        // The page is the exemption; the API behind it is not.
        mockMvc.perform(get("/admin/api/users").header(HttpHeaders.AUTHORIZATION, bearer(banned)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));
    }

    /* ------------------------------------------------------------ helpers */

    private record Account(UUID id, String email, String accessToken, String refreshToken) {
    }

    private static String bearer(Account account) {
        return "Bearer " + account.accessToken;
    }

    /**
     * Registers a real account through the API, marks its email confirmed [D18] so
     * the filter judges the status alone, then puts it in the state under test.
     */
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
        jdbc.update("update app_user set email_confirmed_at = now() where id = ?", id);
        if (status != AccountStatus.INCOMPLETE) {
            setStatus(id, status);
        }
        return new Account(id, email,
                body.get("tokens").get("accessToken").asText(),
                body.get("tokens").get("refreshToken").asText());
    }

    /**
     * An account whose profile was sent, as {@code PUT /me/profile} leaves it.
     * Written directly so this suite does not depend on that endpoint's own rules.
     */
    private Account active(Section section, Instant submittedAt, String name, String bio) throws Exception {
        Account created = account(AccountStatus.INCOMPLETE);
        AppUser user = users.findById(created.id).orElseThrow();
        user.setName(name);
        user.setBio(bio);
        user.setSubmittedAt(submittedAt);
        user.setStatus(AccountStatus.ACTIVE);
        users.save(user);
        testMemberships.approvedInEsn(created.id, section.getId());
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
