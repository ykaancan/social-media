package app.brand.section;

import app.brand.event.EventStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * "Is there an event we are both in?" — the one thing a section roster needs to
 * know about events.
 *
 * <p>[B5] The status in the ordering is not spelled out again here: it is
 * {@link EventStatus#RANK_SQL}, the same expression every event query uses, so
 * there is exactly one definition of live/upcoming/archived in the product. A
 * live event wins, because that is the wall the two people can actually use
 * tonight.
 *
 * <p>{@code now} comes from the application clock, never from the database's own
 * {@code now()}, for the same reason as everywhere else: a test has to be able to
 * stand on either side of a boundary.
 */
@Repository
public class SharedEventLookup {

    private static final String SQL = """
            select em.user_id as member_id, e.id as event_id
            from event_member em
            join event e on e.id = em.event_id
            join event_member viewer on viewer.event_id = e.id and viewer.user_id = :viewer
            where em.user_id in (:members)
            order by
            """ + EventStatus.RANK_SQL + """
            ,
                     e.starts_at desc,
                     e.id
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public SharedEventLookup(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** For each of {@code memberIds}, an event they share with {@code viewerId}, if any. */
    public Map<UUID, UUID> sharedEventsWith(UUID viewerId, Collection<UUID> memberIds) {
        if (viewerId == null || memberIds == null || memberIds.isEmpty()) {
            return Map.of();
        }
        List<Map<String, Object>> rows = jdbc.queryForList(SQL, Map.of(
                "viewer", viewerId,
                "members", List.copyOf(memberIds),
                "now", OffsetDateTime.ofInstant(Instant.now(clock), ZoneOffset.UTC)));

        Map<UUID, UUID> shared = new HashMap<>();
        for (Map<String, Object> row : rows) {
            // Rows arrive best-first, so the first one seen for a person is the
            // event to link their wall from.
            shared.putIfAbsent((UUID) row.get("member_id"), (UUID) row.get("event_id"));
        }
        return shared;
    }
}
