package app.brand.section;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * "Is there an event we are both in?" — the one thing a section roster needs to
 * know about events, answered without pulling the events feature forward.
 *
 * <p>[B5] The status in the ordering is derived here exactly as it is everywhere
 * else: {@code closed_at} set or {@code now() >= ends_at} is archived, otherwise
 * {@code now() >= starts_at} is live, otherwise upcoming. A live event wins,
 * because that is the wall the two people can actually use tonight.
 *
 * <p>Read-only and deliberately a plain query: step B-2 owns the event model.
 */
@Repository
public class SharedEventLookup {

    private static final String SQL = """
            select em.user_id as member_id, e.id as event_id
            from event_member em
            join event e on e.id = em.event_id
            join event_member viewer on viewer.event_id = e.id and viewer.user_id = :viewer
            where em.user_id in (:members)
            order by case
                         when e.closed_at is not null or now() >= e.ends_at then 2
                         when now() >= e.starts_at then 0
                         else 1
                     end,
                     e.starts_at desc,
                     e.id
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public SharedEventLookup(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** For each of {@code memberIds}, an event they share with {@code viewerId}, if any. */
    public Map<UUID, UUID> sharedEventsWith(UUID viewerId, Collection<UUID> memberIds) {
        if (viewerId == null || memberIds == null || memberIds.isEmpty()) {
            return Map.of();
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                SQL, Map.of("viewer", viewerId, "members", List.copyOf(memberIds)));

        Map<UUID, UUID> shared = new HashMap<>();
        for (Map<String, Object> row : rows) {
            // Rows arrive best-first, so the first one seen for a person is the
            // event to link their wall from.
            shared.putIfAbsent((UUID) row.get("member_id"), (UUID) row.get("event_id"));
        }
        return shared;
    }
}
