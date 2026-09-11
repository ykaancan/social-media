package app.brand.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.config.WebMvcConfig;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.RecordingResetLinkSender;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.UserSettingsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The account rules from BACKEND_PLAN.md §3, each one a test.
 *
 * <p>Every case that could leak the existence of an account is checked from the
 * outside — unknown address and wrong password must be indistinguishable, and
 * forgot-password must answer the same either way.
 */
class AuthIntegrationTest extends AbstractIntegrationTest {

    /* Turkish copy from messages_tr.properties, escaped so this file stays ASCII. */
    private static final String TR_FORM_HEADING = "Yeni bir \u015fifre se\u00e7";
    private static final String TR_INVALID_HEADING = "Bu ba\u011flant\u0131 art\u0131k \u00e7al\u0131\u015fm\u0131yor";
    private static final String TR_MISMATCH = "\u0130ki \u015fifre birbirini tutmuyor.";
    private static final String TR_MAIL_SUBJECT = "\u015eifreni s\u0131f\u0131rla";
    private static final String TR_MAIL_INTRO = "Yeni bir \u015fifre se\u00e7mek i\u00e7in bu ba\u011flant\u0131y\u0131 a\u00e7";

    @Autowired
    private AppUserRepository users;

    @Autowired
    private UserSettingsRepository settings;

    @Autowired
    private RecordingResetLinkSender resetLinks;

    @Autowired
    private MailResetLinkSender mailSender;

    @BeforeEach
    void clearRecordedLinks() {
        resetLinks.clear();
    }

    /* ---------------------------------------------------------- register */

    @Test
    @DisplayName("register returns 201 with an incomplete Me and a usable token pair")
    void registerCreatesIncompleteAccount() throws Exception {
        String email = uniqueEmail();

        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.me.status").value("incomplete"))
                .andExpect(jsonPath("$.me.role").value("member"))
                .andExpect(jsonPath("$.me.email").value(email))
                .andExpect(jsonPath("$.tokens.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokens.refreshToken").isNotEmpty())
                .andReturn();

        JsonNode me = read(result).get("me");
        // types.ts declares these optional: absent while incomplete, never null.
        assertThat(me.has("name")).isFalse();
        assertThat(me.has("section")).isFalse();
        assertThat(me.has("avatarUrl")).isFalse();
        // Nothing in any DTO ever carries the hash or an internal id.
        assertThat(result.getResponse().getContentAsString()).doesNotContain("passwordHash");

        AppUser stored = users.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(AccountStatus.INCOMPLETE);
        assertThat(stored.getPasswordHash()).isNotEqualTo("correct horse").startsWith("$2");
        // The settings row is created with the account, so no read has to cope
        // with it missing.
        assertThat(settings.findById(stored.getId())).isPresent();
    }

    @Test
    @DisplayName("a duplicate email is 409 email_in_use, whatever its case")
    void duplicateEmailIsRejectedCaseInsensitively() throws Exception {
        String email = uniqueEmail();
        register(email, "correct horse");

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email.toUpperCase(java.util.Locale.ROOT),
                                "password", "another one"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email_in_use"))
                .andExpect(jsonPath("$.field").value("email"));
    }

    @Test
    @DisplayName("a short password is 422 with the field named")
    void shortPasswordIsValidation() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", uniqueEmail(), "password", "short"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("password"));
    }

    @Test
    @DisplayName("an address that is not an address is 422 on the email field")
    void invalidEmailIsValidation() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "nope", "password", "correct horse"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("email"));
    }

    @Test
    @DisplayName("malformed JSON is 422, not 500")
    void malformedJsonIsValidation() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"));
    }

    /* ------------------------------------------------------------- login */

    @Test
    @DisplayName("login returns the same account the register call did")
    void loginSucceeds() throws Exception {
        String email = uniqueEmail();
        String id = read(register(email, "correct horse")).get("me").get("id").asText();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.me.id").value(id))
                .andExpect(jsonPath("$.tokens.accessToken").isNotEmpty());
    }

    @Test
    @DisplayName("a wrong password and an unknown address give exactly the same 401")
    void loginFailuresAreIndistinguishable() throws Exception {
        String email = uniqueEmail();
        register(email, "correct horse");

        String wrongPassword = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "wrong"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"))
                .andReturn().getResponse().getContentAsString();

        String unknownEmail = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", uniqueEmail(), "password", "correct horse"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"))
                .andReturn().getResponse().getContentAsString();

        assertThat(wrongPassword).isEqualTo(unknownEmail);
    }

    /* ----------------------------------------------------------- refresh */

    @Test
    @DisplayName("refresh rotates: a new pair is issued and the old token is dead")
    void refreshRotates() throws Exception {
        JsonNode auth = read(register(uniqueEmail(), "correct horse"));
        String firstRefresh = auth.get("tokens").get("refreshToken").asText();

        MvcResult rotated = mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", firstRefresh))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andReturn();

        String secondRefresh = read(rotated).get("refreshToken").asText();
        assertThat(secondRefresh).isNotEqualTo(firstRefresh);

        // Spending the old one again is a dead session, not a second chance.
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", firstRefresh))))
                .andExpect(status().isUnauthorized());

        // The new one still works.
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", secondRefresh))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an invented refresh token is 401")
    void unknownRefreshTokenIsRejected() throws Exception {
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", "not-a-token"))))
                .andExpect(status().isUnauthorized());
    }

    /* ------------------------------------------------------------ logout */

    @Test
    @DisplayName("logout with only a bearer ends that session and leaves the other device signed in")
    void logoutEndsOnlyTheCallingSession() throws Exception {
        String email = uniqueEmail();
        JsonNode phone = read(register(email, "correct horse"));
        JsonNode tablet = read(login(email, "correct horse"));

        String phoneAccess = phone.get("tokens").get("accessToken").asText();
        String phoneRefresh = phone.get("tokens").get("refreshToken").asText();
        String tabletRefresh = tablet.get("tokens").get("refreshToken").asText();

        // The client sends no body at all: the sid claim names the session.
        mockMvc.perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, "Bearer " + phoneAccess))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", phoneRefresh))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", tabletRefresh))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a rotated pair carries the new session id, so a later logout ends the new row")
    void logoutAfterRefreshEndsTheRotatedSession() throws Exception {
        String email = uniqueEmail();
        JsonNode phone = read(register(email, "correct horse"));
        JsonNode tablet = read(login(email, "correct horse"));
        String tabletRefresh = tablet.get("tokens").get("refreshToken").asText();

        MvcResult rotated = mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken",
                                phone.get("tokens").get("refreshToken").asText()))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode pair = read(rotated);

        mockMvc.perform(post("/auth/logout")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pair.get("accessToken").asText()))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", pair.get("refreshToken").asText()))))
                .andExpect(status().isUnauthorized());

        // Still only this session: the other device is untouched.
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", tabletRefresh))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("logout without any credentials is still 204 — it is best effort")
    void logoutWithoutCredentialsIsAccepted() throws Exception {
        mockMvc.perform(post("/auth/logout")).andExpect(status().isNoContent());
    }

    /* ---------------------------------------------------- forgot / reset */

    @Test
    @DisplayName("forgot-password is 202 for an unknown address and sends nothing")
    void forgotPasswordDoesNotLeakExistence() throws Exception {
        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", uniqueEmail()))))
                .andExpect(status().isAccepted());

        assertThat(resetLinks.sent()).isEmpty();
    }

    @Test
    @DisplayName("forgot-password is 202 for a known address and sends one link")
    void forgotPasswordSendsALink() throws Exception {
        String email = uniqueEmail();
        register(email, "correct horse");

        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email))))
                .andExpect(status().isAccepted());

        assertThat(resetLinks.sent()).hasSize(1);
        assertThat(resetLinks.sent().get(0).email()).isEqualTo(email);
        assertThat(resetLinks.sent().get(0).link()).startsWith("http://localhost:8080/reset?token=");
    }

    @Test
    @DisplayName("the reset page changes the password, kills the sessions and burns the link")
    void resetPageFlow() throws Exception {
        String email = uniqueEmail();
        JsonNode auth = read(register(email, "correct horse"));
        String refresh = auth.get("tokens").get("refreshToken").asText();

        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email))))
                .andExpect(status().isAccepted());
        String token = resetLinks.lastToken();

        mockMvc.perform(get("/reset").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Choose a new password")));

        mockMvc.perform(post("/reset")
                        .param("token", token)
                        .param("password", "a whole new password")
                        .param("confirm", "a whole new password"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Password changed")));

        // The old password is gone, the new one works.
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "a whole new password"))))
                .andExpect(status().isOk());

        // A reset signs out everywhere: whoever had the old password is out too.
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refresh))))
                .andExpect(status().isUnauthorized());

        // Single use.
        mockMvc.perform(get("/reset").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("no longer works")));
    }

    @Test
    @DisplayName("a password reset still signs out every session, not only the one that asked")
    void resetKillsEverySession() throws Exception {
        String email = uniqueEmail();
        String phoneRefresh = read(register(email, "correct horse"))
                .get("tokens").get("refreshToken").asText();
        String tabletRefresh = read(login(email, "correct horse"))
                .get("tokens").get("refreshToken").asText();

        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email))))
                .andExpect(status().isAccepted());

        mockMvc.perform(post("/reset")
                        .param("token", resetLinks.lastToken())
                        .param("password", "a whole new password")
                        .param("confirm", "a whole new password"))
                .andExpect(status().isOk());

        for (String refresh : List.of(phoneRefresh, tabletRefresh)) {
            mockMvc.perform(post("/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json(Map.of("refreshToken", refresh))))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    @DisplayName("the reset page is Turkish when the browser asks for Turkish")
    void resetPageIsTranslated() throws Exception {
        String token = resetTokenFor(uniqueEmail());

        mockMvc.perform(get("/reset").param("token", token)
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "tr-TR,tr;q=0.9"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString(TR_FORM_HEADING)))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("lang=\"tr\"")));

        // The dead-link page is translated too, not only the happy path.
        mockMvc.perform(get("/reset").param("token", "invented")
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "tr"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString(TR_INVALID_HEADING)));
    }

    @Test
    @DisplayName("a mismatch on the reset form is reported in the language of the request")
    void resetFormErrorIsTranslated() throws Exception {
        String token = resetTokenFor(uniqueEmail());

        mockMvc.perform(post("/reset")
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "tr")
                        .param("token", token)
                        .param("password", "a whole new password")
                        .param("confirm", "something else"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString(TR_MISMATCH)));
    }

    @Test
    @DisplayName("the reset mail is written in the language the request came in with")
    void resetMailIsTranslated() throws Exception {
        String email = uniqueEmail();
        register(email, "correct horse");

        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "tr")
                        .content(json(Map.of("email", email))))
                .andExpect(status().isAccepted());

        // The locale of the request reaches the sender; nothing about it is stored.
        assertThat(resetLinks.sent()).hasSize(1);
        assertThat(resetLinks.sent().get(0).locale()).isEqualTo(WebMvcConfig.TURKISH);

        var turkish = mailSender.compose("https://example.test/reset?token=x", WebMvcConfig.TURKISH);
        assertThat(turkish.subject()).isEqualTo(TR_MAIL_SUBJECT);
        assertThat(turkish.body()).contains(TR_MAIL_INTRO).contains("https://example.test/reset?token=x");

        var english = mailSender.compose("https://example.test/reset?token=x", Locale.ENGLISH);
        assertThat(english.subject()).isEqualTo("Reset your password");
        assertThat(english.body()).contains("Open this link to choose a new password");
    }

    @Test
    @DisplayName("an unknown reset token renders the same page as an expired one")
    void resetPageRejectsUnknownToken() throws Exception {
        mockMvc.perform(get("/reset").param("token", "invented"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("no longer works")));
    }

    /* ------------------------------------------------- member route guard */

    @Test
    @DisplayName("a member route without a token is 401")
    void memberRouteNeedsAToken() throws Exception {
        mockMvc.perform(get("/ping-approved"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    @DisplayName("a member route on a non-approved account is 403 approval_required")
    void memberRouteNeedsApproval() throws Exception {
        JsonNode auth = read(register(uniqueEmail(), "correct horse"));
        String access = auth.get("tokens").get("accessToken").asText();

        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    @Test
    @DisplayName("an approved account reaches the same route")
    void approvedAccountReachesMemberRoutes() throws Exception {
        String email = uniqueEmail();
        JsonNode auth = read(register(email, "correct horse"));
        String access = auth.get("tokens").get("accessToken").asText();
        approve(email);

        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a route that does not exist is a 404 in the same error shape [B14]")
    void unknownRouteIsNotFound() throws Exception {
        String email = uniqueEmail();
        JsonNode auth = read(register(email, "correct horse"));
        String access = auth.get("tokens").get("accessToken").asText();
        approve(email);

        mockMvc.perform(get("/no-such-route").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    @DisplayName("a forged bearer is 401, never a 500")
    void forgedTokenIsUnauthorized() throws Exception {
        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized());
    }

    /* -------------------------------------------------------------- helpers */

    private MvcResult login(String email, String password) throws Exception {
        return mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password))))
                .andExpect(status().isOk())
                .andReturn();
    }

    /** Registers the address and returns a live reset token for it. */
    private String resetTokenFor(String email) throws Exception {
        register(email, "correct horse");
        mockMvc.perform(post("/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email))))
                .andExpect(status().isAccepted());
        return resetLinks.lastToken();
    }

    private MvcResult register(String email, String password) throws Exception {
        return mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password))))
                .andExpect(status().isCreated())
                .andReturn();
    }

    /** Wave 2 owns the admin queue; here approval is just the row it will write. */
    private void approve(String email) {
        AppUser user = users.findByEmailIgnoreCase(email).orElseThrow();
        user.setStatus(AccountStatus.APPROVED);
        users.save(user);
    }

    private JsonNode read(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }

    private static String uniqueEmail() {
        return "member-" + UUID.randomUUID() + "@example.com";
    }
}
