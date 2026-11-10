package app.brand.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.TestMemberships;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
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
 * {@code GET /me}, {@code PUT /me/profile} and {@code PATCH /me/profile} — the
 * account rules from BACKEND_PLAN.md section 3 "Accounts", which are the mock's
 * rules unchanged.
 *
 * <p>{@code GET /me} is what the Pending screen polls, so it has to answer at
 * every status; the write routes are where the statuses differ.
 */
class ProfileIntegrationTest extends AbstractIntegrationTest {

    /** [D15] People get their section through an approved ESN Türkiye membership. */
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

    /* -------------------------------------------------------------- GET /me */

    @Test
    @DisplayName("GET /me answers for an incomplete account, with no profile fields")
    void meForIncompleteAccount() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(user.getId().toString()))
                .andExpect(jsonPath("$.status").value("incomplete"))
                .andExpect(jsonPath("$.role").value("member"))
                .andExpect(jsonPath("$.name").doesNotExist())
                .andExpect(jsonPath("$.section").doesNotExist())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
    }

    @Test
    @DisplayName("GET /me answers for an active account; section and country ride on the membership [D15]")
    void meForActiveAccount() throws Exception {
        Section section = anySection();
        AppUser user = account(AccountStatus.ACTIVE, "Elif", section);

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"))
                .andExpect(jsonPath("$.emailConfirmed").value(true))
                .andExpect(jsonPath("$.name").value("Elif"))
                .andExpect(jsonPath("$.section").doesNotExist())
                .andExpect(jsonPath("$.memberships[0].section.id").value(section.getId().toString()))
                .andExpect(jsonPath("$.memberships[0].section.country").value("Türkiye"));
    }

    /* ------------------------------------------------------- PUT /me/profile */

    @Test
    @DisplayName("[D15] submitting a profile makes the account active; a sectionId in the body is ignored")
    void submitProfileIgnoresSectionId() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);
        Section section = anySection();

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("  Kaan Can  ", section.getId().toString(),
                                "  exchange in Ankara  "))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"))
                // Trimmed on the way in; the client never has to.
                .andExpect(jsonPath("$.name").value("Kaan Can"))
                .andExpect(jsonPath("$.bio").value("exchange in Ankara"))
                .andExpect(jsonPath("$.section").doesNotExist())
                .andExpect(jsonPath("$.memberships").isEmpty());

        AppUser stored = users.findById(user.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(stored.getSubmittedAt()).isNotNull();
        // Nothing is stored for the section: not on the account, not as a membership.
        assertThat(accountSectionColumn(user)).isNull();
        assertThat(jdbc.queryForObject(
                "select count(*) from organisation_member where user_id = ?", Integer.class, user.getId()))
                .isZero();
    }

    @Test
    @DisplayName("[D14] PUT /me/profile without a section is active, and passes the access filter with no membership")
    void submitWithoutSectionIsActiveWithoutMembership() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Selin", null, null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"))
                .andExpect(jsonPath("$.section").doesNotExist());

        AppUser stored = users.findById(user.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(accountSectionColumn(user)).isNull();
        // Profile submit never creates a membership.
        assertThat(jdbc.queryForObject(
                "select count(*) from organisation_member where user_id = ?", Integer.class, user.getId()))
                .isZero();

        // A member route: the filter lets a confirmed, active account through with
        // no membership at all; organisations are checked at event join [D14].
        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a blank bio is absent from Me, never an empty string")
    void blankBioIsAbsent() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Deniz", anySection().getId().toString(), "   "))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bio").doesNotExist());
    }

    @Test
    @DisplayName("name and bio are validated with the field the app points at")
    void submitProfileValidation() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);
        String sectionId = anySection().getId().toString();

        submitInvalid(user, profile("   ", sectionId, null), "name");
        submitInvalid(user, profile("x".repeat(41), sectionId, null), "name");
        submitInvalid(user, profile("Deniz", sectionId, "y".repeat(81)), "bio");

        // Nothing was written by any of those.
        assertThat(users.findById(user.getId()).orElseThrow().getStatus())
                .isEqualTo(AccountStatus.INCOMPLETE);
    }

    @Test
    @DisplayName("an active account is told to use editing and section change, not resubmit")
    void activeAccountCannotResubmit() throws Exception {
        AppUser user = account(AccountStatus.ACTIVE, "Ada", anySection());

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Ada", anySection().getId().toString(), null))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.message").value("use profile editing and section change"));

        assertThat(users.findById(user.getId()).orElseThrow().getStatus())
                .isEqualTo(AccountStatus.ACTIVE);
    }

    @Test
    @DisplayName("a banned account is refused with 403 account_restricted but can still read /me")
    void bannedAccountIsRefused() throws Exception {
        AppUser user = account(AccountStatus.BANNED, "Banned", anySection());

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Banned", anySection().getId().toString(), null))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_restricted"));

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("banned"));
    }

    @Test
    @DisplayName("[D14] there is no rejected account to resubmit: once sent, a second send is refused")
    void secondSubmitAfterActiveIsRefused() throws Exception {
        Section section = anySection();
        AppUser user = account(AccountStatus.INCOMPLETE, null, null);

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Eski", section.getId().toString(), null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"));

        mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(profile("Yeni", section.getId().toString(), "second try"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("use profile editing and section change"));

        assertThat(users.findById(user.getId()).orElseThrow().getName()).isEqualTo("Eski");
    }

    /* ----------------------------------------------------- PATCH /me/profile */

    @Test
    @DisplayName("PATCH changes name and bio only - never the section, never the status")
    void patchChangesNameAndBioOnly() throws Exception {
        Section section = anySection();
        AppUser user = account(AccountStatus.ACTIVE, "Ada", section);

        mockMvc.perform(patch("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", " Ada L ", "bio", " one line "))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"))
                .andExpect(jsonPath("$.name").value("Ada L"))
                .andExpect(jsonPath("$.bio").value("one line"))
                .andExpect(jsonPath("$.memberships[0].section.id").value(section.getId().toString()));

        AppUser stored = users.findById(user.getId()).orElseThrow();
        assertThat(jdbc.queryForObject(
                "select section_id from organisation_member where user_id = ?", UUID.class, user.getId()))
                .isEqualTo(section.getId());
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.ACTIVE);
    }

    @Test
    @DisplayName("PATCH validates name and bio the same way as the first submit")
    void patchValidation() throws Exception {
        AppUser user = account(AccountStatus.ACTIVE, "Ada", anySection());

        mockMvc.perform(patch("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "x".repeat(41)))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("name"));
    }

    @Test
    @DisplayName("PATCH by an incomplete account is 403 account_not_active")
    void patchRequiresAnActiveAccount() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE, "Elif", anySection());

        mockMvc.perform(patch("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "Elif K"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));
    }

    @Test
    @DisplayName("no /me route answers without a bearer token")
    void meRequiresAToken() throws Exception {
        mockMvc.perform(get("/me")).andExpect(status().isUnauthorized());
    }

    /* -------------------------------------------------------------- helpers */

    private void submitInvalid(AppUser user, Map<String, Object> body, String field) throws Exception {
        MvcResult result = mockMvc.perform(put("/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(body)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("passwordHash");
    }

    /** [D15] The unmapped {@code app_user.section_id} column, read straight from the table. */
    private UUID accountSectionColumn(AppUser user) {
        return jdbc.queryForObject("select section_id from app_user where id = ?", UUID.class, user.getId());
    }

    /** Null values are meaningful here, so this is not {@code Map.of}. */
    private static Map<String, Object> profile(String name, String sectionId, String bio) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("sectionId", sectionId);
        body.put("bio", bio);
        return body;
    }

    /**
     * A fixture account written straight to the table: registration is
     * {@code AuthIntegrationTest}'s subject, and BCrypt at strength 12 is not worth
     * paying for once per case here.
     */
    private AppUser account(AccountStatus status, String name, Section section) {
        AppUser user = AppUser.register(
                "profile-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        // [D18] Confirmed, so the access filter judges the status alone.
        user.confirmEmail(Instant.now());
        user.setName(name);
        AppUser saved = users.saveAndFlush(user);
        if (section != null) {
            testMemberships.approvedInEsn(saved.getId(), section.getId());
        }
        return saved;
    }

    private Section anySection() {
        return sections.findAll().stream().min(Comparator.comparing(Section::getName)).orElseThrow();
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }
}
