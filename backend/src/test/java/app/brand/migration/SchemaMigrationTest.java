package app.brand.migration;

import static org.assertj.core.api.Assertions.assertThat;

import app.brand.support.AbstractIntegrationTest;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The migrations run on a database that has never seen them, which is the only
 * check V1 and V2 can get: they are never edited once applied, so a syntax error
 * or a bad constraint has to be caught before the first deploy.
 *
 * <p>That the Spring context started at all also proves {@code ddl-auto: validate}
 * passed — every mapped entity still matches the columns V1 created.
 */
class SchemaMigrationTest extends AbstractIntegrationTest {

    /** BACKEND_PLAN.md §2, every table, including the ones later steps use. */
    private static final List<String> EXPECTED_TABLES = List.of(
            "country", "section", "app_user", "refresh_token", "password_reset_token",
            "user_settings", "section_change", "device", "event", "event_member",
            "inbox_message", "board_post", "post_reaction", "thread", "thread_participant",
            "thread_message", "request_key", "block", "report", "audit_log",
            "screening_term", "entitlement_usage", "push_outbox");

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @DisplayName("both migrations applied cleanly")
    void migrationsApplied() {
        List<String> applied = jdbc.queryForList(
                "select version from flyway_schema_history where success order by installed_rank",
                String.class);
        assertThat(applied).contains("1", "2");
    }

    @Test
    @DisplayName("every stage-1 table exists")
    void everyTableExists() {
        List<String> tables = jdbc.queryForList(
                "select table_name from information_schema.tables where table_schema = 'public'",
                String.class);
        assertThat(tables).containsAll(EXPECTED_TABLES);
    }

    @Test
    @DisplayName("the anonymity columns [B4] are on every content row")
    void anonymityColumnsArePresent() {
        for (String table : List.of("inbox_message", "board_post", "thread_message")) {
            assertThat(columnsOf(table)).as(table).contains(
                    "sender_id", "anonymity_level", "hint_section", "hint_country",
                    "hint_letter", "sender_section_id");
        }
        // The participant row carries the level new messages go out at [D5];
        // it has user_id, never sender_id.
        assertThat(columnsOf("thread_participant"))
                .contains("user_id", "anonymity_level", "sender_section_id", "revealed_at")
                .doesNotContain("sender_id");
    }

    @Test
    @DisplayName("email uniqueness is case-insensitive")
    void emailIsUniqueIgnoringCase() {
        List<String> definitions = jdbc.queryForList(
                "select indexdef from pg_indexes where tablename = 'app_user'", String.class);
        assertThat(definitions).anyMatch(def -> def.contains("UNIQUE") && def.contains("lower(email"));
    }

    @Test
    @DisplayName("[B13] reference data is Türkiye and its ESN sections, and nothing else")
    void referenceDataIsOnlySectionsAndCountries() {
        assertThat(jdbc.queryForObject("select name from country where code = 'TR'", String.class))
                .isEqualTo("Türkiye");

        List<String> sections = jdbc.queryForList("select name from section order by name", String.class);
        assertThat(sections).hasSize(26).contains("ESN Ankara", "ESN İzmir", "ESN Boğaziçi", "ESN KTÜ");

        // Product principle 4: no seeded people, events or messages, ever.
        assertThat(jdbc.queryForObject("select count(*) from event", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from inbox_message", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from board_post", Integer.class)).isZero();
    }

    private List<String> columnsOf(String table) {
        return jdbc.queryForList(
                "select column_name from information_schema.columns "
                        + "where table_schema = 'public' and table_name = ?",
                String.class, table);
    }
}
