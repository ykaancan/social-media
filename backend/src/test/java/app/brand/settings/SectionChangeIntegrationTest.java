package app.brand.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code PUT /me/section} — [D7] changing your own section.
 *
 * <p>Three product rules are on trial here and each has a test that would fail if
 * someone "simplified" it: the move is <b>not</b> a return to the approval queue
 * (the status is untouched and the account keeps working), the cooldown boundary
 * is <b>inclusive</b> at exactly 30 days, and re-picking the section you are
 * already in is a no-op that costs nothing — neither an audit row nor the month's
 * allowance.
 *
 * <p>[D11] The move is a country change too; the {@code Me} that comes back says
 * so, because country is only ever read through the section.
 */
class SectionChangeIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    private final List<UUID> created = new java.util.ArrayList<>();

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.parse("2026-04-01T09:00:00Z");
        clock.freezeAt(base);
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        for (UUID id : created) {
            jdbc.update("delete from section_change where user_id = ?", id);
        }
        created.clear();
    }

    @Test
    @DisplayName("a move writes one audit row, changes section and country, and keeps the status")
    void happyPath() throws Exception {
        AppUser me = account(first());
        Section target = second();

        change(me, target.getId().toString())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.section.id").value(target.getId().toString()))
                .andExpect(jsonPath("$.section.name").value(target.getName()))
                // [D11] Country comes with it; it is not a field anyone picked.
                .andExpect(jsonPath("$.section.country").value(target.getCountry().getName()))
                // [D7] No re-approval, ever.
                .andExpect(jsonPath("$.status").value("approved"));

        assertThat(changes(me)).singleElement().satisfies(row -> {
            assertThat(row.get("from_section_id")).isEqualTo(first().getId());
            assertThat(row.get("to_section_id")).isEqualTo(target.getId());
        });
        assertThat(users.findById(me.getId()).orElseThrow().getSection().getId())
                .isEqualTo(target.getId());
    }

    @Test
    @DisplayName("the move moves sectionChangeAvailableAt to 30 days out [D7]")
    void settingsReportTheNewCooldown() throws Exception {
        AppUser me = account(first());

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(jsonPath("$.sectionChangeAvailableAt").doesNotExist());

        change(me, second().getId().toString()).andExpect(status().isOk());

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sectionChangeAvailableAt")
                        .value(base.plus(30, ChronoUnit.DAYS).toString()));
    }

    @Test
    @DisplayName("an unknown section and a string that was never an id are both 422 on sectionId")
    void unknownSectionIsValidation() throws Exception {
        AppUser me = account(first());

        change(me, UUID.randomUUID().toString())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("sectionId"));
        change(me, "not-a-uuid")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("sectionId"));
        change(me, null)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("sectionId"));

        assertThat(changes(me)).isEmpty();
    }

    @Test
    @DisplayName("picking the section I am already in is a no-op: no audit row, no cooldown spent")
    void sameSectionIsANoOp() throws Exception {
        AppUser me = account(first());

        change(me, first().getId().toString())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.section.id").value(first().getId().toString()));

        assertThat(changes(me)).isEmpty();
        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(jsonPath("$.sectionChangeAvailableAt").doesNotExist());
    }

    @Test
    @DisplayName("the 30-day boundary is inclusive: 429 one second before, 200 on it")
    void cooldownBoundary() throws Exception {
        AppUser me = account(first());
        Section second = second();
        Section third = third();

        change(me, second.getId().toString()).andExpect(status().isOk());

        Instant boundary = base.plus(30, ChronoUnit.DAYS);

        clock.freezeAt(boundary.minusSeconds(1));
        change(me, third.getId().toString())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("section_change_limited"));
        // Refused means nothing happened: still in the section they moved to.
        assertThat(users.findById(me.getId()).orElseThrow().getSection().getId())
                .isEqualTo(second.getId());

        clock.freezeAt(boundary);
        change(me, third.getId().toString())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.section.id").value(third.getId().toString()));
        assertThat(changes(me)).hasSize(2);
    }

    @Test
    @DisplayName("a same-section tap inside the cooldown is still a 200, not a 429")
    void noOpIsNotRateLimited() throws Exception {
        AppUser me = account(first());
        Section second = second();

        change(me, second.getId().toString()).andExpect(status().isOk());
        change(me, second.getId().toString()).andExpect(status().isOk());

        assertThat(changes(me)).hasSize(1);
    }

    @Test
    @DisplayName("a pending account is refused before the rule is even reached")
    void pendingIsRefused() throws Exception {
        AppUser pending = account(first());
        pending.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(pending);

        change(pending, second().getId().toString())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    /* -------------------------------------------------------------- helpers */

    private ResultActions change(AppUser me, String sectionId) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("sectionId", sectionId);
        return mockMvc.perform(put("/me/section")
                .header(HttpHeaders.AUTHORIZATION, bearer(me))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private List<Map<String, Object>> changes(AppUser me) {
        return jdbc.queryForList(
                "select * from section_change where user_id = ? order by changed_at asc", me.getId());
    }

    private Section first() {
        return ordered().get(0);
    }

    private Section second() {
        return ordered().get(1);
    }

    private Section third() {
        return ordered().get(2);
    }

    private List<Section> ordered() {
        return sections.findAll().stream().sorted(Comparator.comparing(Section::getName)).toList();
    }

    private AppUser account(Section section) {
        AppUser user = AppUser.register(
                "section-change-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash",
                null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName("Deniz");
        user.setSection(section);
        AppUser saved = users.saveAndFlush(user);
        created.add(saved.getId());
        return saved;
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }
}
