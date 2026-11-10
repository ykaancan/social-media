package app.brand.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.config.WebMvcConfig;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.support.RecordingConfirmationLinkSender;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * [D18] Email confirmation: TENANT_PLAN.md section 9, acceptance tests 2 to 5.
 *
 * <p>The clock is frozen per test so "24 hours later" and "61 seconds later" are
 * facts about the clock, not races. The lifetime and the resend spacing are the
 * defaults the test profile runs with: 24 hours (P2) and 60 seconds (P3).
 */
class EmailConfirmationIntegrationTest extends AbstractIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-09T10:00:00Z");

    /* Turkish copy from messages_tr.properties, escaped so this file stays ASCII. */
    private static final String TR_MAIL_SUBJECT = "E-postanı onayla";

    @Autowired
    private AppUserRepository users;

    @Autowired
    private RecordingConfirmationLinkSender links;

    @Autowired
    private MailConfirmationLinkSender mailSender;

    @Autowired
    private MutableClock clock;

    private ListAppender<ILoggingEvent> senderLog;

    @BeforeEach
    void captureSenderLog() {
        senderLog = new ListAppender<>();
        senderLog.start();
        ((Logger) LoggerFactory.getLogger(MailConfirmationLinkSender.class)).addAppender(senderLog);
        clock.freezeAt(T0);
    }

    @AfterEach
    void restore() {
        ((Logger) LoggerFactory.getLogger(MailConfirmationLinkSender.class)).detachAppender(senderLog);
        clock.reset();
    }

    /* ------------------------------------------------------------ test 2 */

    @Test
    @DisplayName("register: emailConfirmed is false, and with mail disabled the link is logged without the address")
    void registerLogsTheLinkWithoutTheAddress() throws Exception {
        String email = uniqueEmail();

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.me.emailConfirmed").value(false));

        assertThat(links.sentTo(email)).hasSize(1);
        String link = links.sentTo(email).get(0).link();
        assertThat(link).startsWith("http://localhost:8080/confirm?token=");

        // The real sender ran (the recorder delegates to it): one INFO line with
        // the link, and no line anywhere in this logger naming the address.
        assertThat(senderLog.list)
                .anyMatch(event -> event.getFormattedMessage().contains(link));
        assertThat(senderLog.list)
                .noneMatch(event -> event.getFormattedMessage().toLowerCase(Locale.ROOT)
                        .contains(email.toLowerCase(Locale.ROOT)));

        AppUser stored = users.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(stored.getEmailConfirmedAt()).isNull();
    }

    @Test
    @DisplayName("the confirmation mail is written in English and in Turkish")
    void confirmationMailIsTranslated() {
        var turkish = mailSender.compose("https://example.test/confirm?token=x", WebMvcConfig.TURKISH);
        assertThat(turkish.subject()).isEqualTo(TR_MAIL_SUBJECT);
        assertThat(turkish.body()).contains("https://example.test/confirm?token=x");

        var english = mailSender.compose("https://example.test/confirm?token=x", Locale.ENGLISH);
        assertThat(english.subject()).isEqualTo("Confirm your email");
        assertThat(english.body()).contains("Open this link to confirm your email address")
                .contains("https://example.test/confirm?token=x");
    }

    /* ------------------------------------------------------------ test 3 */

    @Test
    @DisplayName("an unconfirmed account gets 403 email_unconfirmed on a member route and 200 on GET /me")
    void unconfirmedAccountIsHeldAtTheDoor() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));

        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("email_unconfirmed"));

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emailConfirmed").value(false));
    }

    @Test
    @DisplayName("[D18] an unconfirmed account is refused on profile setup, photo, sections and /ws; auth and GET /me work")
    void unconfirmedAccountReachesOnlyMeAndAuth() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));

        for (MockHttpServletRequestBuilder request : profileSetupRoutes()) {
            mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("email_unconfirmed"));
        }
        // GET /me only: every other method on /me is a member route for it.
        mockMvc.perform(delete("/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("email_unconfirmed"));

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
        mockMvc.perform(get("/confirm").param("token", "invented").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
        resend(bearer);
        mockMvc.perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isNotEqualTo(403));
    }

    @Test
    @DisplayName("a confirmed incomplete account keeps profile setup, photo, sections and /ws")
    void confirmedIncompleteAccountKeepsTheOnboardingRoutes() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));
        mockMvc.perform(get("/confirm").param("token", links.lastTokenFor(email)))
                .andExpect(status().isOk());

        for (MockHttpServletRequestBuilder request : profileSetupRoutes()) {
            // Whatever the route itself answers, the access filter does not refuse it.
            mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer))
                    .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                            .doesNotContain("email_unconfirmed")
                            .doesNotContain("account_not_active"));
        }
        mockMvc.perform(get("/sections").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
    }

    /** The routes [D18] closes to an unconfirmed account and keeps open to a confirmed incomplete one. */
    private List<MockHttpServletRequestBuilder> profileSetupRoutes() {
        return List.of(
                put("/me/profile").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Deniz\"}"),
                patch("/me/profile").contentType(MediaType.APPLICATION_JSON).content("{\"bio\":\"hi\"}"),
                multipart("/me/photo").file(new MockMultipartFile(
                        "photo", "a.png", MediaType.IMAGE_PNG_VALUE, new byte[] {1, 2, 3})),
                get("/sections"),
                get("/ws"));
    }

    /* ------------------------------------------------------------ test 4 */

    @Test
    @DisplayName("opening the link confirms the email; opening it again changes nothing")
    void linkConfirmsOnce() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));
        String token = links.lastTokenFor(email);

        clock.freezeAt(T0.plusSeconds(5));
        mockMvc.perform(get("/confirm").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(Matchers.containsString("Email confirmed")));

        AppUser confirmed = users.findByEmailIgnoreCase(email).orElseThrow();
        assertThat(confirmed.getEmailConfirmedAt()).isEqualTo(T0.plusSeconds(5));
        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(jsonPath("$.emailConfirmed").value(true));
        // Confirmed now, so the filter moves on to the status: still incomplete.
        mockMvc.perform(get("/ping-approved").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_not_active"));

        // Used: the page says so and the stored time does not move.
        clock.freezeAt(T0.plusSeconds(60));
        mockMvc.perform(get("/confirm").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(Matchers.containsString("no longer works")));
        assertThat(users.findByEmailIgnoreCase(email).orElseThrow().getEmailConfirmedAt())
                .isEqualTo(T0.plusSeconds(5));
    }

    @Test
    @DisplayName("a link opened after its 24 hours, or an invented one, does not confirm")
    void expiredOrUnknownLinkDoesNotConfirm() throws Exception {
        String email = uniqueEmail();
        register(email);
        String token = links.lastTokenFor(email);

        clock.freezeAt(T0.plus(Duration.ofHours(24)).plusSeconds(1));
        mockMvc.perform(get("/confirm").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(Matchers.containsString("no longer works")));
        assertThat(users.findByEmailIgnoreCase(email).orElseThrow().getEmailConfirmedAt()).isNull();

        mockMvc.perform(get("/confirm").param("token", "invented"))
                .andExpect(status().isOk())
                .andExpect(content().string(Matchers.containsString("no longer works")));
        mockMvc.perform(get("/confirm"))
                .andExpect(status().isOk())
                .andExpect(content().string(Matchers.containsString("no longer works")));
    }

    /* ------------------------------------------------------------ test 5 */

    @Test
    @DisplayName("resend twice within the limit sends one mail; both answers are 202")
    void resendIsSpaced() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));
        assertThat(links.sentTo(email)).hasSize(1);

        // Inside 60 s of the registration link: nothing is sent, still 202.
        clock.freezeAt(T0.plusSeconds(59));
        resend(bearer);
        assertThat(links.sentTo(email)).hasSize(1);

        // Past it: one new link. A second call right after is inside the new
        // link's 60 s, so it sends nothing.
        clock.freezeAt(T0.plusSeconds(61));
        resend(bearer);
        resend(bearer);
        assertThat(links.sentTo(email)).hasSize(2);

        // Both links work until used: the newer one confirms.
        mockMvc.perform(get("/confirm").param("token", links.lastTokenFor(email)))
                .andExpect(content().string(Matchers.containsString("Email confirmed")));
    }

    @Test
    @DisplayName("resend for a confirmed account sends nothing, and without a token it is 401")
    void resendForConfirmedSendsNothing() throws Exception {
        String email = uniqueEmail();
        String bearer = bearer(register(email));
        mockMvc.perform(get("/confirm").param("token", links.lastTokenFor(email)))
                .andExpect(status().isOk());

        // Past the 60 s spacing, still inside the 15-minute access token.
        clock.freezeAt(T0.plusSeconds(120));
        resend(bearer);
        assertThat(links.sentTo(email)).hasSize(1);

        mockMvc.perform(post("/auth/resend-confirmation"))
                .andExpect(status().isUnauthorized());
    }

    /* ------------------------------------------------------------ helpers */

    private void resend(String bearer) throws Exception {
        mockMvc.perform(post("/auth/resend-confirmation").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isAccepted());
    }

    private MvcResult register(String email) throws Exception {
        return mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private String bearer(MvcResult registered) throws Exception {
        JsonNode body = objectMapper.readTree(registered.getResponse().getContentAsString());
        return "Bearer " + body.get("tokens").get("accessToken").asText();
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }

    private static String uniqueEmail() {
        return "confirm-" + UUID.randomUUID() + "@example.com";
    }
}
