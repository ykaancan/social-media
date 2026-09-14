package app.brand.settings;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * [D7] The {@code section_change} audit trail: one row per move, which is both the
 * record the brief asks for and the whole implementation of the 30-day rule —
 * {@code sectionChangeAvailableAt} is {@code max(changed_at) + 30 days} and there
 * is no cooldown column to keep in step with it.
 *
 * <p>There is deliberately no entity. Three statements over four columns do not
 * need one, and a change here must never look like something an ORM could cascade
 * away: the log outlives every section it points at.
 */
@Repository
public class SectionChangeLog {

    private final JdbcTemplate jdbc;

    public SectionChangeLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The most recent {@code changed_at}, or empty if this account never moved. */
    public Optional<Instant> lastChangedAt(UUID userId) {
        Timestamp last = jdbc.queryForObject(
                "select max(changed_at) from section_change where user_id = ?", Timestamp.class, userId);
        return Optional.ofNullable(last).map(Timestamp::toInstant);
    }

    /**
     * [D7] Records a move. {@code fromSectionId} is null only for an account that
     * somehow had no section — the column allows it, so the export has to as well.
     */
    public void record(UUID userId, UUID fromSectionId, UUID toSectionId, Instant changedAt) {
        jdbc.update("""
                insert into section_change (user_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?)
                """, userId, fromSectionId, toSectionId, Timestamp.from(changedAt));
    }

    /**
     * The whole trail for one account, oldest first, with section <b>names</b>:
     * this feeds {@code GET /me/export}, which is read by a person and must not
     * hand back opaque ids they cannot resolve.
     */
    public List<Entry> historyOf(UUID userId) {
        return jdbc.query("""
                select previous.name as from_name, next.name as to_name, change.changed_at
                from section_change change
                left join section previous on previous.id = change.from_section_id
                join section next on next.id = change.to_section_id
                where change.user_id = ?
                order by change.changed_at asc
                """, (rs, row) -> new Entry(
                        rs.getString("from_name"),
                        rs.getString("to_name"),
                        rs.getTimestamp("changed_at").toInstant()),
                userId);
    }

    /** One line of the export's {@code sectionChanges}. {@code from} may be null. */
    public record Entry(String from, String to, Instant at) {
    }
}
