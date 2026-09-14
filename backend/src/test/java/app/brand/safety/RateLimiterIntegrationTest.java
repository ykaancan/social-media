package app.brand.safety;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
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
 * CLAUDE.md §5, "per-sender rate limits on anonymous posts": 30 anonymous wall
 * messages and 30 anonymous room posts per rolling hour, configured under
 * {@code brand.limits}.
 *
 * <p>The two rules that matter are both tested rather than assumed. The window is
 * <b>rolling</b>, so an account that spent its allowance is writing again an hour
 * later without anything having reset it; and only <b>anonymous</b> content is
 * counted, so a person who is willing to put their name to something is never
 * stopped by this — which is the point of a limit on the surface nobody can be
 * seen on.
 */
class RateLimiterIntegrationTest extends AbstractIntegrationTest {

    /** {@code brand.limits.anonymous-*-per-hour}, as application.yml defaults them. */
    private static final int LIMIT = 30;

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

    private final List<UUID> created = new ArrayList<>();

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.parse("2026-06-10T20:00:00Z");
        clock.freezeAt(base);
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        for (UUID id : created) {
            jdbc.update("delete from board_post where sender_id = ?", id);
            jdbc.update("delete from inbox_message where sender_id = ? or recipient_id = ?", id, id);
            jdbc.update("delete from event_member where user_id = ?", id);
        }
        jdbc.update("delete from event where name = 'Rate limit night'");
        created.clear();
    }

    @Test
    @DisplayName("the 31st anonymous wall message in an hour is 429, and an hour later it is not")
    void anonymousWallMessages() throws Exception {
        Fixture f = fixture();

        for (int i = 1; i <= LIMIT; i++) {
            wallMessage(f, "anonymous", "Note " + i).andExpect(status().isOk());
        }
        wallMessage(f, "anonymous", "One too many")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        assertThat(sent(f.sender)).isEqualTo(LIMIT);

        // Rolling: the hour moves with the clock, nothing resets.
        clock.freezeAt(base.plus(1, ChronoUnit.HOURS).plusSeconds(1));
        wallMessage(f, "anonymous", "A new hour").andExpect(status().isOk());
        assertThat(sent(f.sender)).isEqualTo(LIMIT + 1);
    }

    @Test
    @DisplayName("a named message is never counted and never refused")
    void namedIsUnaffected() throws Exception {
        Fixture f = fixture();

        for (int i = 1; i <= LIMIT; i++) {
            wallMessage(f, "anonymous", "Note " + i).andExpect(status().isOk());
        }
        // The anonymous allowance is spent; the named one does not exist.
        wallMessage(f, "named", "This is me").andExpect(status().isOk());
        wallMessage(f, "named", "Still me").andExpect(status().isOk());
        // And a named message did not count towards the anonymous limit either.
        wallMessage(f, "anonymous", "Still refused")
                .andExpect(status().isTooManyRequests());
    }

    @Test
    @DisplayName("anonymous room posts have their own hourly allowance")
    void anonymousRoomPosts() throws Exception {
        Fixture f = fixture();

        for (int i = 1; i <= LIMIT; i++) {
            roomPost(f, "anonymous", "Post " + i).andExpect(status().isOk());
        }
        roomPost(f, "anonymous", "One too many")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        // A named post still goes up: the two counters are separate and neither
        // touches content that carries a name.
        roomPost(f, "named", "Here I am").andExpect(status().isOk());

        clock.freezeAt(base.plus(1, ChronoUnit.HOURS).plusSeconds(1));
        roomPost(f, "anonymous", "A new hour").andExpect(status().isOk());
    }

    /* -------------------------------------------------------------- helpers */

    private record Fixture(AppUser sender, AppUser recipient, UUID eventId) {
    }

    private Fixture fixture() {
        Section section = sections.findAll().stream()
                .min(Comparator.comparing(Section::getName)).orElseThrow();
        AppUser sender = account(section, "Deniz");
        AppUser recipient = account(section, "Ece");
        UUID eventId = jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code)
                        values ('Rate limit night', 'section', ?, ?, ?, 'coral', 'approve_first', ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(base.minusSeconds(3600)),
                Timestamp.from(base.plusSeconds(7200)), joinCode());
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, sender.getId());
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, recipient.getId());
        return new Fixture(sender, recipient, eventId);
    }

    private ResultActions wallMessage(Fixture f, String level, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", f.eventId.toString());
        body.put("recipientId", f.recipient.getId().toString());
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", new HashMap<String, Object>());
        return mockMvc.perform(post("/messages/wall")
                .header(HttpHeaders.AUTHORIZATION, bearer(f.sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions roomPost(Fixture f, String level, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", f.eventId.toString());
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", new HashMap<String, Object>());
        return mockMvc.perform(post("/events/" + f.eventId + "/posts")
                .header(HttpHeaders.AUTHORIZATION, bearer(f.sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private long sent(AppUser sender) {
        Long count = jdbc.queryForObject(
                "select count(*) from inbox_message where sender_id = ? and anonymity_level = 'anonymous'",
                Long.class, sender.getId());
        return count == null ? 0 : count;
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private AppUser account(Section section, String name) {
        AppUser user = AppUser.register(
                "rate-limit-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash",
                null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        AppUser saved = users.saveAndFlush(user);
        created.add(saved.getId());
        return saved;
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }
}
