package app.brand.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * [B14] The shapes a wrong request comes back in.
 *
 * <p>Each of these used to fall through to the catch-all handler: a 500 with
 * {@code code: unknown} and an ERROR line in the log for something the caller did,
 * which is both the wrong answer and noise that hides real failures. The log
 * assertion is part of the test for exactly that reason.
 */
class ErrorContractIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    private ListAppender<ILoggingEvent> handlerLog;

    @BeforeEach
    void captureHandlerLog() {
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RestExceptionHandler.class);
        handlerLog = new ListAppender<>();
        handlerLog.start();
        logger.addAppender(handlerLog);
    }

    @AfterEach
    void releaseHandlerLog() {
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RestExceptionHandler.class);
        logger.detachAppender(handlerLog);
        handlerLog.stop();
    }

    @Test
    @DisplayName("the wrong verb on a real route is 405 method_not_allowed, in the error shape")
    void wrongVerbIsMethodNotAllowed() throws Exception {
        String bearer = approvedBearer();

        MvcResult result = mockMvc.perform(post("/ping-approved").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("method_not_allowed"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        // {code, message, field?} and nothing else.
        assertThat(body.has("field")).isFalse();
        assertNoErrorLogged();
    }

    @Test
    @DisplayName("JSON to the one multipart endpoint is 415 unsupported_media_type")
    void wrongContentTypeIsUnsupportedMediaType() throws Exception {
        // /me/photo is reachable at any account status, so a fresh account is enough.
        String bearer = bearerFor(register());

        mockMvc.perform(post("/me/photo")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("unsupported_media_type"));

        assertNoErrorLogged();
    }

    @Test
    @DisplayName("an Accept this server cannot satisfy is 406, with a body the client can still read")
    void unacceptableAcceptIsNotAcceptable() throws Exception {
        String bearer = approvedBearer();

        mockMvc.perform(get("/ping-approved")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .accept(MediaType.APPLICATION_PDF))
                .andExpect(status().isNotAcceptable())
                .andExpect(jsonPath("$.code").value("not_acceptable"));

        assertNoErrorLogged();
    }

    /* ------------------------------------------------------------ helpers */

    private void assertNoErrorLogged() {
        assertThat(handlerLog.list)
                .as("a request the caller got wrong must not log an ERROR")
                .noneMatch(event -> event.getLevel() == Level.ERROR);
    }

    private String approvedBearer() throws Exception {
        MvcResult registered = register();
        UUID id = UUID.fromString(objectMapper.readTree(registered.getResponse().getContentAsString())
                .get("me").get("id").asText());
        AppUser user = users.findById(id).orElseThrow();
        user.setStatus(AccountStatus.APPROVED);
        users.save(user);
        return bearerFor(registered);
    }

    private String bearerFor(MvcResult registered) throws Exception {
        return "Bearer " + objectMapper.readTree(registered.getResponse().getContentAsString())
                .get("tokens").get("accessToken").asText();
    }

    private MvcResult register() throws Exception {
        return mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "error-contract-" + UUID.randomUUID() + "@example.com",
                                "password", "correct horse"))))
                .andExpect(status().isCreated())
                .andReturn();
    }
}
