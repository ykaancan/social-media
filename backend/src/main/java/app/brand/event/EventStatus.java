package app.brand.event;

import com.fasterxml.jackson.annotation.JsonValue;
import java.time.Instant;
import java.util.Locale;

/**
 * [B5]/[D4] Event status is <b>derived, never stored</b>, and there is no fourth
 * value: a board a moderator ends early is {@code archived} at once and stamps
 * {@code closed_at}; "Closed" is a label the app renders when {@code closedAt} is
 * set, not a status.
 *
 * <p>The derivation lives here twice and only here: {@link #of(Instant, Instant,
 * Instant, Instant)} for Java, {@link #RANK_SQL} for SQL. Both read
 * {@code closed_at}, {@code starts_at}, {@code ends_at} and a {@code now} that
 * comes from the application clock — never from the database's own
 * {@code now()}, so a test can stand on either side of a boundary.
 */
public enum EventStatus {
    LIVE,
    UPCOMING,
    ARCHIVED;

    /**
     * The same three-way test as Java, sorting live (0) before upcoming (1) before
     * archived (2). The table must be aliased {@code e}.
     */
    public static final String RANK_SQL = """
            case
                when e.closed_at is not null or cast(:now as timestamptz) >= e.ends_at then 2
                when cast(:now as timestamptz) >= e.starts_at then 0
                else 1
            end""";

    /**
     * "Live first, then upcoming soonest first, then archived most recent end
     * first." The second key only ever applies to upcoming rows and the third only
     * to live ones, so one ORDER BY covers all three groups without repeating the
     * rank expression.
     */
    public static final String JOINED_ORDER_SQL = RANK_SQL + """
            ,
            case when e.closed_at is null and cast(:now as timestamptz) < e.starts_at
                     then e.starts_at end asc,
            case when e.closed_at is null and cast(:now as timestamptz) >= e.starts_at
                     and cast(:now as timestamptz) < e.ends_at then e.starts_at end desc,
            e.ends_at desc,
            e.id""";

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Boundaries open a state: {@code now == startsAt} is live, {@code now == endsAt} is archived. */
    public static EventStatus of(Instant closedAt, Instant startsAt, Instant endsAt, Instant now) {
        if (closedAt != null || !now.isBefore(endsAt)) {
            return ARCHIVED;
        }
        return now.isBefore(startsAt) ? UPCOMING : LIVE;
    }

    public static EventStatus of(Event event, Instant now) {
        return of(event.getClosedAt(), event.getStartsAt(), event.getEndsAt(), now);
    }
}
