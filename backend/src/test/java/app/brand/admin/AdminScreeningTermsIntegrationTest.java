package app.brand.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.safety.ContentScreener;
import app.brand.safety.ContentScreener.ScreeningResult;
import app.brand.safety.KeywordScreener;
import app.brand.safety.ScreeningTermRepository;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * [B9] The screening list, managed from the admin page.
 *
 * <p>The test that matters most is {@link #aTermIsLiveImmediately}: a term the
 * admin adds during an event has to bite on the very next message, not up to
 * thirty seconds later. That is the {@code ScreeningTermsChanged} event and the
 * listener on {@code KeywordScreener} — nothing in this file calls
 * {@code invalidate()}, precisely so the endpoint is what is being tested.
 */
class AdminScreeningTermsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private ScreeningTermRepository terms;

    @Autowired
    private KeywordScreener screener;

    @Autowired
    private ContentScreener contentScreener;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private AdminBootstrap bootstrap;

    @AfterEach
    void clearTheList() {
        terms.deleteAll();
        screener.invalidate();
    }

    @Test
    @DisplayName("a member cannot read or edit the list: 403, not 404")
    void memberIsForbidden() throws Exception {
        String member = token(AccountStatus.APPROVED, false);

        mockMvc.perform(get("/admin/api/screening-terms").header(HttpHeaders.AUTHORIZATION, member))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, member)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("kaybol", "hard")))
                .andExpect(status().isForbidden());
        assertThat(terms.findAll()).isEmpty();
    }

    @Test
    @DisplayName("add, list, delete — and the normalised term never appears on the wire")
    void crud() throws Exception {
        String admin = token(AccountStatus.APPROVED, true);

        MvcResult added = mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("  İZMİR  ", "hard")))
                .andExpect(status().isOk())
                // Stored as the admin typed it, trimmed; matched on the folded form.
                .andExpect(jsonPath("$.term").value("İZMİR"))
                .andExpect(jsonPath("$.severity").value("hard"))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.normalized").doesNotExist())
                .andReturn();
        String id = objectMapper.readTree(added.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("aptal", "soft")))
                .andExpect(status().isOk());

        MvcResult list = mockMvc.perform(get("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rows = objectMapper.readTree(list.getResponse().getContentAsString());
        assertThat(rows).hasSize(2);
        // Newest first: the term just added is the one the admin looks for.
        assertThat(rows.get(0).get("term").asText()).isEqualTo("aptal");

        mockMvc.perform(delete("/admin/api/screening-terms/" + id)
                        .header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNoContent());
        assertThat(terms.findAll()).hasSize(1);

        mockMvc.perform(delete("/admin/api/screening-terms/" + id)
                        .header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    @Test
    @DisplayName("the duplicate rule is on the folded term: 'izmir' after 'İZMİR' is 409")
    void duplicatesAreRefused() throws Exception {
        String admin = token(AccountStatus.APPROVED, true);

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("İZMİR", "hard")))
                .andExpect(status().isOk());

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("izmir", "hard")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        // The same word at the other severity is a different decision, and allowed.
        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("izmir", "soft")))
                .andExpect(status().isOk());
        assertThat(terms.findAll()).hasSize(2);
    }

    @Test
    @DisplayName("an empty term, a too-long one and an unknown severity are 422 on their field")
    void validation() throws Exception {
        String admin = token(AccountStatus.APPROVED, true);

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("   ", "hard")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("term"));

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("x".repeat(81), "hard")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("term"));

        // A term made only of combining marks folds to "", which is a substring of
        // every message: such a row would block the whole product.
        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("́̈", "hard")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("term"));

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("kaybol", "medium")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("severity"));

        assertThat(terms.findAll()).isEmpty();
    }

    @Test
    @DisplayName("a term added through the API screens the very next message, with no 30-second wait")
    void aTermIsLiveImmediately() throws Exception {
        String admin = token(AccountStatus.APPROVED, true);

        // Load the cache first, so the test would fail without the invalidation.
        assertThat(contentScreener.screen("sen kaybol")).isEqualTo(ScreeningResult.ALLOW);

        mockMvc.perform(post("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("kaybol", "hard")))
                .andExpect(status().isOk());

        assertThat(contentScreener.screen("sen kaybol")).isEqualTo(ScreeningResult.BLOCK);

        MvcResult list = mockMvc.perform(get("/admin/api/screening-terms")
                        .header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andReturn();
        String id = objectMapper.readTree(list.getResponse().getContentAsString())
                .get(0).get("id").asText();

        mockMvc.perform(delete("/admin/api/screening-terms/" + id)
                        .header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNoContent());

        // And a deletion takes effect just as fast.
        assertThat(contentScreener.screen("sen kaybol")).isEqualTo(ScreeningResult.ALLOW);
    }

    /* ------------------------------------------------------------ fixtures */

    private String body(String term, String severity) throws Exception {
        return objectMapper.writeValueAsString(Map.of("term", term, "severity", severity));
    }

    private String token(AccountStatus status, boolean admin) throws Exception {
        String email = "terms-test-" + UUID.randomUUID() + "@example.com";
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
        AppUser user = users.findById(id).orElseThrow();
        user.setStatus(status);
        users.save(user);
        if (admin) {
            bootstrap.promote(email);
        }
        return "Bearer " + body.get("tokens").get("accessToken").asText();
    }
}
