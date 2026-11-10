package app.brand.organisation;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * [D17] Creating a membership, once. Two identical requests at the same instant
 * race on the {@code (organisation_id, user_id)} primary key, and the loser must
 * not get a 500.
 *
 * <p>Native and {@code do nothing}, for the same reason as
 * {@code EventMemberRepository#joinIfAbsent}: the entity's id is assigned, so
 * {@code save} would be a {@code merge} and could overwrite a row the other
 * request has just written. This insert can only ever add a row; the caller then
 * reads the row back (locked) and decides from what is there.
 */
@Repository
public class OrganisationMemberInserts {

    private final JdbcTemplate jdbc;

    public OrganisationMemberInserts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * A new membership with role {@code member}. {@code approved} sets
     * {@code approved_at = now} and leaves {@code approved_by} null: nobody
     * approved it, the organisation has approval off.
     *
     * @return 1 when the row was written, 0 when a membership was already there
     */
    public int insertIfAbsent(UUID organisationId,
                              UUID userId,
                              MembershipStatus status,
                              UUID sectionId,
                              UUID pendingEventId,
                              Instant now) {
        Timestamp at = Timestamp.from(now);
        return jdbc.update("""
                        insert into organisation_member (organisation_id, user_id, status, role, section_id,
                                                         pending_event_id, submitted_at, approved_at, approved_by,
                                                         created_at)
                        values (?, ?, ?, 'member', ?, ?, ?, ?, null, ?)
                        on conflict (organisation_id, user_id) do nothing
                        """,
                organisationId, userId, status.value(), sectionId, pendingEventId, at,
                status == MembershipStatus.APPROVED ? at : null, at);
    }
}
