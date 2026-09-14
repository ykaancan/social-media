package app.brand.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/**
 * [B6] The board feed is capped; {@code postCount} is not.
 *
 * <p>The load check (backend/loadtest/README.md) measured ~0.15 ms of server time
 * per published post per 5 s poll and 9 of 10 pooled connections in use at a
 * ~500-post board, so {@code GET /events/{id}/board} returns the newest
 * {@code brand.limits.board-feed} cards instead of all of them. The count beside
 * them stays the real, full count — principle 4, never fake anything.
 *
 * <p>The cap is overridden to 5 here rather than inserting 205 rows; the shared
 * {@code application-test.yml} keeps the production default, so every other test
 * still sees an effectively unbounded feed.
 */
@TestPropertySource(properties = "brand.limits.board-feed=5")
class BoardFeedCapIntegrationTest extends AbstractIntegrationTest {

    /** Must match the @TestPropertySource above. */
    private static final int CAP = 5;
    private static final int EXTRA = 5;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @AfterEach
    void clearUp() {
        jdbc.update("delete from board_post");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'feedcap-%')");
    }

    @Test
    @DisplayName("[B6] the feed is the newest brand.limits.board-feed cards; postCount is still every one")
    void feedIsCappedButTheCountIsNot() throws Exception {
        Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Section section = sections.findAll().stream()
                .min(Comparator.comparing(Section::getName))
                .orElseThrow();
        AppUser creator = approved(section, "Deniz");
        AppUser member = approved(section, "Mert");

        UUID eventId = jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values ('Long night', 'section', ?, ?, ?, 'coral', 'post_immediately', ?, ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(base.minusSeconds(7200)),
                Timestamp.from(base.plusSeconds(3600)), joinCode(), creator.getId());
        join(eventId, creator.getId(), true);
        join(eventId, member.getId(), false);

        // CAP + EXTRA published room posts, one per second, so "newest first" is a
        // fact about the rows and not about insertion order.
        int total = CAP + EXTRA;
        List<String> newestFirst = new ArrayList<>();
        for (int i = 1; i <= total; i++) {
            jdbc.update("""
                    insert into board_post (event_id, sender_id, text, anonymity_level, state,
                                            approval_kind, created_at)
                    values (?, ?, ?, 'anonymous', 'approved', 'immediate', ?)
                    """, eventId, member.getId(), "Post " + i, Timestamp.from(base.plusSeconds(i)));
            newestFirst.add(0, "Post " + i);
        }

        JsonNode snapshot = json(mockMvc.perform(get("/events/" + eventId + "/board")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtService.issue(member)))
                .andExpect(status().isOk()));

        List<String> feed = new ArrayList<>();
        snapshot.get("posts").forEach(row -> feed.add(row.get("text").asText()));

        assertThat(feed).hasSize(CAP);
        // The newest CAP of them, newest first — the oldest EXTRA are off the feed.
        assertThat(feed).containsExactlyElementsOf(newestFirst.subList(0, CAP));
        assertThat(feed.get(0)).isEqualTo("Post " + total);

        // Principle 4: the number beside the board is the real one, not the size
        // of the list the cap handed back.
        assertThat(snapshot.get("event").get("postCount").asInt()).isEqualTo(total);
    }

    private void join(UUID eventId, UUID userId, boolean moderator) {
        jdbc.update("insert into event_member (event_id, user_id, is_moderator) values (?, ?, ?)",
                eventId, userId, moderator);
    }

    private AppUser approved(Section section, String name) {
        AppUser user = AppUser.register(
                "feedcap-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null,
                Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        return users.saveAndFlush(user);
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
