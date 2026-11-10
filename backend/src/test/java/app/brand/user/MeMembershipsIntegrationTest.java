package app.brand.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * [D14] {@code GET /me} carries the caller's memberships, in the {@code Membership}
 * shape of {@code app/src/api/tenant.ts}: every status, {@code canCreateEvents}
 * [D16], {@code sectionChangeAvailableAt} per organisation [D7] and
 * {@code pendingEventName} while pending [D17]. Nobody else's memberships, ever.
 */
class MeMembershipsIntegrationTest extends AbstractIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-11-09T12:00:00Z");

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    private final List<UUID> people = new ArrayList<>();
    private final List<UUID> fixtureEvents = new ArrayList<>();
    private final List<UUID> fixtureOrganisations = new ArrayList<>();

    @BeforeEach
    void freeze() {
        clock.freezeAt(NOW);
    }

    /** {@code SchemaMigrationTest} asserts there are no events; memberships go so nothing restricts. */
    @AfterEach
    void clearUp() {
        clock.reset();
        for (UUID id : people) {
            jdbc.update("delete from organisation_member where user_id = ?", id);
            jdbc.update("delete from section_change where user_id = ?", id);
        }
        for (UUID eventId : fixtureEvents) {
            jdbc.update("delete from event where id = ?", eventId);
        }
        // SchemaMigrationTest counts the sections.
        for (UUID orgId : fixtureOrganisations) {
            jdbc.update("delete from section where organisation_id = ?", orgId);
        }
        people.clear();
        fixtureEvents.clear();
        fixtureOrganisations.clear();
    }

    @Test
    @DisplayName("a pending membership shows pendingEventName; an approved one does not")
    void pendingShowsTheEventName() throws Exception {
        AppUser me = account();
        UUID pendingOrg = organisation("admins", false);
        UUID approvedOrg = organisation("members", false);
        UUID eventId = event(pendingOrg);
        UUID otherEvent = event(approvedOrg);
        membership(pendingOrg, me.getId(), "pending", "member", null, eventId, NOW.minusSeconds(20));
        // A stale pending_event_id on an approved row is not shown.
        membership(approvedOrg, me.getId(), "approved", "member", null, otherEvent, NOW.minusSeconds(10));

        JsonNode memberships = me(me).get("memberships");
        assertThat(memberships).hasSize(2);

        JsonNode pending = memberships.get(0);
        assertThat(pending.get("organisation").get("id").asText()).isEqualTo(pendingOrg.toString());
        assertThat(pending.get("organisation").get("hasSections").asBoolean()).isFalse();
        assertThat(pending.get("status").asText()).isEqualTo("pending");
        assertThat(pending.get("role").asText()).isEqualTo("member");
        assertThat(pending.get("pendingEventName").asText()).isEqualTo("Welcome night");
        assertThat(pending.get("canCreateEvents").asBoolean()).isFalse();
        assertThat(pending.has("section")).isFalse();
        // string | null, so present as null rather than absent.
        assertThat(pending.has("sectionChangeAvailableAt")).isTrue();
        assertThat(pending.get("sectionChangeAvailableAt").isNull()).isTrue();

        JsonNode approved = memberships.get(1);
        assertThat(approved.get("status").asText()).isEqualTo("approved");
        assertThat(approved.has("pendingEventName")).isFalse();
    }

    @Test
    @DisplayName("canCreateEvents: admins-only needs role admin; members lets any approved member; pending and rejected never")
    void canCreateEventsFollowsTheSwitch() throws Exception {
        AppUser me = account();
        UUID adminsOnlyAsMember = organisation("admins", false);
        UUID adminsOnlyAsAdmin = organisation("admins", false);
        UUID membersAsMember = organisation("members", false);
        UUID membersRejected = organisation("members", false);
        membership(adminsOnlyAsMember, me.getId(), "approved", "member", null, null, NOW.minusSeconds(40));
        membership(adminsOnlyAsAdmin, me.getId(), "approved", "admin", null, null, NOW.minusSeconds(30));
        membership(membersAsMember, me.getId(), "approved", "member", null, null, NOW.minusSeconds(20));
        membership(membersRejected, me.getId(), "rejected", "member", null, null, NOW.minusSeconds(10));

        JsonNode memberships = me(me).get("memberships");
        assertThat(memberships).hasSize(4);
        assertThat(memberships.get(0).get("canCreateEvents").asBoolean()).isFalse();
        assertThat(memberships.get(1).get("canCreateEvents").asBoolean()).isTrue();
        assertThat(memberships.get(2).get("canCreateEvents").asBoolean()).isTrue();
        assertThat(memberships.get(3).get("canCreateEvents").asBoolean()).isFalse();
        assertThat(memberships.get(3).get("status").asText()).isEqualTo("rejected");
    }

    @Test
    @DisplayName("sectionChangeAvailableAt is the newest change in that organisation + 30 days while in the future")
    void sectionChangeAvailableAtIsPerOrganisation() throws Exception {
        AppUser me = account();
        UUID recent = organisation("members", true);
        UUID old = organisation("members", true);
        UUID recentA = section(recent, "Recent A");
        UUID recentB = section(recent, "Recent B");
        UUID oldA = section(old, "Old A");
        UUID oldB = section(old, "Old B");
        membership(recent, me.getId(), "approved", "member", recentB, null, NOW.minusSeconds(20));
        membership(old, me.getId(), "approved", "member", oldB, null, NOW.minusSeconds(10));
        Instant recentChange = NOW.minus(10, ChronoUnit.DAYS);
        sectionChange(me.getId(), recent, recentA, recentB, NOW.minus(40, ChronoUnit.DAYS));
        sectionChange(me.getId(), recent, recentB, recentA, recentChange);
        sectionChange(me.getId(), old, oldA, oldB, NOW.minus(31, ChronoUnit.DAYS));

        JsonNode memberships = me(me).get("memberships");
        assertThat(memberships.get(0).get("sectionChangeAvailableAt").asText())
                .isEqualTo(recentChange.plus(30, ChronoUnit.DAYS).toString());
        assertThat(memberships.get(0).get("section").get("id").asText()).isEqualTo(recentB.toString());
        assertThat(memberships.get(0).get("section").get("country").asText()).isEqualTo("Türkiye");
        assertThat(memberships.get(1).get("sectionChangeAvailableAt").isNull()).isTrue();
    }

    @Test
    @DisplayName("GET /me lists only the caller's own memberships, and an empty list for none")
    void onlyTheCallersMemberships() throws Exception {
        AppUser me = account();
        AppUser other = account();
        UUID org = organisation("members", false);
        membership(org, other.getId(), "approved", "admin", null, null, NOW);

        JsonNode mine = me(me);
        assertThat(mine.get("memberships").isArray()).isTrue();
        assertThat(mine.get("memberships")).isEmpty();
        assertThat(me(other).get("memberships")).hasSize(1);
    }

    /* ------------------------------------------------------------ helpers */

    private JsonNode me(AppUser user) throws Exception {
        String body = mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtService.issue(user)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private AppUser account() {
        AppUser user = AppUser.register("memberships-" + UUID.randomUUID() + "@example.com",
                "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.ACTIVE);
        user.confirmEmail(Instant.now());
        user.setName("Member");
        AppUser saved = users.saveAndFlush(user);
        people.add(saved.getId());
        return saved;
    }

    private UUID organisation(String eventCreation, boolean hasSections) {
        UUID id = jdbc.queryForObject("""
                insert into organisation (name, approval_required, has_sections, event_creation)
                values (?, true, ?, ?) returning id
                """, UUID.class, "Org " + UUID.randomUUID().toString().substring(0, 8), hasSections, eventCreation);
        fixtureOrganisations.add(id);
        return id;
    }

    private UUID section(UUID orgId, String name) {
        return jdbc.queryForObject("""
                insert into section (name, country_code, organisation_id) values (?, 'TR', ?) returning id
                """, UUID.class, name + " " + UUID.randomUUID().toString().substring(0, 4), orgId);
    }

    private UUID event(UUID orgId) {
        UUID id = UUID.randomUUID();
        Instant starts = NOW.plus(1, ChronoUnit.DAYS);
        jdbc.update("""
                insert into event (id, organisation_id, name, starts_at, ends_at, cover, board_mode, join_code)
                values (?, ?, 'Welcome night', ?, ?, 'azure', 'approve_first', ?)
                """, id, orgId, Timestamp.from(starts), Timestamp.from(starts.plus(4, ChronoUnit.HOURS)),
                UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase());
        fixtureEvents.add(id);
        return id;
    }

    private void membership(UUID orgId, UUID userId, String status, String role, UUID sectionId,
                            UUID pendingEventId, Instant createdAt) {
        jdbc.update("""
                insert into organisation_member (organisation_id, user_id, status, role, section_id,
                                                 pending_event_id, submitted_at, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """, orgId, userId, status, role, sectionId, pendingEventId,
                Timestamp.from(createdAt), Timestamp.from(createdAt));
    }

    private void sectionChange(UUID userId, UUID orgId, UUID from, UUID to, Instant at) {
        jdbc.update("""
                insert into section_change (user_id, organisation_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?, ?)
                """, userId, orgId, from, to, Timestamp.from(at));
    }
}
