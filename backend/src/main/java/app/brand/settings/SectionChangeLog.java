package app.brand.settings;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The one thing step B-2 needs from {@code section_change}: when the caller last
 * changed section, so {@code sectionChangeAvailableAt} can be answered.
 *
 * <p>Writing the row, the 30-day refusal and {@code PUT /me/section} itself are
 * step B-5. There is deliberately no entity: a read of one timestamp does not
 * need one, and B-5 is free to add whatever mapping it wants without unpicking
 * this.
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
}
