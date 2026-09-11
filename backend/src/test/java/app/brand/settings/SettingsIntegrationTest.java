package app.brand.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.safety.Block;
import app.brand.safety.BlockService;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * {@code /me/settings} and {@code /me/blocks} — BACKEND_PLAN.md §3 "Settings",
 * which is {@code mock.ts}'s {@code updateSettings} rule for rule.
 *
 * <p>The three that carry the product decisions: the patch is <b>atomic</b>, so a
 * rejected field leaves nothing behind; muted words are Turkish-folded the way
 * {@code app/src/utils/text.ts} folds them, and they are <b>forward-looking</b>
 * [D10] — nothing already delivered moves; and a blocked-list row is rendered
 * from the identity frozen on the block [D6], so an anonymous block is still an
 * anonymous row after the sender has changed section or been renamed.
 */
class SettingsIntegrationTest extends AbstractIntegrationTest {

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

    @Autowired
    private BlockService blocks;

    /** Only the rows this class made: the suite shares one database. */
    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void unfreezeTheClockAndClearMyRows() {
        clock.reset();
        for (UUID id : created) {
            jdbc.update("delete from block where blocker_id = ? or blocked_id = ?", id, id);
            jdbc.update("delete from section_change where user_id = ?", id);
            jdbc.update("delete from inbox_message where sender_id = ? or recipient_id = ?", id, id);
        }
        created.clear();
    }

    /* ------------------------------------------------------- GET /me/settings */

    @Test
    @DisplayName("a fresh account reads the defaults, and sectionChangeAvailableAt is a literal null")
    void defaults() throws Exception {
        AppUser me = account();

        MvcResult result = mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writingPolicy").value("anyone"))
                .andExpect(jsonPath("$.mutedWords").isArray())
                .andExpect(jsonPath("$.mutedWords").isEmpty())
                .andExpect(jsonPath("$.notifications.inbox").value(true))
                .andExpect(jsonPath("$.notifications.threads").value(true))
                .andExpect(jsonPath("$.notifications.boardMentions").value(true))
                .andReturn();

        // `string | null` in settings.ts, not an optional key: the field has to be
        // in the body even though Jackson's global inclusion is non_null.
        assertThat(result.getResponse().getContentAsString())
                .contains("\"sectionChangeAvailableAt\":null");
    }

    @Test
    @DisplayName("sectionChangeAvailableAt is the last section change plus 30 days [D7]")
    void sectionChangeCooldown() throws Exception {
        AppUser me = account();
        Instant changedAt = Instant.parse("2026-03-01T12:00:00Z");
        // Frozen well past the cooldown: the field is the cooldown's end, not a
        // countdown, and it keeps its value once the 30 days have run out.
        clock.freezeAt(changedAt.plus(90, ChronoUnit.DAYS));
        sectionChange(me, changedAt);

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sectionChangeAvailableAt").value("2026-03-31T12:00:00Z"));
    }

    /* ----------------------------------------------------- PATCH /me/settings */

    @Test
    @DisplayName("writingPolicy alone leaves the other fields where they were")
    void patchPolicyAlone() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("mutedWords", List.of("erasmus"), "notifications",
                Map.of("inbox", false, "threads", true, "boardMentions", false)));

        mockMvc.perform(patchRequest(me, Map.of("writingPolicy", "named_only")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writingPolicy").value("named_only"))
                .andExpect(jsonPath("$.mutedWords[0]").value("erasmus"))
                .andExpect(jsonPath("$.notifications.inbox").value(false))
                .andExpect(jsonPath("$.notifications.boardMentions").value(false));
    }

    @Test
    @DisplayName("mutedWords alone leaves the policy and the notifications where they were")
    void patchWordsAlone() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("writingPolicy", "nobody"));

        mockMvc.perform(patchRequest(me, Map.of("mutedWords", List.of("  Party  ", "noise"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writingPolicy").value("nobody"))
                .andExpect(jsonPath("$.mutedWords[0]").value("party"))
                .andExpect(jsonPath("$.mutedWords[1]").value("noise"))
                .andExpect(jsonPath("$.notifications.inbox").value(true));

        assertThat(storedNormalized(me)).containsExactly("party", "noise");
    }

    @Test
    @DisplayName("notifications alone leaves the policy and the words where they were")
    void patchNotificationsAlone() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("writingPolicy", "named_only", "mutedWords", List.of("izmir")));

        mockMvc.perform(patchRequest(me, Map.of("notifications",
                        Map.of("inbox", false, "threads", false, "boardMentions", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writingPolicy").value("named_only"))
                .andExpect(jsonPath("$.mutedWords[0]").value("izmir"))
                .andExpect(jsonPath("$.notifications.inbox").value(false))
                .andExpect(jsonPath("$.notifications.threads").value(false))
                .andExpect(jsonPath("$.notifications.boardMentions").value(true));
    }

    @Test
    @DisplayName("an unknown writing policy is 422 on writingPolicy and saves nothing")
    void invalidPolicySavesNothing() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("writingPolicy", "nobody"));

        rejected(me, Map.of("writingPolicy", "friends_only", "mutedWords", List.of("later")),
                "writingPolicy");

        // The words in the same body must not have survived the rejection.
        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(jsonPath("$.writingPolicy").value("nobody"))
                .andExpect(jsonPath("$.mutedWords").isEmpty());
    }

    @Test
    @DisplayName("101 muted words is 422 on mutedWords and saves nothing")
    void tooManyWords() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("mutedWords", List.of("keep")));

        List<String> words = IntStream.range(0, 101).mapToObj(i -> "word" + i).toList();
        rejected(me, Map.of("writingPolicy", "nobody", "mutedWords", words), "mutedWords");

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(jsonPath("$.writingPolicy").value("anyone"))
                .andExpect(jsonPath("$.mutedWords[0]").value("keep"))
                .andExpect(jsonPath("$.mutedWords[1]").doesNotExist());

        // 100 is the limit, not the first refusal.
        patchOk(me, Map.of("mutedWords", words.subList(0, 100)));
        assertThat(storedWords(me)).hasSize(100);
    }

    @Test
    @DisplayName("a 41-character word is 422 on mutedWords; 40 is fine")
    void wordTooLong() throws Exception {
        AppUser me = account();
        rejected(me, Map.of("mutedWords", List.of("a".repeat(41))), "mutedWords");
        assertThat(storedWords(me)).isEmpty();

        patchOk(me, Map.of("mutedWords", List.of("a".repeat(40))));
        assertThat(storedWords(me)).containsExactly("a".repeat(40));
    }

    @Test
    @DisplayName("a word that normalises to nothing is 422 on mutedWords")
    void wordNormalisesToEmpty() throws Exception {
        AppUser me = account();

        rejected(me, Map.of("mutedWords", List.of("  ")), "mutedWords");
        // Combining marks only: TextNormalizer strips U+0300–U+036F, so this word
        // could never match anything — storing it would be a control nobody can see.
        rejected(me, Map.of("mutedWords", List.of("́̂")), "mutedWords");
        assertThat(storedWords(me)).isEmpty();
    }

    @Test
    @DisplayName("a non-boolean notification is 422 on notifications, and a missing key too")
    void invalidNotifications() throws Exception {
        AppUser me = account();
        patchOk(me, Map.of("writingPolicy", "named_only"));

        Map<String, Object> notBoolean = new HashMap<>();
        notBoolean.put("inbox", "yes");
        notBoolean.put("threads", true);
        notBoolean.put("boardMentions", true);
        rejected(me, Map.of("notifications", notBoolean), "notifications");

        // All three keys are required when the object is present.
        rejected(me, Map.of("notifications", Map.of("inbox", true)), "notifications");

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(jsonPath("$.writingPolicy").value("named_only"))
                .andExpect(jsonPath("$.notifications.inbox").value(true))
                .andExpect(jsonPath("$.notifications.threads").value(true))
                .andExpect(jsonPath("$.notifications.boardMentions").value(true));
    }

    @Test
    @DisplayName("muted words fold Turkish the way the app folds them, and de-duplicate on the folded form")
    void turkishWords() throws Exception {
        AppUser me = account();

        mockMvc.perform(patchRequest(me, Map.of("mutedWords",
                        List.of("İZMİR", "izmir", "Boğaziçi", "BOGAZICI"))))
                .andExpect(status().isOk())
                // Dotted capital İ lowercases to plain i, so "İZMİR" and "izmir" are
                // one word, and "Boğaziçi" keeps its diacritics in what is shown back.
                .andExpect(jsonPath("$.mutedWords[0]").value("izmir"))
                .andExpect(jsonPath("$.mutedWords[1]").value("boğaziçi"))
                .andExpect(jsonPath("$.mutedWords[2]").doesNotExist());

        assertThat(storedWords(me)).containsExactly("izmir", "boğaziçi");
        assertThat(storedNormalized(me)).containsExactly("izmir", "bogazici");

        // Capital I is the dotless ı, not i: "Işık" is "ışık", never "işik".
        patchOk(me, Map.of("mutedWords", List.of("Işık")));
        assertThat(storedWords(me)).containsExactly("ışık");
        assertThat(storedNormalized(me)).containsExactly("isik");
    }

    @Test
    @DisplayName("[D10] a new muted word changes nothing that was already delivered")
    void mutedWordsAreForwardLookingOnly() throws Exception {
        AppUser me = account();
        AppUser sender = account();
        UUID messageId = deliveredMessage(sender, me, "the party was loud");

        patchOk(me, Map.of("mutedWords", List.of("party")));

        Map<String, Object> row = jdbc.queryForMap(
                "select state, muted_match, push_suppressed, deleted_at from inbox_message where id = ?",
                messageId);
        assertThat(row.get("state")).isEqualTo("new");
        assertThat(row.get("muted_match")).isEqualTo(false);
        assertThat(row.get("push_suppressed")).isEqualTo(false);
        assertThat(row.get("deleted_at")).isNull();
    }

    /* ---------------------------------------------------------- /me/blocks */

    @Test
    @DisplayName("the blocked list renders each row at the level frozen on the block, newest first [D6]")
    void blockedList() throws Exception {
        Section section = sectionNamed("ESN Ankara");
        AppUser me = account();
        AppUser anonymousOne = account(section, "Ada");
        AppUser sectionHint = account(section, "Berk");
        AppUser countryHint = account(section, "Cem");
        AppUser letterHint = account(section, "Zeynep");
        AppUser named = account(section, "Deniz");

        Instant base = Instant.parse("2026-05-01T10:00:00Z");
        clock.freezeAt(base);
        blocks.block(me.getId(), anonymousOne.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, section.getId()));
        clock.freezeAt(base.plusSeconds(1));
        blocks.block(me.getId(), sectionHint.getId(), Anonymity.from(
                AnonymityLevel.HINT, new AllowedHints(true, false, false), section.getId()));
        clock.freezeAt(base.plusSeconds(2));
        blocks.block(me.getId(), countryHint.getId(), Anonymity.from(
                AnonymityLevel.HINT, new AllowedHints(false, true, false), section.getId()));
        clock.freezeAt(base.plusSeconds(3));
        blocks.block(me.getId(), letterHint.getId(), Anonymity.from(
                AnonymityLevel.HINT, new AllowedHints(false, false, true), section.getId()));
        clock.freezeAt(base.plusSeconds(4));
        blocks.block(me.getId(), named.getId(),
                Anonymity.from(AnonymityLevel.NAMED, AllowedHints.NONE, section.getId()));

        JsonNode list = json(mockMvc.perform(get("/me/blocks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andReturn());

        assertThat(list).hasSize(5);
        // Newest first.
        assertThat(list.get(0).get("sender").get("level").asText()).isEqualTo("named");
        assertThat(list.get(0).get("sender").get("name").asText()).isEqualTo("Deniz");

        JsonNode letter = list.get(1).get("sender");
        assertThat(letter.get("level").asText()).isEqualTo("hint");
        assertThat(letter.get("hints").get("letter").asText()).isEqualTo("Z");
        assertThat(letter.get("hints").has("section")).isFalse();

        JsonNode country = list.get(2).get("sender");
        assertThat(country.get("hints").get("country").asText()).isEqualTo("Türkiye");
        assertThat(country.get("hints").has("section")).isFalse();

        JsonNode sectionOnly = list.get(3).get("sender");
        assertThat(sectionOnly.get("hints").get("section").asText()).isEqualTo("ESN Ankara");
        assertThat(sectionOnly.get("hints").has("country")).isFalse();

        JsonNode anonymous = list.get(4).get("sender");
        assertThat(anonymous.get("level").asText()).isEqualTo("anonymous");
        assertThat(anonymous.has("name")).isFalse();
        assertThat(anonymous.has("hints")).isFalse();

        // Not one user id anywhere: the id is the block row's own [D6].
        for (JsonNode entry : list) {
            assertThat(entry.get("id").asText()).isNotEqualTo(anonymousOne.getId().toString());
        }
        assertThat(list.toString()).doesNotContain("senderId").doesNotContain("blockedId");
    }

    @Test
    @DisplayName("an anonymous block stays anonymous after the blocked person is renamed")
    void anonymousBlockNeverBecomesNamed() throws Exception {
        Section section = sectionNamed("ESN Ege");
        AppUser me = account();
        AppUser other = account(section, "Before");

        blocks.block(me.getId(), other.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, section.getId()));
        other.setName("After");
        users.saveAndFlush(other);

        mockMvc.perform(get("/me/blocks").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sender.level").value("anonymous"))
                .andExpect(jsonPath("$[0].sender.name").doesNotExist());
    }

    @Test
    @DisplayName("a hint row keeps the snapshot section after the blocked person changes section [B4]")
    void hintKeepsTheSnapshotSection() throws Exception {
        Section before = sectionNamed("ESN Bilkent");
        Section after = sectionNamed("ESN Marmara");
        AppUser me = account();
        AppUser other = account(before, "Elif");

        blocks.block(me.getId(), other.getId(), Anonymity.from(
                AnonymityLevel.HINT, new AllowedHints(true, false, false), before.getId()));
        other.setSection(after);
        users.saveAndFlush(other);

        mockMvc.perform(get("/me/blocks").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sender.hints.section").value("ESN Bilkent"));
    }

    @Test
    @DisplayName("unblocking my own row is 204 and the row is gone")
    void unblockOwn() throws Exception {
        AppUser me = account();
        AppUser other = account();
        Block block = blocks.block(me.getId(), other.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, null));

        mockMvc.perform(delete("/me/blocks/" + block.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/me/blocks").header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        assertThat(blocks.isBlocked(me.getId(), other.getId())).isFalse();
    }

    @Test
    @DisplayName("someone else's block, an unknown id and a malformed id are all 404")
    void unblockOthersIs404() throws Exception {
        AppUser me = account();
        AppUser stranger = account();
        AppUser other = account();
        Block theirs = blocks.block(stranger.getId(), other.getId(),
                Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, null));

        mockMvc.perform(delete("/me/blocks/" + theirs.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mockMvc.perform(delete("/me/blocks/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isNotFound());
        // Not a parse error: the id space must not be probeable.
        mockMvc.perform(delete("/me/blocks/not-a-uuid")
                        .header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isNotFound());

        assertThat(blocks.isBlocked(stranger.getId(), other.getId())).isTrue();
    }

    /* --------------------------------------------------------------- access */

    @Test
    @DisplayName("a pending account gets 403 approval_required on all four routes")
    void pendingIsRefused() throws Exception {
        AppUser pending = account();
        pending.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(pending);
        String token = bearer(pending);

        mockMvc.perform(get("/me/settings").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
        mockMvc.perform(patchRequest(pending, Map.of("writingPolicy", "nobody")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
        mockMvc.perform(get("/me/blocks").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
        mockMvc.perform(delete("/me/blocks/" + UUID.randomUUID()).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("approval_required"));
    }

    /* -------------------------------------------------------------- helpers */

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder patchRequest(
            AppUser me, Map<String, Object> body) throws Exception {
        return patch("/me/settings")
                .header(HttpHeaders.AUTHORIZATION, bearer(me))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body));
    }

    private void patchOk(AppUser me, Map<String, Object> body) throws Exception {
        mockMvc.perform(patchRequest(me, body)).andExpect(status().isOk());
    }

    private void rejected(AppUser me, Map<String, Object> body, String field) throws Exception {
        mockMvc.perform(patchRequest(me, body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private List<String> storedWords(AppUser me) {
        return storedArray(me, "muted_words");
    }

    private List<String> storedNormalized(AppUser me) {
        return storedArray(me, "muted_words_normalized");
    }

    /** No row at all reads as empty: a rejected patch must not have created one. */
    private List<String> storedArray(AppUser me, String column) {
        List<String[]> rows = jdbc.query(
                "select " + column + " from user_settings where user_id = ?",
                (rs, row) -> (String[]) rs.getArray(1).getArray(), me.getId());
        return rows.isEmpty() || rows.get(0) == null ? List.of() : Arrays.asList(rows.get(0));
    }

    private void sectionChange(AppUser me, Instant changedAt) {
        Section to = me.getSection();
        jdbc.update("""
                insert into section_change (user_id, from_section_id, to_section_id, changed_at)
                values (?, ?, ?, ?)
                """, me.getId(), to.getId(), to.getId(), java.sql.Timestamp.from(changedAt));
    }

    /** A message that is already in the inbox — nothing a later muted word may touch. */
    private UUID deliveredMessage(AppUser sender, AppUser recipient, String text) {
        return jdbc.queryForObject("""
                        insert into inbox_message (sender_id, recipient_id, text, anonymity_level, state)
                        values (?, ?, ?, 'anonymous', 'new')
                        returning id
                        """, UUID.class, sender.getId(), recipient.getId(), text);
    }

    private AppUser account() {
        return account(anySection(), "Member " + UUID.randomUUID().toString().substring(0, 4));
    }

    private AppUser account(Section section, String name) {
        AppUser user = AppUser.register(
                "settings-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
        user.setName(name);
        user.setSection(section);
        AppUser saved = users.saveAndFlush(user);
        created.add(saved.getId());
        return saved;
    }

    private Section anySection() {
        return sections.findAll().stream().min(Comparator.comparing(Section::getName)).orElseThrow();
    }

    private Section sectionNamed(String name) {
        return sections.findAll().stream()
                .filter(section -> section.getName().equals(name))
                .findFirst()
                .orElseThrow();
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
