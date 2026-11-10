package app.brand.migration;

import static org.assertj.core.api.Assertions.assertThat;

import app.brand.support.AbstractIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * TENANT_PLAN.md section 9, acceptance test 1: {@code V4} applied to a database that
 * already holds V1–V3 data.
 *
 * <p>The suite's own database was migrated to the latest version before any test
 * ran, so it can only show that V4 applies to an empty schema. This test makes its
 * own database in the same container, migrates it to version 3 with Flyway, writes
 * rows in the V1 shape (accounts in every old status, an event, a section change),
 * then runs the remaining migrations and reads what V4 made of them.
 */
class OrganisationMigrationTest extends AbstractIntegrationTest {

    private static final Instant APPROVED_AT = Instant.parse("2026-09-10T12:00:00Z");

    @Autowired
    private JdbcTemplate suiteJdbc;

    private String database;
    private DriverManagerDataSource dataSource;
    private JdbcTemplate jdbc;

    @BeforeEach
    void createDatabase() {
        database = "v4_check_" + UUID.randomUUID().toString().replace("-", "");
        suiteJdbc.execute("create database " + database);

        dataSource = new DriverManagerDataSource();
        dataSource.setUrl("jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432)
                + "/" + database);
        dataSource.setUsername(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterEach
    void dropDatabase() {
        suiteJdbc.execute("drop database if exists " + database + " with (force)");
    }

    @Test
    @DisplayName("V4 on V1-V3 data: one organisation, every section, event and change attached, statuses mapped")
    void v4MapsExistingRows() {
        flyway("3").migrate();

        UUID ankara = sectionNamed("ESN Ankara");
        UUID izmir = sectionNamed("ESN İzmir");

        UUID admin = account("admin", "approved", ankara, APPROVED_AT, null);
        UUID incompleteNoSection = account("incomplete-a", "incomplete", null, null, null);
        UUID incompleteWithSection = account("incomplete-b", "incomplete", izmir, null, null);
        UUID pending = account("pending", "pending", ankara, null, null);
        UUID approved = account("approved", "approved", izmir, APPROVED_AT, admin);
        UUID rejected = account("rejected", "rejected", ankara, null, null);
        UUID bannedAfterApproval = account("banned-a", "banned", izmir, APPROVED_AT, admin);
        UUID bannedNeverApproved = account("banned-b", "banned", ankara, null, null);

        UUID event = jdbc.queryForObject("""
                insert into event (name, scope, section_id, starts_at, ends_at, cover, board_mode, join_code, creator_id)
                values ('Old night', 'section', ?, ?, ?, 'coral', 'approve_first', 'ABCDEF', ?)
                returning id
                """, UUID.class, ankara, Timestamp.from(APPROVED_AT),
                Timestamp.from(APPROVED_AT.plusSeconds(3600)), approved);
        jdbc.update("""
                insert into section_change (user_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?)
                """, approved, ankara, izmir, Timestamp.from(APPROVED_AT));

        flyway(null).migrate();
        assertThat(jdbc.queryForList(
                "select version from flyway_schema_history where success order by installed_rank", String.class))
                .contains("4");

        // One organisation, with the switches the migration promises.
        List<Map<String, Object>> organisations = jdbc.queryForList("select * from organisation");
        assertThat(organisations).hasSize(1);
        Map<String, Object> esn = organisations.get(0);
        assertThat(esn.get("name")).isEqualTo("ESN Türkiye");
        assertThat(esn.get("approval_required")).isEqualTo(true);
        assertThat(esn.get("has_sections")).isEqualTo(true);
        assertThat(esn.get("event_creation")).isEqualTo("members");
        UUID org = (UUID) esn.get("id");

        // Every section, event and section change points at it.
        assertThat(jdbc.queryForObject("select count(*) from section", Integer.class)).isEqualTo(26);
        assertThat(jdbc.queryForObject(
                "select count(*) from section where organisation_id is distinct from ?", Integer.class, org))
                .isZero();
        assertThat(jdbc.queryForObject("select organisation_id from event where id = ?", UUID.class, event))
                .isEqualTo(org);
        assertThat(jdbc.queryForObject(
                "select organisation_id from section_change where user_id = ?", UUID.class, approved))
                .isEqualTo(org);

        // Every account that had sent a profile with a section: one membership,
        // same section, mapped status. Incomplete accounts get none.
        assertThat(memberships(incompleteNoSection)).isEmpty();
        assertThat(memberships(incompleteWithSection)).isEmpty();
        assertMembership(admin, ankara, "approved", APPROVED_AT, null);
        assertMembership(pending, ankara, "pending", null, null);
        assertMembership(approved, izmir, "approved", APPROVED_AT, admin);
        assertMembership(rejected, ankara, "rejected", null, null);
        assertMembership(bannedAfterApproval, izmir, "approved", APPROVED_AT, admin);
        assertMembership(bannedNeverApproved, ankara, "pending", null, null);
        assertThat(jdbc.queryForObject("select count(*) from organisation_member", Integer.class)).isEqualTo(6);
        assertThat(jdbc.queryForObject(
                "select count(*) from organisation_member where role <> 'member' or organisation_id <> ?",
                Integer.class, org)).isZero();

        // No account keeps an approval status; the ban stays on the account.
        assertThat(jdbc.queryForObject(
                "select count(*) from app_user where status in ('pending', 'approved', 'rejected')", Integer.class))
                .isZero();
        assertThat(status(incompleteNoSection)).isEqualTo("incomplete");
        assertThat(status(incompleteWithSection)).isEqualTo("incomplete");
        for (UUID id : List.of(admin, pending, approved, rejected)) {
            assertThat(status(id)).isEqualTo("active");
        }
        assertThat(status(bannedAfterApproval)).isEqualTo("banned");
        assertThat(status(bannedNeverApproved)).isEqualTo("banned");

        // P4: accounts that existed before V4 are treated as confirmed.
        assertThat(jdbc.queryForObject(
                "select count(*) from app_user where email_confirmed_at is null", Integer.class)).isZero();
    }

    /* ------------------------------------------------------------ helpers */

    /** {@code null} target means every migration on the classpath. */
    private Flyway flyway(String target) {
        var configuration = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private UUID sectionNamed(String name) {
        return jdbc.queryForObject("select id from section where name = ?", UUID.class, name);
    }

    private UUID account(String label, String status, UUID sectionId, Instant approvedAt, UUID approvedBy) {
        Instant created = Instant.parse("2026-09-01T00:00:00Z");
        return jdbc.queryForObject("""
                insert into app_user (email, password_hash, status, name, section_id, created_at,
                                      submitted_at, approved_at, approved_by)
                values (?, 'not-a-hash', ?, ?, ?, ?, ?, ?, ?)
                returning id
                """, UUID.class,
                label + "@example.com", status, sectionId == null ? null : label, sectionId,
                Timestamp.from(created),
                status.equals("incomplete") ? null : Timestamp.from(created.plusSeconds(60)),
                approvedAt == null ? null : Timestamp.from(approvedAt),
                approvedBy);
    }

    private List<Map<String, Object>> memberships(UUID userId) {
        return jdbc.queryForList("select * from organisation_member where user_id = ?", userId);
    }

    private void assertMembership(UUID userId, UUID sectionId, String status, Instant approvedAt, UUID approvedBy) {
        List<Map<String, Object>> rows = memberships(userId);
        assertThat(rows).hasSize(1);
        Map<String, Object> row = rows.get(0);
        assertThat(row.get("section_id")).isEqualTo(sectionId);
        assertThat(row.get("status")).isEqualTo(status);
        assertThat(row.get("approved_by")).isEqualTo(approvedBy);
        if (approvedAt == null) {
            assertThat(row.get("approved_at")).isNull();
        } else {
            assertThat(((Timestamp) row.get("approved_at")).toInstant()).isEqualTo(approvedAt);
        }
        // submitted_at is carried over from the account.
        assertThat(((Timestamp) row.get("submitted_at")).toInstant())
                .isEqualTo(Instant.parse("2026-09-01T00:01:00Z"));
    }

    private String status(UUID userId) {
        return jdbc.queryForObject("select status from app_user where id = ?", String.class, userId);
    }
}
