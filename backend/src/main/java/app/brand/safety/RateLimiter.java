package app.brand.safety;

import app.brand.common.ApiException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * CLAUDE.md §5: "per-sender rate limits on anonymous posts and thread openings".
 * Thread openings live in {@code ThreadService} [B-4]; the anonymous halves live
 * here.
 *
 * <p>There is no counter table. The limit is a {@code count(*)} over the content
 * the account has already written inside a rolling window, which means it cannot
 * drift out of step with reality, survives a restart for free, and needs no
 * migration. At stage-1 scale — a few hundred people, an hour of rows, an index
 * on {@code sender_id} — that count is cheaper than the row it would have to
 * maintain.
 *
 * <p>Only <b>anonymous</b> content is counted, and only anonymous content is
 * refused. A named or hint-level message carries a person's identity and the
 * ordinary product rules already govern it; the thing worth limiting is the
 * surface where nobody can be seen. The refusal is {@code 429 rate_limited}
 * [B14], the same code the thread-opening limit answers with, so the app's one
 * "slow down" path covers both.
 */
@Component
public class RateLimiter {

    /** Rolling, not calendar: the 31st message in any 60 minutes is the one refused. */
    private static final Duration WINDOW = Duration.ofHours(1);

    /** What is being counted. The table name comes from here, never from a caller. */
    public enum Kind {

        /** Anonymous messages written to someone's wall ({@code inbox_message}). */
        ANONYMOUS_MESSAGES("inbox_message"),

        /** Anonymous posts written to a room ({@code board_post}). */
        ANONYMOUS_POSTS("board_post");

        private final String table;

        Kind(String table) {
            this.table = table;
        }
    }

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final int anonymousMessagesPerHour;
    private final int anonymousPostsPerHour;

    public RateLimiter(JdbcTemplate jdbc,
                       Clock clock,
                       @Value("${brand.limits.anonymous-messages-per-hour:30}") int anonymousMessagesPerHour,
                       @Value("${brand.limits.anonymous-posts-per-hour:30}") int anonymousPostsPerHour) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.anonymousMessagesPerHour = anonymousMessagesPerHour;
        this.anonymousPostsPerHour = anonymousPostsPerHour;
    }

    /**
     * Refuses with {@code 429 rate_limited} when this account has already written
     * its allowance of anonymous content in the last hour. A limit of {@code 0} or
     * less turns the check off entirely.
     */
    public void check(UUID userId, Kind kind) {
        int limit = limitFor(kind);
        if (limit <= 0) {
            return;
        }
        Instant since = Instant.now(clock).minus(WINDOW);
        Long written = jdbc.queryForObject(
                "select count(*) from " + kind.table
                        + " where sender_id = ? and anonymity_level = 'anonymous' and created_at > ?",
                Long.class, userId, Timestamp.from(since));
        if (written != null && written >= limit) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited",
                    "too much anonymous content");
        }
    }

    private int limitFor(Kind kind) {
        return kind == Kind.ANONYMOUS_MESSAGES ? anonymousMessagesPerHour : anonymousPostsPerHour;
    }
}
