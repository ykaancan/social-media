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
 * {@code sectionChangeAvailableAt} is {@code max(changed_at) + 30 days} in one
 * organisation [D15] and there is no cooldown column to keep in step with it.
 *
 * <p>There is deliberately no entity. Three statements over four columns do not
 * need one, and a change here must never look like something an ORM could cascade
 * away: the log outlives every section it points at.
 */
@Repository
public class SectionChangeLog {

    /**
     * [D7]/[D15] One section change per this many days, per organisation: the one
     * figure the change route and {@code Me.memberships[].sectionChangeAvailableAt}
     * both read.
     */
    public static final int COOLDOWN_DAYS = 30;

    private final JdbcTemplate jdbc;

    public SectionChangeLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * [D7]/[D15] The most recent {@code changed_at} of this account in one
     * organisation, or empty if it never moved there. Read by the change route and
     * by {@code Me.memberships[].sectionChangeAvailableAt}: the 30 days are counted
     * per organisation, so a move in one never blocks a move in another.
     */
    public Optional<Instant> lastChangedAt(UUID userId, UUID organisationId) {
        Timestamp last = jdbc.queryForObject(
                "select max(changed_at) from section_change where user_id = ? and organisation_id = ?",
                Timestamp.class, userId, organisationId);
        return Optional.ofNullable(last).map(Timestamp::toInstant);
    }

    /**
     * [D7] Records a move. {@code fromSectionId} is null for an account that had no
     * section — the column allows it, so the export has to as well.
     *
     * <p>[D15] {@code organisationId} is the organisation of the membership whose
     * section moved; both sections belong to it.
     */
    public void record(UUID userId, UUID organisationId, UUID fromSectionId, UUID toSectionId, Instant changedAt) {
        jdbc.update("""
                insert into section_change (user_id, organisation_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?, ?)
                """, userId, organisationId, fromSectionId, toSectionId, Timestamp.from(changedAt));
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
