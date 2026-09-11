package app.brand.safety;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.TextNormalizer;
import app.brand.safety.ContentScreener.ScreeningResult;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * [B9] Keyword screening and {@code POST /messages/screen}.
 *
 * <p>The point of the Turkish cases: the hard list is written by an admin who may
 * type "İZMİR" or "izmir" or "ızmır", and a sender may write any of the three. All
 * of them fold to one key through the same normaliser the app uses, so the list
 * cannot be stepped around by changing a dot.
 */
class ScreeningIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private ScreeningTermRepository terms;

    @Autowired
    private KeywordScreener screener;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @AfterEach
    void clearTheList() {
        terms.deleteAll();
        screener.invalidate();
    }

    @Test
    @DisplayName("a hard term blocks, a soft term warns, and anything else is allowed")
    void severities() {
        term("kaybol", ScreeningTerm.HARD);
        term("aptal", ScreeningTerm.SOFT);

        assertThat(screener.screen("sen kaybol")).isEqualTo(ScreeningResult.BLOCK);
        assertThat(screener.screen("biraz aptal")).isEqualTo(ScreeningResult.WARN);
        assertThat(screener.screen("iyi geceler")).isEqualTo(ScreeningResult.ALLOW);
        // Hard wins over soft in the same sentence, whatever order they appear in.
        assertThat(screener.screen("aptal, kaybol")).isEqualTo(ScreeningResult.BLOCK);
    }

    @Test
    @DisplayName("terms and text fold through the one normaliser: case, Turkish dots and diacritics")
    void turkishAwareMatching() {
        term("İZMİR", ScreeningTerm.HARD);
        term("Boğaziçi", ScreeningTerm.SOFT);

        assertThat(screener.screen("izmir")).isEqualTo(ScreeningResult.BLOCK);
        assertThat(screener.screen("ızmır gecesi")).isEqualTo(ScreeningResult.BLOCK);
        // Substring, not word boundary: gluing it to the next word does not help.
        assertThat(screener.screen("selamIZMIRden")).isEqualTo(ScreeningResult.BLOCK);
        assertThat(screener.screen("bogazici kampus")).isEqualTo(ScreeningResult.WARN);
        assertThat(screener.screen("ankara")).isEqualTo(ScreeningResult.ALLOW);
    }

    @Test
    @DisplayName("an empty list allows everything rather than failing closed")
    void emptyListAllows() {
        assertThat(screener.screen("anything at all")).isEqualTo(ScreeningResult.ALLOW);
        assertThat(screener.screen("")).isEqualTo(ScreeningResult.ALLOW);
        assertThat(screener.screen(null)).isEqualTo(ScreeningResult.ALLOW);
    }

    @Test
    @DisplayName("POST /messages/screen answers a boolean and nothing else")
    void endpointAnswersABoolean() throws Exception {
        term("kaybol", ScreeningTerm.HARD);
        term("aptal", ScreeningTerm.SOFT);
        AppUser sender = approvedAccount();

        screen(sender, body("iyi geceler", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warning").value(false))
                // Never which term, never how severely: that would read the hard list.
                .andExpect(jsonPath("$.severity").doesNotExist())
                .andExpect(jsonPath("$.term").doesNotExist());

        screen(sender, body("biraz aptal", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warning").value(true));

        screen(sender, body("sen kaybol", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warning").value(true));
    }

    @Test
    @DisplayName("280 characters on a wall or board, 500 in a thread, and never empty")
    void lengthRulesPerContext() throws Exception {
        AppUser sender = approvedAccount();

        screen(sender, body("   ", null)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("text"));
        screen(sender, body(null, null)).andExpect(status().isUnprocessableEntity());

        screen(sender, body("x".repeat(280), null)).andExpect(status().isOk());
        screen(sender, body("x".repeat(281), null)).andExpect(status().isUnprocessableEntity());

        screen(sender, body("x".repeat(281), "thread")).andExpect(status().isOk());
        screen(sender, body("x".repeat(500), "thread")).andExpect(status().isOk());
        screen(sender, body("x".repeat(501), "thread")).andExpect(status().isUnprocessableEntity());
        screen(sender, body("   ", "thread")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("screening is a member route: an unapproved account gets approval_required")
    void screeningIsAMemberRoute() throws Exception {
        AppUser pending = account(AccountStatus.PENDING);

        screen(pending, body("hello", null))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    /* ------------------------------------------------------------ helpers */

    private org.springframework.test.web.servlet.ResultActions screen(AppUser user, Map<String, Object> body)
            throws Exception {
        return mockMvc.perform(post("/messages/screen")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtService.issue(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    /** Null values are meaningful here, so this is not {@code Map.of}. */
    private static Map<String, Object> body(String text, String context) {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("context", context);
        return body;
    }

    private void term(String raw, String severity) {
        terms.saveAndFlush(ScreeningTerm.of(raw, TextNormalizer.normalizeForSearch(raw), severity,
                null, Instant.now()));
        screener.invalidate();
    }

    private AppUser approvedAccount() {
        return account(AccountStatus.APPROVED);
    }

    private AppUser account(AccountStatus status) {
        Section section = sections.findAll().stream()
                .min(Comparator.comparing(Section::getName)).orElseThrow();
        AppUser user = AppUser.register(
                "screen-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        user.setName("Screener");
        user.setSection(section);
        return users.saveAndFlush(user);
    }
}
