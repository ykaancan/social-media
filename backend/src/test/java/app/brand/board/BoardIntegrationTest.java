package app.brand.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.realtime.BoardChanged;
import app.brand.safety.Report;
import app.brand.safety.ReportRepository;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * The live board — BACKEND_PLAN.md §3 "Boards", which is {@code mock.ts}'s
 * behaviour unchanged.
 *
 * <p>The cases worth naming: a post addressed to a person never enters the queue
 * and is on the board only while the recipient keeps it on their wall [D12]; a
 * moderator's own room post publishes in both board modes [D9]; a rejection is
 * invisible to its sender for five seconds and then final [B6]/[D8]; closing a
 * board archives it at once and leaves nothing pending [D4]; and a board you are
 * not a member of is 404 on every route, never 403.
 */
@RecordApplicationEvents
class BoardIntegrationTest extends AbstractIntegrationTest {

    private static final String FIRE = "🔥";
    private static final String EYES = "👀";

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private BoardPostRepository posts;

    @Autowired
    private PostReactionRepository reactions;

    @Autowired
    private ReportRepository reports;

    @Autowired
    private BoardHousekeeping housekeeping;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    @Autowired
    private ApplicationEvents applicationEvents;

    private Instant base;

    @BeforeEach
    void freezeTheClock() {
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        clock.freezeAt(base);
    }

    @AfterEach
    void clearUp() {
        clock.reset();
        jdbc.update("delete from post_reaction");
        jdbc.update("delete from report");
        jdbc.update("delete from block");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'board-%')");
    }

    /* ------------------------------------------------------------- snapshot */

    @Test
    @DisplayName("the queue, its count and the reviewed list exist for a moderator and for nobody else")
    void snapshotShapeDependsOnRole() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Waiting", 1);

        JsonNode asModerator = board(f.creator, f.eventId);
        assertThat(list(asModerator.get("queue"))).hasSize(1);
        assertThat(asModerator.get("pendingCount").asInt()).isEqualTo(1);
        assertThat(asModerator.get("reviewed")).isNotNull();
        assertThat(asModerator.get("canManageModerators").asBoolean()).isTrue();
        assertThat(asModerator.get("creator").get("id").asText()).isEqualTo(f.creator.getId().toString());
        assertThat(asModerator.get("event").get("isModerator").asBoolean()).isTrue();

        JsonNode asMember = board(f.member, f.eventId);
        assertThat(list(asMember.get("queue"))).isEmpty();
        assertThat(asMember.get("pendingCount").asInt()).isZero();
        assertThat(list(asMember.get("reviewed"))).isEmpty();
        assertThat(asMember.get("canManageModerators").asBoolean()).isFalse();
        // The sender still sees their own card waiting, which is the only place it shows.
        assertThat(texts(asMember.get("ownUnpublished"))).containsExactly("Waiting");
        assertThat(asMember.get("ownUnpublished").get(0).get("state").asText()).isEqualTo("pending");
        assertThat(texts(asMember.get("posts"))).isEmpty();
    }

    @Test
    @DisplayName("no board DTO carries a sender id, a hint boolean or an undo token")
    void snapshotNeverCarriesIdentity() throws Exception {
        Fixture f = live();
        sendRoom(f.other, f.eventId, "Hello", 1, "hint", true, true, true);
        sendRoom(f.member, f.eventId, "Queued", 2);
        reject(f.creator, f.eventId, queueId(f.creator, f.eventId, "Queued")).andExpect(status().isOk());

        String body = mockMvc.perform(get("/events/" + f.eventId + "/board")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.creator)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("senderId")
                .doesNotContain("hintSection")
                .doesNotContain("undoToken")
                .doesNotContain("rejectedBy")
                .doesNotContain("rejectionUndo")
                .doesNotContain("hiddenBy");

        // The roster names everyone — it is the People tab. The cards must not: a
        // hint-level card carries the derived chips and no way back to the person.
        JsonNode snapshot = objectMapper.readTree(body);
        String cards = objectMapper.writeValueAsString(List.of(
                snapshot.get("posts"), snapshot.get("queue"), snapshot.get("reviewed"),
                snapshot.get("ownUnpublished")));
        assertThat(cards).doesNotContain(f.other.getId().toString());
        JsonNode hinted = snapshot.get("queue").get(0).get("sender");
        assertThat(hinted.get("level").asText()).isEqualTo("hint");
        assertThat(hinted.get("hints").get("letter").asText()).isEqualTo("Z");
        assertThat(hinted.has("name")).isFalse();
    }

    @Test
    @DisplayName("posts are newest first and `mine` is the viewer's own")
    void orderingAndMine() throws Exception {
        Fixture f = immediate();
        sendRoom(f.member, f.eventId, "First", 1);
        sendRoom(f.other, f.eventId, "Second", 2);
        sendRoom(f.member, f.eventId, "Third", 3);

        JsonNode snapshot = board(f.member, f.eventId);
        assertThat(texts(snapshot.get("posts"))).containsExactly("Third", "Second", "First");
        assertThat(list(snapshot.get("posts")).stream().map(row -> row.get("mine").asBoolean()).toList())
                .containsExactly(true, false, true);
    }

    /* ------------------------------------------------------ sending to the room */

    @Test
    @DisplayName("[D9] a moderator's room post publishes in both modes; everyone else's follows the mode")
    void roomPostStateByRoleAndMode() throws Exception {
        Fixture approveFirst = live();
        sendRoom(approveFirst.creator, approveFirst.eventId, "Creator, approve_first", 1);
        sendRoom(approveFirst.coModerator, approveFirst.eventId, "Co-mod, approve_first", 2);
        sendRoom(approveFirst.member, approveFirst.eventId, "Member, approve_first", 3);

        assertThat(state(approveFirst.eventId, "Creator, approve_first")).isEqualTo(BoardPostState.APPROVED);
        assertThat(approvalKind(approveFirst.eventId, "Creator, approve_first"))
                .isEqualTo(BoardPost.AUTO_APPROVED_BY_AUTHOR);
        assertThat(approvalKind(approveFirst.eventId, "Co-mod, approve_first"))
                .isEqualTo(BoardPost.AUTO_APPROVED_BY_AUTHOR);
        assertThat(state(approveFirst.eventId, "Member, approve_first")).isEqualTo(BoardPostState.PENDING);
        assertThat(approvalKind(approveFirst.eventId, "Member, approve_first")).isNull();

        Fixture immediate = immediate();
        sendRoom(immediate.creator, immediate.eventId, "Creator, immediate", 1);
        sendRoom(immediate.member, immediate.eventId, "Member, immediate", 2);

        assertThat(approvalKind(immediate.eventId, "Creator, immediate"))
                .isEqualTo(BoardPost.AUTO_APPROVED_BY_AUTHOR);
        assertThat(state(immediate.eventId, "Member, immediate")).isEqualTo(BoardPostState.APPROVED);
        assertThat(approvalKind(immediate.eventId, "Member, immediate")).isEqualTo(BoardPost.IMMEDIATE);
    }

    @Test
    @DisplayName("an empty, over-long or badly levelled post names the field it failed on")
    void roomPostValidation() throws Exception {
        Fixture f = live();
        invalid(f.member, f.eventId, room("   ", "anonymous"), "text");
        invalid(f.member, f.eventId, room("x".repeat(281), "anonymous"), "text");
        invalid(f.member, f.eventId, room("Fine", "shouting"), "anonymityLevel");

        Map<String, Object> hintWithNoHints = room("Fine", "hint");
        hintWithNoHints.put("allowedHints", new HashMap<String, Object>());
        invalid(f.member, f.eventId, hintWithNoHints, "allowedHints");
    }

    /* ------------------------------------------------- posts to a person [D12] */

    @Test
    @DisplayName("a post to a person never queues and is on the board only while its message is on the wall")
    void personPostFollowsTheRecipient() throws Exception {
        Fixture f = live();
        clock.freezeAt(base.plusSeconds(1));
        sendRaw(f.member, f.eventId, toPerson(f.other, "For you", "named"))
                .andExpect(status().isOk());
        clock.freezeAt(base);

        // Nothing queued, nothing on the board: the recipient has not published it.
        JsonNode beforeApproval = board(f.creator, f.eventId);
        assertThat(list(beforeApproval.get("queue"))).isEmpty();
        assertThat(beforeApproval.get("pendingCount").asInt()).isZero();
        assertThat(texts(beforeApproval.get("posts"))).isEmpty();
        assertThat(beforeApproval.get("event").get("postCount").asInt()).isZero();
        // Nor does the sender see it as unpublished — it is not a room post.
        assertThat(texts(board(f.member, f.eventId).get("ownUnpublished"))).isEmpty();

        String messageId = onlyInboxMessageId(f.other);
        setState(f.other, messageId, "approved").andExpect(status().isOk());

        JsonNode published = board(f.creator, f.eventId);
        assertThat(texts(published.get("posts"))).containsExactly("For you");
        assertThat(published.get("event").get("postCount").asInt()).isEqualTo(1);
        JsonNode card = published.get("posts").get(0);
        assertThat(card.get("state").asText()).isEqualTo("approved");
        assertThat(card.get("recipient").get("id").asText()).isEqualTo(f.other.getId().toString());
        assertThat(card.get("recipient").get("name").asText()).isEqualTo(f.other.getName());
        assertThat(card.get("sender").get("level").asText()).isEqualTo("named");
        assertThat(board(f.member, f.eventId).get("posts").get(0).get("mine").asBoolean()).isTrue();

        // Taken back off the wall: gone from the board and from the count.
        setState(f.other, messageId, "private").andExpect(status().isOk());
        JsonNode takenBack = board(f.creator, f.eventId);
        assertThat(texts(takenBack.get("posts"))).isEmpty();
        assertThat(takenBack.get("event").get("postCount").asInt()).isZero();

        // Approved again, then deleted [D12]: hidden, not destroyed, still gone.
        setState(f.other, messageId, "approved").andExpect(status().isOk());
        assertThat(texts(board(f.creator, f.eventId).get("posts"))).containsExactly("For you");
        mockMvc.perform(delete("/me/inbox/" + messageId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.other)))
                .andExpect(status().isNoContent());
        JsonNode deleted = board(f.creator, f.eventId);
        assertThat(texts(deleted.get("posts"))).isEmpty();
        assertThat(deleted.get("event").get("postCount").asInt()).isZero();
        assertThat(posts.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("a state change on a linked message invalidates the board")
    void inboxMessageChangeInvalidatesTheBoard() throws Exception {
        Fixture f = live();
        sendRaw(f.member, f.eventId, toPerson(f.other, "For you", "anonymous"))
                .andExpect(status().isOk());
        String messageId = onlyInboxMessageId(f.other);

        applicationEvents.clear();
        setState(f.other, messageId, "approved").andExpect(status().isOk());

        List<BoardChanged> frames = boardFrames();
        assertThat(frames).isNotEmpty();
        assertThat(frames).allSatisfy(frame -> {
            assertThat(frame.eventId()).isEqualTo(f.eventId);
            assertThat(frame.privateUserIds()).isEmpty();
        });
    }

    /* ------------------------------------------------------------- reactions */

    @Test
    @DisplayName("one reaction per person, replaceable and clearable; anything else is 422 on emoji")
    void reactions() throws Exception {
        Fixture f = immediate();
        sendRoom(f.member, f.eventId, "React to me", 1);
        String postId = postId(f.eventId, "React to me");

        react(f.other, f.eventId, postId, FIRE).andExpect(status().isNoContent());
        react(f.creator, f.eventId, postId, FIRE).andExpect(status().isNoContent());
        react(f.member, f.eventId, postId, EYES).andExpect(status().isNoContent());

        JsonNode card = board(f.member, f.eventId).get("posts").get(0);
        assertThat(card.get("reactions").get(FIRE).asInt()).isEqualTo(2);
        assertThat(card.get("reactions").get(EYES).asInt()).isEqualTo(1);
        assertThat(card.get("myReaction").asText()).isEqualTo(EYES);
        assertThat(board(f.coModerator, f.eventId).get("posts").get(0).has("myReaction")).isFalse();

        // Replacing, not accumulating.
        react(f.member, f.eventId, postId, FIRE).andExpect(status().isNoContent());
        assertThat(board(f.member, f.eventId).get("posts").get(0).get("reactions").get(FIRE).asInt())
                .isEqualTo(3);
        assertThat(reactions.count()).isEqualTo(3);

        // Cleared.
        react(f.member, f.eventId, postId, null).andExpect(status().isNoContent());
        JsonNode cleared = board(f.member, f.eventId).get("posts").get(0);
        assertThat(cleared.get("reactions").get(FIRE).asInt()).isEqualTo(2);
        assertThat(cleared.has("myReaction")).isFalse();

        react(f.member, f.eventId, postId, "🍕")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("emoji"));
        react(f.member, f.eventId, UUID.randomUUID().toString(), FIRE)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("emoji"));
    }

    @Test
    @DisplayName("an unpublished post cannot be reacted to")
    void reactionsNeedAPublishedPost() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Queued", 1);
        react(f.other, f.eventId, postId(f.eventId, "Queued"), FIRE)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("emoji"));
    }

    /* ------------------------------------------------------------ moderation */

    @Test
    @DisplayName("approve releases the whole batch, or nothing at all")
    void approveIsAllOrNothing() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "One", 1);
        sendRoom(f.other, f.eventId, "Two", 2);
        String one = postId(f.eventId, "One");
        String two = postId(f.eventId, "Two");

        approve(f.creator, f.eventId, List.of(one, UUID.randomUUID().toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("queue_changed"));
        assertThat(state(f.eventId, "One")).isEqualTo(BoardPostState.PENDING);

        approve(f.creator, f.eventId, List.of(one, two, one)).andExpect(status().isNoContent());
        assertThat(state(f.eventId, "One")).isEqualTo(BoardPostState.APPROVED);
        assertThat(approvalKind(f.eventId, "Two")).isEqualTo(BoardPost.MODERATOR);
        JsonNode snapshot = board(f.creator, f.eventId);
        assertThat(texts(snapshot.get("posts"))).containsExactly("Two", "One");
        assertThat(snapshot.get("pendingCount").asInt()).isZero();
        assertThat(texts(snapshot.get("reviewed"))).containsExactly("Two", "One");

        approve(f.creator, f.eventId, List.of()).andExpect(status().isConflict());
        approve(f.member, f.eventId, List.of(one))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("moderator_required"));
    }

    @Test
    @DisplayName("[B6] a rejection is invisible to its sender for five seconds and out of the queue at once")
    void rejectionOpensAnUndoWindow() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Borderline", 1);
        String postId = postId(f.eventId, "Borderline");

        JsonNode receipt = json(reject(f.creator, f.eventId, postId).andExpect(status().isOk()));
        assertThat(receipt.get("undoToken").asText()).isNotBlank();
        assertThat(Instant.parse(receipt.get("undoUntil").asText())).isEqualTo(base.plusSeconds(5));

        JsonNode asModerator = board(f.creator, f.eventId);
        assertThat(list(asModerator.get("queue"))).isEmpty();
        assertThat(asModerator.get("pendingCount").asInt()).isEqualTo(1);

        JsonNode asSender = board(f.member, f.eventId);
        assertThat(asSender.get("ownUnpublished").get(0).get("state").asText()).isEqualTo("pending");
        assertThat(asSender.get("ownUnpublished").get(0).has("rejectionReason")).isFalse();

        // Nothing may be done to it while the window is open.
        approve(f.creator, f.eventId, List.of(postId)).andExpect(status().isConflict());
        reject(f.creator, f.eventId, postId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("queue_changed"));
    }

    @Test
    @DisplayName("undo is the rejecting moderator's, before the deadline, and nobody else's")
    void undo() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Mis-tap", 1);
        String token = json(reject(f.creator, f.eventId, postId(f.eventId, "Mis-tap"))
                .andExpect(status().isOk())).get("undoToken").asText();

        undo(f.coModerator, f.eventId, token)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("undo_expired"));
        undo(f.creator, f.eventId, "not-a-token").andExpect(status().isConflict());

        undo(f.creator, f.eventId, token).andExpect(status().isNoContent());
        JsonNode snapshot = board(f.creator, f.eventId);
        assertThat(texts(snapshot.get("queue"))).containsExactly("Mis-tap");
        assertThat(snapshot.get("pendingCount").asInt()).isEqualTo(1);
        assertThat(state(f.eventId, "Mis-tap")).isEqualTo(BoardPostState.PENDING);
    }

    @Test
    @DisplayName("[D8] five seconds later the rejection is final, applied by the next read")
    void undoWindowExpiresLazilyOnRead() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Rejected", 1);
        String token = json(reject(f.creator, f.eventId, postId(f.eventId, "Rejected"))
                .andExpect(status().isOk())).get("undoToken").asText();

        clock.freezeAt(base.plusSeconds(5));
        undo(f.creator, f.eventId, token)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("undo_expired"));

        JsonNode asSender = board(f.member, f.eventId);
        JsonNode card = asSender.get("ownUnpublished").get(0);
        assertThat(card.get("state").asText()).isEqualTo("rejected");
        assertThat(card.get("rejectionReason").asText()).isEqualTo("moderator");

        JsonNode asModerator = board(f.creator, f.eventId);
        assertThat(asModerator.get("pendingCount").asInt()).isZero();
        assertThat(texts(asModerator.get("reviewed"))).containsExactly("Rejected");
        // The deadline, not the moment somebody happened to look.
        assertThat(row(f.eventId, "Rejected").getRejectedAt()).isEqualTo(base.plusSeconds(5));
        assertThat(row(f.eventId, "Rejected").getRejectedBy()).isEqualTo(f.creator.getId());
    }

    @Test
    @DisplayName("the sender's private frame comes from the transition, not from the rejection")
    void rejectionFramesKeepTheSenderInTheDark() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Quiet", 1);

        applicationEvents.clear();
        reject(f.creator, f.eventId, postId(f.eventId, "Quiet")).andExpect(status().isOk());
        assertThat(boardFrames()).isNotEmpty()
                .allSatisfy(frame -> assertThat(frame.privateUserIds()).isEmpty());

        clock.freezeAt(base.plusSeconds(5));
        applicationEvents.clear();
        board(f.creator, f.eventId);
        assertThat(boardFrames()).anySatisfy(frame ->
                assertThat(frame.privateUserIds()).containsExactly(f.member.getId()));
    }

    @Test
    @DisplayName("a room post publishes a frame naming its own sender and nobody else")
    void sendingPublishesThePrivateFrame() throws Exception {
        Fixture f = live();
        applicationEvents.clear();
        sendRoom(f.member, f.eventId, "Frame", 1);
        assertThat(boardFrames()).anySatisfy(frame -> {
            assertThat(frame.eventId()).isEqualTo(f.eventId);
            assertThat(frame.privateUserIds()).containsExactly(f.member.getId());
        });
    }

    /* -------------------------------------------------------- hide and report */

    @Test
    @DisplayName("hide is a moderator's, on a published room post only")
    void hide() throws Exception {
        Fixture f = immediate();
        sendRoom(f.member, f.eventId, "Too much", 1);
        String postId = postId(f.eventId, "Too much");

        hide(f.other, f.eventId, postId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("moderator_required"));
        hide(f.creator, f.eventId, postId).andExpect(status().isNoContent());

        JsonNode snapshot = board(f.creator, f.eventId);
        assertThat(texts(snapshot.get("posts"))).isEmpty();
        assertThat(texts(snapshot.get("reviewed"))).isEmpty();
        assertThat(snapshot.get("event").get("postCount").asInt()).isZero();
        assertThat(row(f.eventId, "Too much").getHiddenBy()).isEqualTo(f.creator.getId());

        // A card addressed to a person is the recipient's, not a moderator's.
        sendRaw(f.member, f.eventId, toPerson(f.other, "For you", "anonymous"))
                .andExpect(status().isOk());
        setState(f.other, onlyInboxMessageId(f.other), "approved").andExpect(status().isOk());
        hide(f.creator, f.eventId, postId(f.eventId, "For you")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("report takes the five reasons on a published post, and 404s on anything else")
    void report() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Queued", 1);
        sendRoom(f.creator, f.eventId, "Published", 2);
        String published = postId(f.eventId, "Published");

        reportPost(f.other, f.eventId, published, "nonsense")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("reason"));
        reportPost(f.other, f.eventId, postId(f.eventId, "Queued"), "spam")
                .andExpect(status().isNotFound());
        reportPost(f.other, f.eventId, UUID.randomUUID().toString(), "spam")
                .andExpect(status().isNotFound());

        reportPost(f.other, f.eventId, published, "harassment").andExpect(status().isNoContent());
        reportPost(f.other, f.eventId, published, "spam").andExpect(status().isNoContent());
        assertThat(reports.findAll()).singleElement().satisfies(row -> {
            assertThat(row.getTargetKind()).isEqualTo(Report.BOARD_POST);
            assertThat(row.getReason()).isEqualTo("harassment");
        });
    }

    /* ---------------------------------------------------- controls and close */

    @Test
    @DisplayName("controls take a known mode and an end time in the future; an archived board is 409")
    void controls() throws Exception {
        Fixture f = live();

        controls(f.member, f.eventId, Map.of("boardMode", "post_immediately"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("moderator_required"));
        controls(f.creator, f.eventId, Map.of("boardMode", "whenever"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("boardMode"));
        controls(f.creator, f.eventId, Map.of("endsAt", "soon"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("endsAt"));
        controls(f.creator, f.eventId, Map.of("endsAt", base.minusSeconds(60).toString()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("endsAt"));

        controls(f.creator, f.eventId, Map.of("boardMode", "post_immediately",
                "endsAt", base.plusSeconds(7200).toString())).andExpect(status().isNoContent());
        JsonNode event = board(f.creator, f.eventId).get("event");
        assertThat(event.get("boardMode").asText()).isEqualTo("post_immediately");
        assertThat(Instant.parse(event.get("endsAt").asText())).isEqualTo(base.plusSeconds(7200));

        // A mode change is for future posts only: what was queued stays queued.
        sendRoom(f.member, f.eventId, "After the switch", 1);
        assertThat(state(f.eventId, "After the switch")).isEqualTo(BoardPostState.APPROVED);

        close(f.creator, f.eventId).andExpect(status().isNoContent());
        controls(f.creator, f.eventId, Map.of("boardMode", "approve_first"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("board_archived"));
    }

    @Test
    @DisplayName("[D4] closing archives at once and leaves nothing pending")
    void close() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Never published", 1);
        sendRoom(f.creator, f.eventId, "Published", 2);

        applicationEvents.clear();
        close(f.creator, f.eventId).andExpect(status().isNoContent());
        assertThat(boardFrames()).anySatisfy(frame ->
                assertThat(frame.privateUserIds()).containsExactly(f.member.getId()));

        JsonNode snapshot = board(f.creator, f.eventId);
        assertThat(snapshot.get("event").get("status").asText()).isEqualTo("archived");
        assertThat(Instant.parse(snapshot.get("event").get("closedAt").asText())).isEqualTo(base);
        assertThat(snapshot.get("pendingCount").asInt()).isZero();
        assertThat(texts(snapshot.get("posts"))).containsExactly("Published");

        JsonNode asSender = board(f.member, f.eventId);
        assertThat(asSender.get("ownUnpublished").get(0).get("rejectionReason").asText())
                .isEqualTo("board_closed");
        assertThat(asSender.get("ownUnpublished").get(0).get("state").asText()).isEqualTo("rejected");

        // The board is read-only for everything, including the moderator who closed it.
        sendRaw(f.member, f.eventId, room("Too late", "anonymous"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("board_read_only"));
        close(f.creator, f.eventId).andExpect(status().isConflict());
        react(f.member, f.eventId, postId(f.eventId, "Published"), FIRE)
                .andExpect(status().isConflict());
        // Reporting still works: an event ending must not close the safety route.
        reportPost(f.member, f.eventId, postId(f.eventId, "Published"), "spam")
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("an event that simply ran out of time rejects its queue on the next read")
    void endedBoardRejectsItsQueueLazily() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Stranded", 1);

        clock.freezeAt(base.plusSeconds(7200));
        JsonNode snapshot = board(f.member, f.eventId);
        assertThat(snapshot.get("event").get("status").asText()).isEqualTo("archived");
        assertThat(snapshot.get("ownUnpublished").get(0).get("rejectionReason").asText())
                .isEqualTo("board_closed");
        assertThat(row(f.eventId, "Stranded").getRejectedBy()).isNull();
    }

    /* -------------------------------------------------------------- moderators */

    @Test
    @DisplayName("moderators are the creator's to add and remove, and nobody else's")
    void moderators() throws Exception {
        Fixture f = live();

        setModerator(f.coModerator, f.eventId, f.other, true)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("cannot_change_moderator"));
        setModerator(f.member, f.eventId, f.other, true)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("moderator_required"));
        setModerator(f.creator, f.eventId, f.creator, true)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("cannot_change_moderator"));
        setModerator(f.creator, f.eventId, f.stranger, true)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("cannot_change_moderator"));

        setModerator(f.creator, f.eventId, f.other, true).andExpect(status().isNoContent());
        JsonNode snapshot = board(f.creator, f.eventId);
        assertThat(ids(snapshot.get("moderators")))
                .containsExactlyInAnyOrder(f.coModerator.getId().toString(), f.other.getId().toString());
        assertThat(board(f.other, f.eventId).get("event").get("isModerator").asBoolean()).isTrue();

        setModerator(f.creator, f.eventId, f.other, false).andExpect(status().isNoContent());
        assertThat(ids(board(f.creator, f.eventId).get("moderators")))
                .containsExactly(f.coModerator.getId().toString());

        close(f.creator, f.eventId).andExpect(status().isNoContent());
        setModerator(f.creator, f.eventId, f.other, true)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("board_archived"));
    }

    /* ------------------------------------------------------------ membership */

    @Test
    @DisplayName("a board you are not on is 404 on every route, never 403")
    void nonMemberIsAlways404() throws Exception {
        Fixture f = immediate();
        sendRoom(f.member, f.eventId, "Not for you", 1);
        String postId = postId(f.eventId, "Not for you");
        String stranger = bearer(f.stranger);
        String path = "/events/" + f.eventId;

        mockMvc.perform(get(path + "/board").header(HttpHeaders.AUTHORIZATION, stranger))
                .andExpect(status().isNotFound());
        sendRaw(f.stranger, f.eventId, room("Hello", "anonymous")).andExpect(status().isNotFound());
        react(f.stranger, f.eventId, postId, FIRE).andExpect(status().isNotFound());
        approve(f.stranger, f.eventId, List.of(postId)).andExpect(status().isNotFound());
        reject(f.stranger, f.eventId, postId).andExpect(status().isNotFound());
        undo(f.stranger, f.eventId, "token").andExpect(status().isNotFound());
        hide(f.stranger, f.eventId, postId).andExpect(status().isNotFound());
        reportPost(f.stranger, f.eventId, postId, "spam").andExpect(status().isNotFound());
        controls(f.stranger, f.eventId, Map.of("boardMode", "approve_first"))
                .andExpect(status().isNotFound());
        close(f.stranger, f.eventId).andExpect(status().isNotFound());
        setModerator(f.stranger, f.eventId, f.member, true).andExpect(status().isNotFound());

        mockMvc.perform(get("/events/" + UUID.randomUUID() + "/board")
                        .header(HttpHeaders.AUTHORIZATION, stranger))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/events/not-a-uuid/board").header(HttpHeaders.AUTHORIZATION, stranger))
                .andExpect(status().isNotFound());
    }

    /* ---------------------------------------------------------- housekeeping */

    @Test
    @DisplayName("[B5] the job finalises both transitions without anybody reading the board")
    void housekeepingFinalisesBothCases() throws Exception {
        Fixture rejected = live();
        sendRoom(rejected.member, rejected.eventId, "Expiring", 1);
        reject(rejected.creator, rejected.eventId, postId(rejected.eventId, "Expiring"))
                .andExpect(status().isOk());

        Fixture ended = live();
        sendRoom(ended.member, ended.eventId, "Stranded", 1);

        clock.freezeAt(base.plusSeconds(7200));
        applicationEvents.clear();
        housekeeping.run();

        assertThat(row(rejected.eventId, "Expiring").getState()).isEqualTo(BoardPostState.REJECTED);
        // The board ended before the window closed, so board_closed wins.
        assertThat(row(rejected.eventId, "Expiring").getRejectionReason())
                .isEqualTo(BoardPost.REASON_BOARD_CLOSED);
        assertThat(row(ended.eventId, "Stranded").getState()).isEqualTo(BoardPostState.REJECTED);
        assertThat(row(ended.eventId, "Stranded").getRejectionReason())
                .isEqualTo(BoardPost.REASON_BOARD_CLOSED);

        Set<UUID> notified = new java.util.HashSet<>();
        boardFrames().forEach(frame -> notified.addAll(frame.privateUserIds()));
        assertThat(notified).contains(rejected.member.getId(), ended.member.getId());
    }

    @Test
    @DisplayName("[B6] the job finalises an expired undo window on a board that is still live")
    void housekeepingFinalisesAnExpiredUndoOnALiveBoard() throws Exception {
        Fixture f = live();
        sendRoom(f.member, f.eventId, "Expiring", 1);
        reject(f.creator, f.eventId, postId(f.eventId, "Expiring")).andExpect(status().isOk());

        clock.freezeAt(base.plusSeconds(6));
        applicationEvents.clear();
        housekeeping.run();

        BoardPost row = row(f.eventId, "Expiring");
        assertThat(row.getState()).isEqualTo(BoardPostState.REJECTED);
        assertThat(row.getRejectionReason()).isEqualTo(BoardPost.REASON_MODERATOR);
        assertThat(row.getRejectedAt()).isEqualTo(base.plusSeconds(5));
        assertThat(boardFrames()).anySatisfy(frame ->
                assertThat(frame.privateUserIds()).containsExactly(f.member.getId()));
    }

    /* ------------------------------------------------------------- fixtures */

    private record Fixture(UUID eventId,
                           AppUser creator,
                           AppUser coModerator,
                           AppUser member,
                           AppUser other,
                           AppUser stranger) {
    }

    private Fixture live() {
        return fixture("approve_first");
    }

    private Fixture immediate() {
        return fixture("post_immediately");
    }

    private Fixture fixture(String boardMode) {
        Section section = sections.findAll().stream()
                .min(java.util.Comparator.comparing(Section::getName))
                .orElseThrow();
        AppUser creator = approved(section, "Deniz");
        AppUser coModerator = approved(section, "Ece");
        AppUser member = approved(section, "Mert");
        AppUser other = approved(section, "Zeynep");
        AppUser stranger = approved(section, "Ada");

        UUID eventId = event(section, creator.getId(), base.minusSeconds(3600),
                base.plusSeconds(3600), boardMode);
        join(eventId, creator.getId(), true);
        join(eventId, coModerator.getId(), true);
        join(eventId, member.getId(), false);
        join(eventId, other.getId(), false);
        return new Fixture(eventId, creator, coModerator, member, other, stranger);
    }

    /* --------------------------------------------------------------- helpers */

    private ResultActions sendRaw(AppUser sender, UUID eventId, Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/posts")
                .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    /** Sent at a distinct second, so "newest first" is a fact about the rows [B2]. */
    private void sendRoom(AppUser sender, UUID eventId, String text, int second) throws Exception {
        sendRoom(sender, eventId, text, second, "anonymous", false, false, false);
    }

    private void sendRoom(AppUser sender, UUID eventId, String text, int second,
                          String level, boolean section, boolean country, boolean letter)
            throws Exception {
        Map<String, Object> body = room(text, level);
        Map<String, Object> hints = new HashMap<>();
        hints.put("section", section);
        hints.put("country", country);
        hints.put("letter", letter);
        body.put("allowedHints", hints);
        clock.freezeAt(base.plusSeconds(second));
        sendRaw(sender, eventId, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true));
        clock.freezeAt(base);
    }

    private Map<String, Object> room(String text, String level) {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("anonymityLevel", level);
        body.put("allowedHints", new HashMap<String, Object>());
        return body;
    }

    private Map<String, Object> toPerson(AppUser recipient, String text, String level) {
        Map<String, Object> body = room(text, level);
        body.put("recipientId", recipient.getId().toString());
        return body;
    }

    private void invalid(AppUser sender, UUID eventId, Map<String, Object> body, String field)
            throws Exception {
        sendRaw(sender, eventId, body)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private ResultActions react(AppUser viewer, UUID eventId, String postId, String emoji)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("emoji", emoji);
        return mockMvc.perform(put("/events/" + eventId + "/posts/" + postId + "/reaction")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    private ResultActions approve(AppUser viewer, UUID eventId, List<String> ids) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/moderation/approve")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("ids", ids))));
    }

    private ResultActions reject(AppUser viewer, UUID eventId, String postId) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/posts/" + postId + "/reject")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private ResultActions undo(AppUser viewer, UUID eventId, String token) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/moderation/undo")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("undoToken", token))));
    }

    private ResultActions hide(AppUser viewer, UUID eventId, String postId) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/posts/" + postId + "/hide")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private ResultActions reportPost(AppUser viewer, UUID eventId, String postId, String reason)
            throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/posts/" + postId + "/report")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("reason", reason))));
    }

    private ResultActions controls(AppUser viewer, UUID eventId, Map<String, Object> changes)
            throws Exception {
        return mockMvc.perform(put("/events/" + eventId + "/controls")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(changes)));
    }

    private ResultActions close(AppUser viewer, UUID eventId) throws Exception {
        return mockMvc.perform(post("/events/" + eventId + "/close")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private ResultActions setModerator(AppUser viewer, UUID eventId, AppUser person, boolean enabled)
            throws Exception {
        String path = "/events/" + eventId + "/moderators/" + person.getId();
        return mockMvc.perform((enabled ? put(path) : delete(path))
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private ResultActions setState(AppUser viewer, String messageId, String state) throws Exception {
        return mockMvc.perform(put("/me/inbox/" + messageId + "/state")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("state", state))));
    }

    private JsonNode board(AppUser viewer, UUID eventId) throws Exception {
        return json(mockMvc.perform(get("/events/" + eventId + "/board")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
    }

    private String onlyInboxMessageId(AppUser viewer) throws Exception {
        JsonNode inbox = json(mockMvc.perform(get("/me/inbox")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
        return inbox.get("messages").get(0).get("id").asText();
    }

    private String queueId(AppUser moderator, UUID eventId, String text) throws Exception {
        return list(board(moderator, eventId).get("queue")).stream()
                .filter(row -> row.get("text").asText().equals(text))
                .findFirst().orElseThrow().get("id").asText();
    }

    private BoardPost row(UUID eventId, String text) {
        return posts.findAll().stream()
                .filter(row -> row.getEventId().equals(eventId) && row.getText().equals(text))
                .findFirst().orElseThrow();
    }

    private String postId(UUID eventId, String text) {
        return row(eventId, text).getId().toString();
    }

    private BoardPostState state(UUID eventId, String text) {
        return row(eventId, text).getState();
    }

    private String approvalKind(UUID eventId, String text) {
        return row(eventId, text).getApprovalKind();
    }

    private List<BoardChanged> boardFrames() {
        return applicationEvents.stream(BoardChanged.class).toList();
    }

    private UUID event(Section section, UUID creatorId, Instant startsAt, Instant endsAt,
                       String boardMode) {
        return jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values ('Welcome night', 'section', ?, ?, ?, 'coral', ?, ?, ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(startsAt), Timestamp.from(endsAt),
                boardMode, joinCode(), creatorId);
    }

    private void join(UUID eventId, UUID userId, boolean moderator) {
        jdbc.update("insert into event_member (event_id, user_id, is_moderator) values (?, ?, ?)",
                eventId, userId, moderator);
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
        AppUser user = AppUser.register(
                "board-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(AccountStatus.APPROVED);
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

    private static List<JsonNode> list(JsonNode array) {
        List<JsonNode> rows = new ArrayList<>();
        if (array != null) {
            array.forEach(rows::add);
        }
        return rows;
    }

    private static List<String> texts(JsonNode array) {
        return list(array).stream().map(row -> row.get("text").asText()).toList();
    }

    private static List<String> ids(JsonNode array) {
        return list(array).stream().map(row -> row.get("id").asText()).toList();
    }
}
