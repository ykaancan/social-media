package app.brand.message;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.common.TextNormalizer;
import app.brand.safety.KeywordScreener;
import app.brand.safety.Report;
import app.brand.safety.ReportRepository;
import app.brand.realtime.ThreadsChanged;
import app.brand.safety.ScreeningTerm;
import app.brand.safety.ScreeningTermRepository;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.UserSettings;
import app.brand.user.UserSettingsRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The inbox and the wall — BACKEND_PLAN.md §3 "Walls and inbox", which is
 * {@code mock.ts}'s behaviour, and {@code app/src/api/__tests__/messages.test.ts}
 * is the same suite written against the mock.
 *
 * <p>The cases worth naming: a refused send is one 403 with one code, whichever
 * rule refused it, so the endpoint cannot be used to read a stranger's settings;
 * a muted word delivers, files privately and suppresses the push while the sender
 * still gets {@code accepted:true} [D10]; blocking is by message id and hides the
 * sender's other cards from the blocker without deleting anything [D6]; and a
 * soft-deleted message survives for the report filed against it [D12].
 */
@RecordApplicationEvents
class MessageIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private UserSettingsRepository settings;

    @Autowired
    private ScreeningTermRepository terms;

    @Autowired
    private KeywordScreener screener;

    @Autowired
    private InboxMessageRepository inboxMessages;

    @Autowired
    private ReportRepository reports;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    @Autowired
    private ApplicationEvents applicationEvents;

    /** B-3 calls this directly for a board post addressed to a person. */
    @Autowired
    private MessageService messageService;

    /** Frozen so "newest first" is a fact about the rows, not a race on the clock. */
    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        clock.freezeAt(base);
    }

    /**
     * {@code SchemaMigrationTest} proves nothing is seeded (principle 4) by counting
     * these tables, so every test that writes to them clears up after itself.
     */
    @AfterEach
    void clearUp() {
        clock.reset();
        terms.deleteAll();
        screener.invalidate();
        jdbc.update("delete from report");
        jdbc.update("delete from block");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'wall-%')");
    }

    /* ------------------------------------------------------- GET /me/inbox */

    @Test
    @DisplayName("the inbox is newest first, and the counts are over exactly that list")
    void inboxIsNewestFirstWithHonestCounts() throws Exception {
        Fixture f = fixture();

        sendAt(f.sender, note(f.eventId, f.owner, "First", "anonymous"), 1);
        sendAt(f.sender, note(f.eventId, f.owner, "Second", "anonymous"), 2);
        sendAt(f.sender, note(f.eventId, f.owner, "Third", "anonymous"), 3);

        JsonNode snapshot = inbox(f.owner);
        assertThat(texts(snapshot.get("messages"))).containsExactly("Third", "Second", "First");
        assertThat(counts(snapshot)).isEqualTo(Map.of("new", 3, "private", 0, "approved", 0));

        // Source is the event the message was written from; stage 1 always has one.
        assertThat(snapshot.get("messages").get(0).get("source").get("eventId").asText())
                .isEqualTo(f.eventId.toString());
        assertThat(snapshot.get("messages").get(0).get("source").get("name").asText())
                .isEqualTo("Welcome night");
        assertThat(snapshot.get("messages").get(0).get("approvedFromBoard").asBoolean()).isFalse();

        // The counts follow the cards, in both directions [D12].
        String id = snapshot.get("messages").get(0).get("id").asText();
        setState(f.owner, id, "approved").andExpect(status().isOk());
        assertThat(counts(inbox(f.owner))).isEqualTo(Map.of("new", 2, "private", 0, "approved", 1));
    }

    @Test
    @DisplayName("no DTO carries the sender id, the hint booleans or anything internal")
    void dtosCarryNothingInternal() throws Exception {
        Fixture f = fixture();
        mute(f.owner, "yasak");
        sendAt(f.sender, hintNote(f.eventId, f.owner, "yasak kelime", true, true, true), 1);
        sendAt(f.sender, note(f.eventId, f.owner, "Merhaba", "named"), 2);

        String id = inbox(f.owner).get("messages").get(0).get("id").asText();
        setState(f.owner, id, "approved");

        for (String body : List.of(inbox(f.owner).toString(), wall(f.owner, f.eventId, f.owner).toString())) {
            assertThat(body)
                    .doesNotContain("senderId").doesNotContain("sender_id")
                    .doesNotContain("recipientId")
                    .doesNotContain("hintSection").doesNotContain("hintCountry").doesNotContain("hintLetter")
                    .doesNotContain("mutedMatch").doesNotContain("pushSuppressed")
                    .doesNotContain("screeningFlag").doesNotContain("deletedAt");
        }
    }

    /* --------------------------------------------- hidden: deleted, blocked */

    @Test
    @DisplayName("a soft-deleted message leaves the inbox, the counts, the wall and every lookup")
    void softDeletedIsHiddenEverywhere() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "On the wall", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();
        setState(f.owner, id, "approved");

        mockMvc.perform(delete("/me/inbox/" + id).header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNoContent());

        assertThat(inbox(f.owner).get("messages")).isEmpty();
        assertThat(counts(inbox(f.owner))).isEqualTo(Map.of("new", 0, "private", 0, "approved", 0));
        assertThat(wall(f.owner, f.eventId, f.owner).get("count").asInt()).isZero();

        // Every by-id route is 404 now, not a 200 on a hidden row.
        setState(f.owner, id, "new").andExpect(status().isNotFound());
        mockMvc.perform(delete("/me/inbox/" + id).header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNotFound());
        report(f.owner, id, "spam").andExpect(status().isNotFound());
        block(f.owner, id).andExpect(status().isNotFound());

        // Hidden, not destroyed [D12]: the row is still there for a report to reach.
        assertThat(jdbc.queryForObject("select count(*) from inbox_message where id = ?::uuid",
                Integer.class, id)).isEqualTo(1);
    }

    @Test
    @DisplayName("blocking by message id hides that sender's other cards and refuses their next send")
    void blockByMessageHidesAndRefuses() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "First", "anonymous"), 1);
        sendAt(f.sender, note(f.eventId, f.owner, "Second", "anonymous"), 2);
        AppUser other = approved(f.sectionA, "Other");
        join(f.eventId, other.getId());
        sendAt(other, note(f.eventId, f.owner, "From someone else", "named"), 3);

        List<JsonNode> cards = list(inbox(f.owner).get("messages"));
        String newest = cards.get(1).get("id").asText();
        String oldest = cards.get(2).get("id").asText();
        setState(f.owner, oldest, "approved");
        report(f.owner, oldest, "spam").andExpect(status().isNoContent());

        block(f.owner, newest).andExpect(status().isNoContent());

        // Both of that sender's messages are gone from this reader's surfaces; the
        // third person's card is untouched.
        assertThat(texts(inbox(f.owner).get("messages"))).containsExactly("From someone else");
        assertThat(counts(inbox(f.owner))).isEqualTo(Map.of("new", 1, "private", 0, "approved", 0));
        assertThat(wall(f.owner, f.eventId, f.owner).get("count").asInt()).isZero();

        // [D6] Nothing was deleted, and the report filed before the block survives.
        assertThat(inboxMessages.count()).isEqualTo(3);
        assertThat(reports.count()).isEqualTo(1);

        // The blocked sender is refused from now on, and is never told why.
        refused(f.sender, note(f.eventId, f.owner, "Again", "anonymous"));

        // Blocked by the message's own anonymity snapshot: an anonymous card blocks
        // anonymously, so the Blocked list can never name the person.
        assertThat(jdbc.queryForObject("select display_level from block where blocker_id = ?",
                String.class, f.owner.getId())).isEqualTo("anonymous");
    }

    /* -------------------------------- GET /events/{id}/people/{id}/wall */

    @Test
    @DisplayName("a wall needs both people on the board, and the target approved; everything else is 404")
    void wallAccessIs404ForEverythingElse() throws Exception {
        Fixture f = fixture();

        AppUser outsider = approved(f.sectionA, "Outsider");
        mockMvc.perform(get(wallPath(f.eventId, f.owner.getId()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(outsider)))
                .andExpect(status().isNotFound());

        AppUser notOnTheBoard = approved(f.sectionA, "Elsewhere");
        mockMvc.perform(get(wallPath(f.eventId, notOnTheBoard.getId()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNotFound());

        AppUser pending = account(f.sectionA, "Waiting", AccountStatus.PENDING);
        join(f.eventId, pending.getId());
        mockMvc.perform(get(wallPath(f.eventId, pending.getId()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNotFound());

        // A malformed id is not an event or a person anyone has, not a 500.
        mockMvc.perform(get("/events/not-an-id/people/" + f.owner.getId() + "/wall")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/events/" + f.eventId + "/people/not-an-id/wall")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the wall is exactly the approved cards, with no state on them")
    void wallShowsApprovedOnlyAndNoState() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Published", "anonymous"), 1);
        sendAt(f.sender, note(f.eventId, f.owner, "Still private", "anonymous"), 2);
        List<JsonNode> cards = list(inbox(f.owner).get("messages"));
        setState(f.owner, cards.get(1).get("id").asText(), "approved");
        setState(f.owner, cards.get(0).get("id").asText(), "private");

        JsonNode wall = wall(f.sender, f.eventId, f.owner);
        assertThat(texts(wall.get("messages"))).containsExactly("Published");
        assertThat(wall.get("count").asInt()).isEqualTo(1);
        assertThat(wall.get("messages").get(0).has("state")).isFalse();
        assertThat(wall.get("isOwner").asBoolean()).isFalse();
        assertThat(wall.get("writingPolicy").asText()).isEqualTo("anyone");
        assertThat(wall.get("person").get("id").asText()).isEqualTo(f.owner.getId().toString());
        assertThat(wall.get("person").get("section").get("name").asText()).isEqualTo(f.sectionA.getName());

        // The owner's own wall says so, and reads the owner's own policy.
        policy(f.owner, "named_only");
        JsonNode own = wall(f.owner, f.eventId, f.owner);
        assertThat(own.get("isOwner").asBoolean()).isTrue();
        assertThat(own.get("writingPolicy").asText()).isEqualTo("named_only");
    }

    /* --------------------------------------------------- POST /messages/wall */

    @Test
    @DisplayName("every refused delivery is the same 403 with the same code")
    void everyRefusalLooksIdentical() throws Exception {
        Fixture f = fixture();

        // Recipient missing, or not approved.
        Map<String, Object> unknown = note(f.eventId, f.owner, "Hello", "anonymous");
        unknown.put("recipientId", UUID.randomUUID().toString());
        refused(f.sender, unknown);
        AppUser pending = account(f.sectionA, "Waiting", AccountStatus.PENDING);
        join(f.eventId, pending.getId());
        refused(f.sender, note(f.eventId, pending, "Hello", "anonymous"));

        // Yourself.
        refused(f.sender, note(f.eventId, f.sender, "Hello", "anonymous"));

        // Sender not on this board.
        AppUser outsider = approved(f.sectionA, "Outsider");
        refused(outsider, note(f.eventId, f.owner, "Hello", "anonymous"));

        // Recipient not on this board.
        AppUser elsewhere = approved(f.sectionA, "Elsewhere");
        refused(f.sender, note(f.eventId, elsewhere, "Hello", "anonymous"));

        // An event that does not exist, and a malformed id.
        Map<String, Object> noEvent = note(f.eventId, f.owner, "Hello", "anonymous");
        noEvent.put("eventId", UUID.randomUUID().toString());
        refused(f.sender, noEvent);
        noEvent.put("eventId", "not-an-id");
        refused(f.sender, noEvent);

        // The recipient's policy.
        policy(f.owner, "nobody");
        refused(f.sender, note(f.eventId, f.owner, "Hello", "named"));
        policy(f.owner, "named_only");
        refused(f.sender, note(f.eventId, f.owner, "Hello", "anonymous"));
        refused(f.sender, hintNote(f.eventId, f.owner, "Hello", true, false, false));
        sendAt(f.sender, note(f.eventId, f.owner, "Hello", "named"), 1);
    }

    @Test
    @DisplayName("validation names its field, and runs only after the delivery rules")
    void validationNamesItsField() throws Exception {
        Fixture f = fixture();

        invalid(f.sender, note(f.eventId, f.owner, "   ", "anonymous"), "text");
        invalid(f.sender, note(f.eventId, f.owner, "x".repeat(281), "anonymous"), "text");
        invalid(f.sender, note(f.eventId, f.owner, "Hello", "secret"), "anonymityLevel");
        invalid(f.sender, note(f.eventId, f.owner, "Hello", null), "anonymityLevel");
        invalid(f.sender, hintNote(f.eventId, f.owner, "Hello", false, false, false), "allowedHints");

        // 280 exactly is fine, and the text is stored trimmed.
        sendAt(f.sender, note(f.eventId, f.owner, "  " + "y".repeat(280) + "  ", "anonymous"), 1);
        assertThat(inbox(f.owner).get("messages").get(0).get("text").asText())
                .isEqualTo("y".repeat(280));

        // A refusal still wins over a validation error: an outsider probing with a
        // deliberately invalid body learns nothing about the recipient.
        AppUser outsider = approved(f.sectionA, "Outsider");
        refused(outsider, note(f.eventId, f.owner, "", "secret"));
    }

    @Test
    @DisplayName("chips come from the section snapshot, the name from the live row [B4]")
    void hintsComeFromTheSnapshotAndTheNameIsLive() throws Exception {
        Fixture f = fixture();

        sendAt(f.sender, note(f.eventId, f.owner, "Nothing at all", "anonymous"), 1);
        sendAt(f.sender, hintNote(f.eventId, f.owner, "A few chips", true, true, true), 2);
        sendAt(f.sender, note(f.eventId, f.owner, "All of me", "named"), 3);

        // The sender moves section [D7] and changes their name, after sending.
        AppUser sender = users.findById(f.sender.getId()).orElseThrow();
        sender.setSection(f.sectionB);
        sender.setName("Zeynep Acar");
        users.saveAndFlush(sender);

        List<JsonNode> cards = list(inbox(f.owner).get("messages"));

        JsonNode anonymous = cards.get(2).get("sender");
        assertThat(anonymous.get("level").asText()).isEqualTo("anonymous");
        assertThat(anonymous.has("name")).isFalse();
        assertThat(anonymous.has("hints")).isFalse();

        // The section chip is still the section they were in when they sent, and the
        // country is that section's country [D11] — history is not rewritten.
        JsonNode hint = cards.get(1).get("sender");
        assertThat(hint.get("level").asText()).isEqualTo("hint");
        assertThat(hint.get("hints").get("section").asText()).isEqualTo(f.sectionA.getName());
        assertThat(hint.get("hints").get("country").asText())
                .isEqualTo(f.sectionA.getCountry().getName());
        assertThat(hint.has("name")).isFalse();
        // The letter is live: "named" and "letter" both mean this person, and a
        // renamed person is still that person.
        assertThat(hint.get("hints").get("letter").asText()).isEqualTo("Z");

        JsonNode named = cards.get(0).get("sender");
        assertThat(named.get("level").asText()).isEqualTo("named");
        assertThat(named.get("name").asText()).isEqualTo("Zeynep Acar");
        assertThat(named.has("hints")).isFalse();

        // And only the chips that were allowed are there.
        sendAt(f.sender, hintNote(f.eventId, f.owner, "Only a section", true, false, false), 4);
        JsonNode only = inbox(f.owner).get("messages").get(0).get("sender").get("hints");
        assertThat(only.has("section")).isTrue();
        assertThat(only.has("country")).isFalse();
        assertThat(only.has("letter")).isFalse();
    }

    @Test
    @DisplayName("[D10] a muted word delivers, files privately, kills the push and tells no one")
    void mutedWordFilesPrivatelyAndSuppressesPush() throws Exception {
        Fixture f = fixture();
        mute(f.owner, "çiğ");

        // Turkish-aware, case-insensitive, substring — and the sender's answer is the
        // ordinary one.
        sendAt(f.sender, note(f.eventId, f.owner, "ÇIĞLIK", "anonymous"), 1);

        assertThat(counts(inbox(f.owner))).isEqualTo(Map.of("new", 0, "private", 1, "approved", 0));

        InboxMessage stored = inboxMessages.findAll().get(0);
        assertThat(stored.getState()).isEqualTo(MessageState.PRIVATE);
        assertThat(stored.isMutedMatch()).isTrue();
        assertThat(stored.isPushSuppressed()).isTrue();
        // Screening never saw it: muted words are not a delivery rule.
        assertThat(stored.getScreeningFlag()).isNull();

        // The delivered event carries the suppression, so B-5 cannot push it by accident.
        InboxMessageDelivered delivered =
                applicationEvents.stream(InboxMessageDelivered.class).findFirst().orElseThrow();
        assertThat(delivered.pushSuppressed()).isTrue();
        assertThat(delivered.recipientId()).isEqualTo(f.owner.getId());
    }

    @Test
    @DisplayName("a recipient with inbox push off still gets the message, just not the notification")
    void notificationToggleOnlySuppressesThePush() throws Exception {
        Fixture f = fixture();
        notifyInbox(f.owner, false);

        sendAt(f.sender, note(f.eventId, f.owner, "Quietly", "anonymous"), 1);

        InboxMessage stored = inboxMessages.findAll().get(0);
        assertThat(stored.getState()).isEqualTo(MessageState.NEW);
        assertThat(stored.isMutedMatch()).isFalse();
        assertThat(stored.isPushSuppressed()).isTrue();
    }

    @Test
    @DisplayName("[B9] screening is rechecked at delivery, and acknowledgement never beats a hard term")
    void screeningIsRecheckedAtDelivery() throws Exception {
        Fixture f = fixture();
        term("kaybol", ScreeningTerm.HARD);
        term("aptal", ScreeningTerm.SOFT);

        // A soft match without acknowledgement is refused, with the delivery code.
        sendRaw(f.sender, note(f.eventId, f.owner, "biraz aptal", "anonymous"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));

        Map<String, Object> acknowledged = note(f.eventId, f.owner, "biraz aptal", "anonymous");
        acknowledged.put("screeningAcknowledged", true);
        sendAt(f.sender, acknowledged, 1);

        Map<String, Object> hard = note(f.eventId, f.owner, "sen kaybol", "anonymous");
        hard.put("screeningAcknowledged", true);
        sendRaw(f.sender, hard)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));

        assertThat(inboxMessages.count()).isEqualTo(1);
        InboxMessage stored = inboxMessages.findAll().get(0);
        assertThat(stored.getScreeningFlag()).isEqualTo(InboxMessage.SOFT);
        assertThat(stored.getState()).isEqualTo(MessageState.NEW);
    }

    /* ----------------------------------------------- state, delete, report */

    @Test
    @DisplayName("[D12] the three states move freely in both directions, and the wall follows")
    void statesMoveInEveryDirection() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Thank you", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();

        for (String state : List.of("private", "approved", "new", "approved", "private", "new")) {
            JsonNode card = json(setState(f.owner, id, state).andExpect(status().isOk()));
            assertThat(card.get("state").asText()).isEqualTo(state);
            // The level a message was sent at is never rewritten by anything [D5]/[B4].
            assertThat(card.get("sender").get("level").asText()).isEqualTo("anonymous");
            assertThat(counts(inbox(f.owner)).get(state)).isEqualTo(1);
            assertThat(wall(f.owner, f.eventId, f.owner).get("count").asInt())
                    .isEqualTo("approved".equals(state) ? 1 : 0);
            assertThat(jdbc.queryForObject(
                    "select state_changed_at is not null from inbox_message where id = ?::uuid",
                    Boolean.class, id)).isTrue();
        }

        setState(f.owner, id, "archived").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("state"));
        setState(f.owner, id, null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("state"));
    }

    @Test
    @DisplayName("a reported message survives the recipient deleting it")
    void reportSurvivesSoftDelete() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Not ok", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();

        report(f.owner, id, "harassment").andExpect(status().isNoContent());
        mockMvc.perform(delete("/me/inbox/" + id).header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNoContent());

        Report report = reports.findByTargetKindAndTargetId(Report.INBOX_MESSAGE, UUID.fromString(id))
                .stream().findFirst().orElseThrow();
        assertThat(report.getReason()).isEqualTo("harassment");
        assertThat(report.getStatus()).isEqualTo(Report.OPEN);
        assertThat(report.getReporterId()).isEqualTo(f.owner.getId());
        assertThat(inboxMessages.findById(UUID.fromString(id)).orElseThrow().getText()).isEqualTo("Not ok");
    }

    @Test
    @DisplayName("the five reasons are the whole list, and reporting twice is a no-op")
    void reportReasonsAndDuplicates() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Not ok", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();

        for (String reason : List.of("harassment", "hate", "sexual", "identity", "spam")) {
            report(f.owner, id, reason).andExpect(status().isNoContent());
        }
        report(f.owner, id, "boring").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("reason"));
        report(f.owner, id, null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("reason"));

        // One row per (reporter, target): the first reason stands, and tapping again
        // is never an error the person has to understand.
        assertThat(reports.count()).isEqualTo(1);
        assertThat(reports.findByTargetKindAndTargetId(Report.INBOX_MESSAGE, UUID.fromString(id))
                .get(0).getReason()).isEqualTo("harassment");
    }

    @Test
    @DisplayName("a message that is not yours is 404 on every route that acts on one")
    void othersMessagesAre404() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Thank you", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();

        setState(f.sender, id, "approved").andExpect(status().isNotFound());
        mockMvc.perform(delete("/me/inbox/" + id).header(HttpHeaders.AUTHORIZATION, bearer(f.sender)))
                .andExpect(status().isNotFound());
        report(f.sender, id, "spam").andExpect(status().isNotFound());
        block(f.sender, id).andExpect(status().isNotFound());

        // Including an id that was never a message.
        setState(f.owner, "not-an-id", "approved").andExpect(status().isNotFound());
        block(f.owner, UUID.randomUUID().toString()).andExpect(status().isNotFound());
    }

    /* ------------------------------------------------------------- events */

    @Test
    @DisplayName("delivery and every change publish the events B-3 and B-5 hang off")
    void applicationEventsFire() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Thank you", "anonymous"), 1);

        InboxMessageDelivered delivered =
                applicationEvents.stream(InboxMessageDelivered.class).findFirst().orElseThrow();
        assertThat(delivered.recipientId()).isEqualTo(f.owner.getId());
        assertThat(delivered.eventId()).isEqualTo(f.eventId);
        assertThat(delivered.pushSuppressed()).isFalse();

        String id = inbox(f.owner).get("messages").get(0).get("id").asText();
        setState(f.owner, id, "approved").andExpect(status().isOk());
        mockMvc.perform(delete("/me/inbox/" + id).header(HttpHeaders.AUTHORIZATION, bearer(f.owner)))
                .andExpect(status().isNoContent());

        List<InboxMessageChanged> changes =
                applicationEvents.stream(InboxMessageChanged.class).toList();
        assertThat(changes).hasSize(2);
        assertThat(changes).allSatisfy(change -> {
            assertThat(change.messageId()).isEqualTo(UUID.fromString(id));
            assertThat(change.eventId()).isEqualTo(f.eventId);
        });
    }

    @Test
    @DisplayName("blocking from the inbox invalidates the blocker's own surfaces, and only theirs")
    void blockPublishesTheBlockersInvalidations() throws Exception {
        Fixture f = fixture();
        sendAt(f.sender, note(f.eventId, f.owner, "Block me", "anonymous"), 1);
        String id = inbox(f.owner).get("messages").get(0).get("id").asText();

        block(f.owner, id).andExpect(status().isNoContent());

        // [D6] The blocked user is told nothing, here or anywhere else: the only
        // person named in either event is the blocker.
        assertThat(applicationEvents.stream(ThreadsChanged.class).toList())
                .singleElement()
                .satisfies(changed ->
                        assertThat(changed.userIds()).containsExactly(f.owner.getId()));
        // The card goes out of the blocker's inbox, and a card written from a
        // board is one the board has to refetch too.
        assertThat(applicationEvents.stream(InboxMessageChanged.class).toList())
                .singleElement()
                .satisfies(changed -> {
                    assertThat(changed.messageId()).isEqualTo(UUID.fromString(id));
                    assertThat(changed.eventId()).isEqualTo(f.eventId);
                });
    }

    @Test
    @DisplayName("a board post's message is the same row, flagged approved-from-the-board")
    void deliverFromBoardSetsTheFlag() throws Exception {
        Fixture f = fixture();
        // B-3 calls the service directly; the flag is what the wall card renders.
        MessageDtos.SendWallMessageRequest request = new MessageDtos.SendWallMessageRequest(
                f.eventId.toString(), f.owner.getId().toString(), "From the board",
                "anonymous", null, null);
        InboxMessage stored = messageService.deliver(f.sender.getId(), request, true);

        assertThat(stored.isFromBoard()).isTrue();
        assertThat(stored.getEventId()).isEqualTo(f.eventId);
        assertThat(inbox(f.owner).get("messages").get(0).get("approvedFromBoard").asBoolean()).isTrue();
    }

    /* ------------------------------------------------------------ helpers */

    private record Fixture(AppUser owner, AppUser sender, UUID eventId, Section sectionA, Section sectionB) {
    }

    /** An owner and a sender, both on one live board. */
    private Fixture fixture() {
        List<Section> all = sections.findAll().stream()
                .sorted(Comparator.comparing(Section::getName)).toList();
        Section sectionA = all.get(0);
        Section sectionB = all.get(1);
        AppUser owner = approved(sectionA, "Ece Kara");
        AppUser sender = approved(sectionA, "Şeyma Kaya");
        UUID eventId = event(sectionA, base.minusSeconds(3600), base.plusSeconds(3600));
        join(eventId, owner.getId());
        join(eventId, sender.getId());
        return new Fixture(owner, sender, eventId, sectionA, sectionB);
    }

    private Map<String, Object> note(UUID eventId, AppUser recipient, String text, String level) {
        Map<String, Object> body = new HashMap<>();
        body.put("eventId", eventId.toString());
        body.put("recipientId", recipient.getId().toString());
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", new HashMap<String, Object>());
        return body;
    }

    private Map<String, Object> hintNote(UUID eventId, AppUser recipient, String text,
                                         boolean section, boolean country, boolean letter) {
        Map<String, Object> body = note(eventId, recipient, text, "hint");
        Map<String, Object> hints = new HashMap<>();
        hints.put("section", section);
        hints.put("country", country);
        hints.put("letter", letter);
        body.put("allowedHints", hints);
        return body;
    }

    private ResultActions sendRaw(AppUser sender, Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/messages/wall")
                .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    /** Sent at a distinct second, so "newest first" is deterministic [B2]. */
    private void sendAt(AppUser sender, Map<String, Object> body, int second) throws Exception {
        clock.freezeAt(base.plusSeconds(second));
        sendRaw(sender, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true));
        clock.freezeAt(base);
    }

    private void refused(AppUser sender, Map<String, Object> body) throws Exception {
        sendRaw(sender, body)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"))
                .andExpect(jsonPath("$.field").doesNotExist());
    }

    private void invalid(AppUser sender, Map<String, Object> body, String field) throws Exception {
        sendRaw(sender, body)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private ResultActions setState(AppUser viewer, String id, String state) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("state", state);
        return mockMvc.perform(put("/me/inbox/" + id + "/state")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    private ResultActions report(AppUser viewer, String id, String reason) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("reason", reason);
        return mockMvc.perform(post("/messages/" + id + "/report")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    private ResultActions block(AppUser viewer, String id) throws Exception {
        return mockMvc.perform(post("/messages/" + id + "/block")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private JsonNode inbox(AppUser viewer) throws Exception {
        return json(mockMvc.perform(get("/me/inbox").header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
    }

    private JsonNode wall(AppUser viewer, UUID eventId, AppUser target) throws Exception {
        return json(mockMvc.perform(get(wallPath(eventId, target.getId()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
    }

    private static String wallPath(UUID eventId, UUID personId) {
        return "/events/" + eventId + "/people/" + personId + "/wall";
    }

    private static List<JsonNode> list(JsonNode array) {
        List<JsonNode> rows = new java.util.ArrayList<>();
        array.forEach(rows::add);
        return rows;
    }

    private static List<String> texts(JsonNode messages) {
        return list(messages).stream().map(row -> row.get("text").asText()).toList();
    }

    private static Map<String, Integer> counts(JsonNode snapshot) {
        JsonNode counts = snapshot.get("counts");
        return Map.of("new", counts.get("new").asInt(),
                "private", counts.get("private").asInt(),
                "approved", counts.get("approved").asInt());
    }

    private void policy(AppUser user, String writingPolicy) {
        UserSettings row = settings.findById(user.getId()).orElseGet(() -> UserSettings.defaultsFor(user.getId()));
        row.apply(writingPolicy, row.getMutedWords(), row.getMutedWordsNormalized(),
                row.isNotifyInbox(), row.isNotifyThreads(), row.isNotifyBoardMentions());
        settings.saveAndFlush(row);
    }

    private void notifyInbox(AppUser user, boolean on) {
        UserSettings row = settings.findById(user.getId()).orElseGet(() -> UserSettings.defaultsFor(user.getId()));
        row.apply(row.getWritingPolicy(), row.getMutedWords(), row.getMutedWordsNormalized(),
                on, row.isNotifyThreads(), row.isNotifyBoardMentions());
        settings.saveAndFlush(row);
    }

    /** As the settings endpoint (B-5) writes them: as entered, and as the matcher reads them. */
    private void mute(AppUser user, String... words) {
        UserSettings row = settings.findById(user.getId()).orElseGet(() -> UserSettings.defaultsFor(user.getId()));
        String[] normalized = java.util.Arrays.stream(words)
                .map(TextNormalizer::normalizeForSearch).toArray(String[]::new);
        row.apply(row.getWritingPolicy(), words, normalized,
                row.isNotifyInbox(), row.isNotifyThreads(), row.isNotifyBoardMentions());
        settings.saveAndFlush(row);
    }

    private void term(String word, String severity) {
        terms.saveAndFlush(ScreeningTerm.of(word, TextNormalizer.normalizeForSearch(word),
                severity, null, Instant.now()));
        screener.invalidate();
    }

    private UUID event(Section section, Instant startsAt, Instant endsAt) {
        return jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover, board_mode, join_code)
                        values ('Welcome night', 'section', ?, ?, ?, 'coral', 'approve_first', ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(startsAt), Timestamp.from(endsAt), joinCode());
    }

    private void join(UUID eventId, UUID userId) {
        jdbc.update("insert into event_member (event_id, user_id) values (?, ?)", eventId, userId);
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private AppUser approved(Section section, String name) {
        return account(section, name, AccountStatus.APPROVED);
    }

    private AppUser account(Section section, String name, AccountStatus status) {
        AppUser user = AppUser.register(
                "wall-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        user.setName(name);
        user.setSection(section);
        return users.saveAndFlush(user);
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }

    private String body(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
