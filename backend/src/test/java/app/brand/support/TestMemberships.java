package app.brand.support;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * [D14]/[D15] Organisation memberships for tests, in one place, so a test that
 * needs "an approved member of ESN Türkiye with a section" does not repeat the
 * SQL. Rows are written directly: the routes that create memberships are tested
 * on their own.
 *
 * <p>A component of the test source set, found by the application's own component
 * scan like {@link PingController}. It holds no per-test state except the list
 * of organisations it created, which {@link #removeOrganisations()} clears.
 */
@Component
public class TestMemberships {

    /** The organisation V4 creates for every existing section. */
    public static final String ESN_TURKIYE = "ESN Türkiye";

    private final JdbcTemplate jdbc;
    private final List<UUID> organisations = new ArrayList<>();

    public TestMemberships(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The id of "ESN Türkiye": approval on, sections on, event creation by members. */
    public UUID esnTurkiye() {
        return jdbc.queryForObject("select id from organisation where name = ?", UUID.class, ESN_TURKIYE);
    }

    /** An approved member of ESN Türkiye in this section (role member). */
    public void approvedInEsn(UUID userId, UUID sectionId) {
        add(esnTurkiye(), userId, "approved", "member", sectionId, null);
    }

    /**
     * A membership row in any status and role. {@code approved} also stamps
     * {@code approved_at}; {@code pendingEventId} may be null.
     */
    public void add(UUID organisationId, UUID userId, String status, String role, UUID sectionId,
                    UUID pendingEventId) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                insert into organisation_member (organisation_id, user_id, status, role, section_id,
                                                 pending_event_id, submitted_at, approved_at, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, organisationId, userId, status, role, sectionId, pendingEventId, now,
                "approved".equals(status) ? now : null, now);
    }

    /**
     * A new organisation with a unique name and, when {@code hasSections}, one
     * section of its own. Remembered for {@link #removeOrganisations()}.
     */
    public UUID organisation(boolean approvalRequired, boolean hasSections, String eventCreation) {
        String name = "Org " + UUID.randomUUID().toString().substring(0, 8);
        UUID id = jdbc.queryForObject("""
                insert into organisation (name, approval_required, has_sections, event_creation)
                values (?, ?, ?, ?) returning id
                """, UUID.class, name, approvalRequired, hasSections, eventCreation);
        organisations.add(id);
        if (hasSections) {
            section(id);
        }
        return id;
    }

    /** One more section in an organisation this helper created. */
    public UUID section(UUID organisationId) {
        return jdbc.queryForObject(
                "insert into section (name, country_code, organisation_id) values (?, 'TR', ?) returning id",
                UUID.class, "Section " + UUID.randomUUID().toString().substring(0, 8), organisationId);
    }

    /** The first section, by name, of an organisation. */
    public UUID sectionOf(UUID organisationId) {
        return jdbc.queryForObject("select id from section where organisation_id = ? order by name limit 1",
                UUID.class, organisationId);
    }

    /**
     * Removes the memberships and sections of the organisations this helper
     * created ({@code SchemaMigrationTest} counts sections). Call it after the
     * events of those organisations are gone. The organisations themselves stay;
     * nothing counts them, and events reference them.
     */
    public void removeOrganisations() {
        for (UUID id : organisations) {
            jdbc.update("delete from section_change where organisation_id = ?", id);
            jdbc.update("delete from organisation_member where organisation_id = ?", id);
            jdbc.update("delete from section where organisation_id = ?", id);
        }
        organisations.clear();
    }
}
