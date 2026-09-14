package app.brand.thread;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.board.BoardPost;
import app.brand.board.BoardPostRepository;
import app.brand.common.TextNormalizer;
import app.brand.content.AllowedHints;
import app.brand.message.InboxMessage;
import app.brand.message.MessageDtos.SendWallMessageRequest;
import app.brand.message.MessageService;
import app.brand.realtime.ThreadsChanged;
import app.brand.safety.KeywordScreener;
import app.brand.safety.Report;
import app.brand.safety.ReportRepository;
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
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
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
 * Private threads — BACKEND_PLAN.md §3 "Threads", which is {@code mock.ts}'s
 * behaviour unchanged.
 *
 * <p>The cases worth naming: the person who wrote the origin joins the thread at
 * the level <em>that card</em> was written at, so answering an anonymous post
 * never outs them; a reveal changes what they send from then on and leaves every
 * bubble above it exactly as it was [D5]; a retry with the same {@code requestId}
 * returns the first thread and a different draft under the same key is a 409 [B7];
 * and blocking is by message id, so the blocker never learns who an anonymous
 * sender was [D6].
 */
@RecordApplicationEvents
class ThreadIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private BoardPostRepository posts;

    @Autowired
    private ReportRepository reports;

    @Autowired
    private ScreeningTermRepository terms;

    @Autowired
    private KeywordScreener screener;

    @Autowired
    private MessageService messageService;

    @Autowired
    private ThreadRepository threadRepository;

    @Autowired
    private ThreadMessageRepository threadMessages;

    @Autowired
    private RequestKeyRepository requestKeys;

    @Autowired
    private ThreadHousekeeping housekeeping;

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
        terms.deleteAll();
        screener.invalidate();
        jdbc.update("delete from request_key");
        jdbc.update("delete from thread_message");
        jdbc.update("delete from thread_participant");
        jdbc.update("delete from thread");
        jdbc.update("delete from report");
        jdbc.update("delete from block");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
        jdbc.update("delete from user_settings where user_id in "
                + "(select id from app_user where email like 'thread-%')");
    }

    /* ----------------------------------------------------------- opening */

    @Test
    @DisplayName("a thread opens from an inbox message, with the origin above the first bubble")
    void opensFromAnInboxMessage() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Saw you at the desk", "anonymous");

        String threadId = open(f.viewer, fromInbox(messageId, "Was that you?"));

        JsonNode detail = thread(f.viewer, threadId);
        assertThat(detail.get("origin").get("id").asText()).isEqualTo(messageId);
        assertThat(detail.get("origin").get("text").asText()).isEqualTo("Saw you at the desk");
        assertThat(detail.get("origin").get("mine").asBoolean()).isFalse();
        assertThat(detail.get("source").asText()).isEqualTo("Welcome night");
        assertThat(texts(detail.get("messages"))).containsExactly("Was that you?");
        assertThat(detail.get("messages").get(0).get("mine").asBoolean()).isTrue();
        assertThat(detail.get("messages").get(0).has("system")).isFalse();

        // Both sides are told; the transport for /user/queue/threads is B-3's [B12].
        assertThat(notified()).containsExactlyInAnyOrder(f.viewer.getId(), f.author.getId());
    }

    @Test
    @DisplayName("a thread opens from a published post, and from nothing else on that board")
    void opensFromAPublishedPost() throws Exception {
        Fixture f = fixture();
        String postId = roomPost(f.author, f.eventId, "Who is coming to the boat party?");

        String threadId = open(f.viewer, fromPost(postId, f.eventId, "Me!"));
        assertThat(thread(f.viewer, threadId).get("origin").get("text").asText())
                .isEqualTo("Who is coming to the boat party?");

        // A post waiting in a queue is on no board yet: 404, like an id that never was.
        UUID queued = event(f.sectionA, f.stranger.getId(), "approve_first");
        join(queued, f.viewer.getId());
        join(queued, f.author.getId());
        join(queued, f.stranger.getId());
        String pending = roomPost(f.author, queued, "Still waiting");
        openRaw(f.viewer, fromPost(pending, queued, "Hello"))
                .andExpect(status().isNotFound());

        // A post a moderator hid is off the board for everyone, opening included.
        String hidden = roomPost(f.author, f.eventId, "Taken down");
        mockMvc.perform(post("/events/" + f.eventId + "/posts/" + hidden + "/hide")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.author)))
                .andExpect(status().isNoContent());
        openRaw(f.viewer, fromPost(hidden, f.eventId, "Hello"))
                .andExpect(status().isNotFound());

        // A board the caller is not on answers the same way.
        UUID elsewhere = event(f.sectionA, f.author.getId(), "post_immediately");
        join(elsewhere, f.author.getId());
        String outside = roomPost(f.author, elsewhere, "Members only");
        openRaw(f.viewer, fromPost(outside, elsewhere, "Hello"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    @Test
    @DisplayName("your own card, an account that is not approved and a block are one 403")
    void refusedOpenings() throws Exception {
        Fixture f = fixture();

        // Answering yourself.
        String mine = roomPost(f.viewer, f.eventId, "My own post");
        refusedOpen(f.viewer, fromPost(mine, f.eventId, "Hello"));

        // The author is no longer an approved member.
        String messageId = inboxOrigin(f, "Before the queue", "anonymous");
        f.author.setStatus(AccountStatus.PENDING);
        users.saveAndFlush(f.author);
        refusedOpen(f.viewer, fromInbox(messageId, "Hello"));
        f.author.setStatus(AccountStatus.APPROVED);
        users.saveAndFlush(f.author);

        // Blocked, in either direction [D6]. The viewer's own block hides the
        // message itself, so that half is a 404 and the author's block is the 403.
        block(f.author.getId(), f.viewer.getId());
        refusedOpen(f.viewer, fromInbox(messageId, "Hello"));
        jdbc.update("delete from block");
        block(f.viewer.getId(), f.author.getId());
        openRaw(f.viewer, fromInbox(messageId, "Hello")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the text, the hints, the level and the request key are each their own 422")
    void openingValidation() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");

        invalidOpen(f.viewer, fromInbox(messageId, "   "), "text");
        invalidOpen(f.viewer, fromInbox(messageId, "x".repeat(281)), "text");

        Map<String, Object> hintWithoutHints = fromInbox(messageId, "Hello");
        hintWithoutHints.put("anonymityLevel", "hint");
        invalidOpen(f.viewer, hintWithoutHints, "allowedHints");

        Map<String, Object> unknownLevel = fromInbox(messageId, "Hello");
        unknownLevel.put("anonymityLevel", "secret");
        invalidOpen(f.viewer, unknownLevel, "anonymityLevel");

        Map<String, Object> noKey = fromInbox(messageId, "Hello");
        noKey.remove("requestId");
        invalidOpen(f.viewer, noKey, "requestId");

        Map<String, Object> longKey = fromInbox(messageId, "Hello");
        longKey.put("requestId", "k".repeat(101));
        invalidOpen(f.viewer, longKey, "requestId");

        Map<String, Object> unknownOrigin = fromInbox(messageId, "Hello");
        unknownOrigin.put("origin", Map.of("kind", "profile", "id", messageId));
        invalidOpen(f.viewer, unknownOrigin, "origin");

        // 280 exactly is fine; the opening message answers a card, so it is the
        // wall limit and not the thread's 500.
        open(f.viewer, fromInbox(messageId, "x".repeat(280)));
    }

    @Test
    @DisplayName("screening refuses a hard term and warns once about a soft one")
    void openingScreening() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");
        term("kötü", "hard");
        term("belki", "soft");

        openRaw(f.viewer, fromInbox(messageId, "Bu KÖTÜ bir şey"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));

        openRaw(f.viewer, fromInbox(messageId, "Belki gelirim"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));

        Map<String, Object> acknowledged = fromInbox(messageId, "Belki gelirim");
        acknowledged.put("screeningAcknowledged", true);
        open(f.viewer, acknowledged);
    }

    @Test
    @DisplayName("[B7] one request key is one thread; a different draft under it is a 409")
    void openingIsIdempotent() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");

        Map<String, Object> body = fromInbox(messageId, "Was that you?");
        String first = open(f.viewer, body);
        String retried = open(f.viewer, body);
        assertThat(retried).isEqualTo(first);
        assertThat(threadRepository.count()).isEqualTo(1);

        Map<String, Object> reused = fromInbox(messageId, "Something else entirely");
        reused.put("requestId", body.get("requestId"));
        openRaw(f.viewer, reused)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("request_key_reused"));

        // Keys are per account: the other person's identical key is their own.
        String toAuthor = inboxOriginFrom(f.viewer, f.author, f, "The other way round");
        Map<String, Object> theirs = fromInbox(toAuthor, "Hello back");
        theirs.put("requestId", body.get("requestId"));
        assertThat(open(f.author, theirs)).isNotEqualTo(first);
    }

    @Test
    @DisplayName("a retry after the other person was blocked is a 404, not a thread id")
    void retryAfterABlockIsNotVisible() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");
        Map<String, Object> body = fromInbox(messageId, "Was that you?");
        String threadId = open(f.viewer, body);

        blockByThread(f.viewer, threadId);
        openRaw(f.viewer, body).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("[D5] the author joins at the level their card was written at, chips and all")
    void authorJoinsAtTheOriginLevel() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "From your section", "hint", true, true, false);

        String threadId = open(f.viewer, fromInbox(messageId, "Which one of you?"));

        JsonNode other = thread(f.viewer, threadId).get("other");
        assertThat(other.get("level").asText()).isEqualTo("hint");
        assertThat(other.get("hints").get("section").asText()).isEqualTo(f.sectionA.getName());
        assertThat(other.get("hints").get("country").asText())
                .isEqualTo(f.sectionA.getCountry().getName());
        assertThat(other.has("name")).isFalse();

        // [B4] The chips are the snapshot's: changing section later does not
        // rewrite what a card already said.
        f.author.setSection(f.sectionB);
        users.saveAndFlush(f.author);
        JsonNode after = thread(f.viewer, threadId).get("other");
        assertThat(after.get("hints").get("section").asText()).isEqualTo(f.sectionA.getName());
    }

    /* ------------------------------------------------------- the list */

    @Test
    @DisplayName("the list is newest last message first, with honest unread counts")
    void listIsOrderedAndCounted() throws Exception {
        Fixture f = fixture();
        String first = open(f.viewer, fromInbox(inboxOrigin(f, "One", "anonymous"), "First thread"));
        clock.freezeAt(base.plusSeconds(10));
        String second = open(f.viewer, fromInbox(inboxOrigin(f, "Two", "anonymous"), "Second thread"));
        clock.freezeAt(base.plusSeconds(20));
        send(f.author, first, "Reply on the older one", key()).andExpect(status().isNoContent());
        clock.freezeAt(base);

        JsonNode mine = threads(f.viewer);
        assertThat(ids(mine.get("threads"))).containsExactly(first, second);
        assertThat(mine.get("threads").get(0).get("lastMessage").get("text").asText())
                .isEqualTo("Reply on the older one");
        assertThat(mine.get("threads").get(0).get("unreadCount").asLong()).isEqualTo(1);
        assertThat(mine.get("threads").get(1).get("unreadCount").asLong()).isZero();
        assertThat(mine.get("unreadCount").asLong()).isEqualTo(1);
        assertThat(mine.get("threads").get(0).get("source").asText()).isEqualTo("Welcome night");

        // The author has not read either opening message.
        JsonNode theirs = threads(f.author);
        assertThat(theirs.get("unreadCount").asLong()).isEqualTo(2);
    }

    @Test
    @DisplayName("[D6] blocking drops the thread from the blocker's list, not from the other's")
    void listExcludesBlockedPeople() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "Hello"));

        blockByThread(f.viewer, threadId);

        assertThat(threads(f.viewer).get("threads")).isEmpty();
        mockMvc.perform(get("/threads/" + threadId).header(HttpHeaders.AUTHORIZATION, bearer(f.viewer)))
                .andExpect(status().isNotFound());
        assertThat(ids(threads(f.author).get("threads"))).containsExactly(threadId);
    }

    /* ------------------------------------------------------- the detail */

    @Test
    @DisplayName("the detail carries no id but the thread's, its messages' and the origin's")
    void detailCarriesNoIdentifiers() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "named");
        String threadId = open(f.viewer, fromInbox(messageId, "Hello"));
        send(f.author, threadId, "Hi there", key()).andExpect(status().isNoContent());

        JsonNode detail = thread(f.viewer, threadId);
        Set<String> allowed = new HashSet<>();
        allowed.add(threadId);
        allowed.add(messageId);
        detail.get("messages").forEach(row -> allowed.add(row.get("id").asText()));

        Set<String> found = new HashSet<>();
        collectUuids(detail, found);
        assertThat(found).isSubsetOf(allowed);
        assertThat(found).doesNotContain(f.viewer.getId().toString(), f.author.getId().toString(),
                f.eventId.toString());
    }

    @Test
    @DisplayName("mine, canReveal and blockMessageId describe the thread from the caller's side")
    void detailShape() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");
        String threadId = open(f.viewer, fromInbox(messageId, "Hello"));

        // Only the viewer has written, so there is nothing of the other person's to
        // block yet: the origin is what the block acts on.
        JsonNode before = thread(f.viewer, threadId);
        assertThat(before.get("blockMessageId").asText()).isEqualTo(messageId);
        assertThat(before.get("canReveal").asBoolean()).isTrue();
        assertThat(before.get("mySender").get("level").asText()).isEqualTo("anonymous");

        send(f.author, threadId, "Hi there", key()).andExpect(status().isNoContent());
        JsonNode after = thread(f.viewer, threadId);
        assertThat(texts(after.get("messages"))).containsExactly("Hello", "Hi there");
        assertThat(mines(after.get("messages"))).containsExactly(true, false);
        assertThat(after.get("blockMessageId").asText())
                .isEqualTo(after.get("messages").get(1).get("id").asText());

        // The author's side of the same thread, mirrored.
        JsonNode theirs = thread(f.author, threadId);
        assertThat(mines(theirs.get("messages"))).containsExactly(false, true);
        assertThat(theirs.get("origin").get("mine").asBoolean()).isTrue();
        assertThat(theirs.get("blockMessageId").asText())
                .isEqualTo(theirs.get("messages").get(0).get("id").asText());
    }

    @Test
    @DisplayName("reading the thread marks nothing read")
    void readingDoesNotMarkRead() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "Hello"));

        thread(f.author, threadId);
        assertThat(threads(f.author).get("unreadCount").asLong()).isEqualTo(1);
    }

    /* --------------------------------------------------------- sending */

    @Test
    @DisplayName("a reply appends one row, at the sender's current level, and numbers it next")
    void sendAppendsInOrder() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));
        clock.freezeAt(base.plusSeconds(1));
        send(f.viewer, threadId, "Two", key()).andExpect(status().isNoContent());
        clock.freezeAt(base.plusSeconds(2));
        send(f.author, threadId, "Three", key()).andExpect(status().isNoContent());
        clock.freezeAt(base);

        assertThat(texts(thread(f.viewer, threadId).get("messages")))
                .containsExactly("One", "Two", "Three");
        assertThat(threadMessages.findByThreadIdOrderBySeqAsc(UUID.fromString(threadId)).stream()
                .map(ThreadMessage::getSeq).toList()).containsExactly(1L, 2L, 3L);
        assertThat(notified()).contains(f.viewer.getId(), f.author.getId());
    }

    @Test
    @DisplayName("[B7] a retried send appends once; a different draft under the key is a 409")
    void sendIsIdempotent() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        String requestId = key();
        send(f.viewer, threadId, "Two", requestId).andExpect(status().isNoContent());
        send(f.viewer, threadId, "Two", requestId).andExpect(status().isNoContent());
        assertThat(texts(thread(f.viewer, threadId).get("messages"))).containsExactly("One", "Two");

        send(f.viewer, threadId, "Three", requestId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("request_key_reused"));
    }

    @Test
    @DisplayName("a send is refused when the other person is gone or has blocked you")
    void sendRefusals() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        f.author.setStatus(AccountStatus.BANNED);
        users.saveAndFlush(f.author);
        send(f.viewer, threadId, "Two", key())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));
        f.author.setStatus(AccountStatus.APPROVED);
        users.saveAndFlush(f.author);

        block(f.author.getId(), f.viewer.getId());
        send(f.viewer, threadId, "Two", key())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));
    }

    @Test
    @DisplayName("a reply is 1–500 characters, screened, and needs its request key")
    void sendValidation() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        send(f.viewer, threadId, "x".repeat(501), key())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("text"));
        send(f.viewer, threadId, "  ", key())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("text"));
        send(f.viewer, threadId, "x".repeat(500), key()).andExpect(status().isNoContent());

        send(f.viewer, threadId, "Fine", null)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("requestId"));

        term("kötü", "hard");
        send(f.viewer, threadId, "Bu kötü", key())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));
    }

    @Test
    @DisplayName("a thread that is not yours is 404 on every route")
    void strangersSeeNothing() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        mockMvc.perform(get("/threads/" + threadId).header(HttpHeaders.AUTHORIZATION, bearer(f.stranger)))
                .andExpect(status().isNotFound());
        send(f.stranger, threadId, "Hello", key()).andExpect(status().isNotFound());
        reveal(f.stranger, threadId).andExpect(status().isNotFound());
        read(f.stranger, threadId, UUID.randomUUID().toString()).andExpect(status().isNotFound());
        reportThread(f.stranger, threadId, "spam").andExpect(status().isNotFound());
        assertThat(threads(f.stranger).get("threads")).isEmpty();
    }

    /* ------------------------------------------------------ the watermark */

    @Test
    @DisplayName("the read watermark only moves forward, and only tells the reader")
    void readWatermark() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));
        send(f.viewer, threadId, "Two", key()).andExpect(status().isNoContent());
        List<String> ids = ids(thread(f.author, threadId).get("messages"));

        read(f.author, threadId, UUID.randomUUID().toString())
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("throughMessageId"));
        read(f.author, threadId, "not-an-id")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("throughMessageId"));

        assertThat(threads(f.author).get("unreadCount").asLong()).isEqualTo(2);
        applicationEvents.clear();
        read(f.author, threadId, ids.get(1)).andExpect(status().isNoContent());
        assertThat(threads(f.author).get("unreadCount").asLong()).isZero();
        assertThat(notified()).containsExactly(f.author.getId());

        // Backwards is accepted and changes nothing — and nobody is told.
        applicationEvents.clear();
        read(f.author, threadId, ids.get(0)).andExpect(status().isNoContent());
        assertThat(threads(f.author).get("unreadCount").asLong()).isZero();
        assertThat(notified()).isEmpty();

        // The other side's count is its own business.
        assertThat(threads(f.viewer).get("unreadCount").asLong()).isZero();
    }

    /* --------------------------------------------------------- revealing */

    @Test
    @DisplayName("[D5] a reveal changes what you send next and nothing you already sent")
    void revealLeavesOldBubblesAlone() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        applicationEvents.clear();
        reveal(f.viewer, threadId).andExpect(status().isNoContent());
        reveal(f.viewer, threadId).andExpect(status().isNoContent());

        JsonNode detail = thread(f.viewer, threadId);
        assertThat(detail.get("messages")).hasSize(2);
        assertThat(detail.get("messages").get(0).get("sender").get("level").asText())
                .isEqualTo("anonymous");
        JsonNode system = detail.get("messages").get(1);
        assertThat(system.get("system").asText()).isEqualTo("revealed");
        assertThat(system.get("text").asText()).isEmpty();
        assertThat(system.get("sender").get("level").asText()).isEqualTo("named");
        assertThat(system.get("sender").get("name").asText()).isEqualTo("Ece Kara");
        assertThat(detail.get("canReveal").asBoolean()).isFalse();
        assertThat(detail.get("mySender").get("level").asText()).isEqualTo("named");
        assertThat(notified()).contains(f.viewer.getId(), f.author.getId());

        // From here on the viewer sends as themselves.
        send(f.viewer, threadId, "It was me", key()).andExpect(status().isNoContent());
        JsonNode counterpart = thread(f.author, threadId);
        assertThat(counterpart.get("other").get("level").asText()).isEqualTo("named");
        assertThat(counterpart.get("messages").get(2).get("sender").get("name").asText())
                .isEqualTo("Ece Kara");
        assertThat(counterpart.get("messages").get(0).get("sender").get("level").asText())
                .isEqualTo("anonymous");
    }

    @Test
    @DisplayName("a reveal is refused when the other person is gone or has blocked you")
    void revealRefusals() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        block(f.author.getId(), f.viewer.getId());
        reveal(f.viewer, threadId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"));
    }

    /* --------------------------------------------------- report and block */

    @Test
    @DisplayName("the whole thread is reported, once per person, on one of five reasons")
    void reportingAThread() throws Exception {
        Fixture f = fixture();
        String threadId = open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "One"));

        reportThread(f.viewer, threadId, "nonsense")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("reason"));
        reportThread(f.viewer, threadId, "harassment").andExpect(status().isNoContent());
        reportThread(f.viewer, threadId, "harassment").andExpect(status().isNoContent());

        List<Report> filed = reports.findAll();
        assertThat(filed).hasSize(1);
        assertThat(filed.get(0).getTargetKind()).isEqualTo(Report.THREAD);
        assertThat(filed.get(0).getTargetId()).isEqualTo(UUID.fromString(threadId));
    }

    @Test
    @DisplayName("[D6] block is by a message the other person wrote, and never by your own")
    void blockingFromAThread() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "anonymous");
        String threadId = open(f.viewer, fromInbox(messageId, "One"));
        send(f.author, threadId, "Two", key()).andExpect(status().isNoContent());
        List<String> ids = ids(thread(f.viewer, threadId).get("messages"));

        blockThread(f.viewer, threadId, ids.get(0))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("messageId"));
        blockThread(f.viewer, threadId, UUID.randomUUID().toString())
                .andExpect(status().isUnprocessableEntity());
        blockThread(f.viewer, threadId, ids.get(1)).andExpect(status().isNoContent());

        // The blocker loses the thread; the blocked side is told nothing and keeps it.
        mockMvc.perform(get("/threads/" + threadId).header(HttpHeaders.AUTHORIZATION, bearer(f.viewer)))
                .andExpect(status().isNotFound());
        assertThat(ids(threads(f.author).get("threads"))).containsExactly(threadId);

        // The Blocked list shows only what that message already showed.
        JsonNode blocked = json(mockMvc.perform(get("/me/blocks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.viewer)))
                .andExpect(status().isOk()));
        assertThat(blocked).hasSize(1);
        assertThat(blocked.get(0).get("sender").get("level").asText()).isEqualTo("anonymous");
        assertThat(blocked.get(0).get("sender").has("name")).isFalse();
    }

    @Test
    @DisplayName("the origin card can be blocked when it is the other person's")
    void blockingTheOrigin() throws Exception {
        Fixture f = fixture();
        String messageId = inboxOrigin(f, "Origin", "hint", true, false, false);
        String threadId = open(f.viewer, fromInbox(messageId, "One"));

        blockThread(f.viewer, threadId, messageId).andExpect(status().isNoContent());
        JsonNode blocked = json(mockMvc.perform(get("/me/blocks")
                        .header(HttpHeaders.AUTHORIZATION, bearer(f.viewer)))
                .andExpect(status().isOk()));
        assertThat(blocked.get(0).get("sender").get("level").asText()).isEqualTo("hint");
        assertThat(blocked.get(0).get("sender").get("hints").get("section").asText())
                .isEqualTo(f.sectionA.getName());
    }

    /* ------------------------------------------- rate limit, housekeeping */

    @Test
    @DisplayName("CLAUDE.md §5: the twenty-first opening in a day is a 429, tomorrow's is not")
    void openingsAreRateLimited() throws Exception {
        Fixture f = fixture();
        List<String> origins = new ArrayList<>();
        for (int i = 0; i < 21; i++) {
            origins.add(inboxOrigin(f, "Origin " + i, "anonymous"));
        }

        for (int i = 0; i < 20; i++) {
            open(f.viewer, fromInbox(origins.get(i), "Reply " + i));
        }
        openRaw(f.viewer, fromInbox(origins.get(20), "One too many"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));

        // The limit is a rolling day; the same request tomorrow is ordinary.
        clock.freezeAt(base.plusSeconds(86_401));
        open(f.viewer, fromInbox(origins.get(20), "One too many"));
        clock.freezeAt(base);
    }

    @Test
    @DisplayName("[B7] the purge removes request keys older than seven days and nothing else")
    void requestKeysArePurged() throws Exception {
        Fixture f = fixture();
        open(f.viewer, fromInbox(inboxOrigin(f, "Origin", "anonymous"), "Fresh"));
        clock.freezeAt(base.minus(8, ChronoUnit.DAYS));
        open(f.viewer, fromInbox(inboxOrigin(f, "Older", "anonymous"), "Old"));
        clock.freezeAt(base);

        assertThat(requestKeys.count()).isEqualTo(2);
        housekeeping.run();
        assertThat(requestKeys.count()).isEqualTo(1);
        // The thread the purged key produced is untouched; only the retry window closed.
        assertThat(threadRepository.count()).isEqualTo(2);
    }

    /* --------------------------------------------------------------- helpers */

    private record Fixture(UUID eventId,
                           AppUser viewer,
                           AppUser author,
                           AppUser stranger,
                           Section sectionA,
                           Section sectionB) {
    }

    /** A viewer, the person whose card they answer, and someone with nothing to do with it. */
    private Fixture fixture() {
        List<Section> all = sections.findAll().stream()
                .sorted(Comparator.comparing(Section::getName)).toList();
        Section sectionA = all.get(0);
        Section sectionB = all.get(1);
        AppUser viewer = approved(sectionA, "Ece Kara");
        AppUser author = approved(sectionA, "Deniz Yıldız");
        AppUser stranger = approved(sectionB, "Ada Su");
        UUID eventId = event(sectionA, author.getId(), "post_immediately");
        join(eventId, viewer.getId());
        join(eventId, author.getId());
        join(eventId, stranger.getId());
        return new Fixture(eventId, viewer, author, stranger, sectionA, sectionB);
    }

    /** A message the author sent the viewer: the ordinary origin of a thread. */
    private String inboxOrigin(Fixture f, String text, String level) {
        return inboxOrigin(f, text, level, false, false, false);
    }

    private String inboxOrigin(Fixture f, String text, String level,
                               boolean section, boolean country, boolean letter) {
        InboxMessage row = messageService.deliver(f.author.getId(), new SendWallMessageRequest(
                f.eventId.toString(), f.viewer.getId().toString(), text, level,
                new AllowedHints(section, country, letter), null), false);
        return row.getId().toString();
    }

    private String inboxOriginFrom(AppUser sender, AppUser recipient, Fixture f, String text) {
        InboxMessage row = messageService.deliver(sender.getId(), new SendWallMessageRequest(
                f.eventId.toString(), recipient.getId().toString(), text, "anonymous",
                AllowedHints.NONE, null), false);
        return row.getId().toString();
    }

    /** A published room post; the board is {@code post_immediately} unless said otherwise. */
    private String roomPost(AppUser sender, UUID eventId, String text) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("anonymityLevel", "anonymous");
        body.put("allowedHints", new HashMap<String, Object>());
        mockMvc.perform(post("/events/" + eventId + "/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(sender))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(body)))
                .andExpect(status().isOk());
        return posts.findAll().stream()
                .filter(row -> row.getEventId().equals(eventId) && row.getText().equals(text))
                .findFirst().map(BoardPost::getId).orElseThrow().toString();
    }

    private Map<String, Object> fromInbox(String messageId, String text) {
        return openBody(Map.of("kind", "inbox", "id", messageId), text);
    }

    private Map<String, Object> fromPost(String postId, UUID eventId, String text) {
        return openBody(Map.of("kind", "post", "id", postId, "eventId", eventId.toString()), text);
    }

    private Map<String, Object> openBody(Map<String, Object> origin, String text) {
        Map<String, Object> body = new HashMap<>();
        body.put("origin", origin);
        body.put("text", text);
        body.put("anonymityLevel", "anonymous");
        body.put("allowedHints", new HashMap<String, Object>());
        body.put("requestId", key());
        return body;
    }

    private ResultActions openRaw(AppUser viewer, Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/threads")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    private String open(AppUser viewer, Map<String, Object> body) throws Exception {
        return json(openRaw(viewer, body).andExpect(status().isOk())).get("id").asText();
    }

    private void refusedOpen(AppUser viewer, Map<String, Object> body) throws Exception {
        openRaw(viewer, body)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("delivery_unavailable"))
                .andExpect(jsonPath("$.field").doesNotExist());
    }

    private void invalidOpen(AppUser viewer, Map<String, Object> body, String field) throws Exception {
        openRaw(viewer, body)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value(field));
    }

    private ResultActions send(AppUser viewer, String threadId, String text, String requestId)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        if (requestId != null) {
            body.put("requestId", requestId);
        }
        return mockMvc.perform(post("/threads/" + threadId + "/messages")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(body)));
    }

    private ResultActions read(AppUser viewer, String threadId, String messageId) throws Exception {
        return mockMvc.perform(put("/threads/" + threadId + "/read")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("throughMessageId", messageId))));
    }

    private ResultActions reveal(AppUser viewer, String threadId) throws Exception {
        return mockMvc.perform(post("/threads/" + threadId + "/reveal")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer)));
    }

    private ResultActions reportThread(AppUser viewer, String threadId, String reason) throws Exception {
        return mockMvc.perform(post("/threads/" + threadId + "/report")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("reason", reason))));
    }

    private ResultActions blockThread(AppUser viewer, String threadId, String messageId)
            throws Exception {
        return mockMvc.perform(post("/threads/" + threadId + "/block")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("messageId", messageId))));
    }

    /** Block the other participant of a thread, through the product's own route. */
    private void blockByThread(AppUser viewer, String threadId) throws Exception {
        String messageId = thread(viewer, threadId).get("blockMessageId").asText();
        blockThread(viewer, threadId, messageId).andExpect(status().isNoContent());
    }

    private JsonNode threads(AppUser viewer) throws Exception {
        return json(mockMvc.perform(get("/me/threads")
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
    }

    private JsonNode thread(AppUser viewer, String id) throws Exception {
        return json(mockMvc.perform(get("/threads/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk()));
    }

    private Set<UUID> notified() {
        Set<UUID> ids = new HashSet<>();
        applicationEvents.stream(ThreadsChanged.class).forEach(event -> ids.addAll(event.userIds()));
        return ids;
    }

    private static List<String> texts(JsonNode rows) {
        List<String> values = new ArrayList<>();
        rows.forEach(row -> values.add(row.get("text").asText()));
        return values;
    }

    private static List<String> ids(JsonNode rows) {
        List<String> values = new ArrayList<>();
        rows.forEach(row -> values.add(row.get("id").asText()));
        return values;
    }

    private static List<Boolean> mines(JsonNode rows) {
        List<Boolean> values = new ArrayList<>();
        rows.forEach(row -> values.add(row.get("mine").asBoolean()));
        return values;
    }

    /** Every UUID-shaped string anywhere in a response, so a leak cannot hide in a corner. */
    private static void collectUuids(JsonNode node, Set<String> found) {
        if (node.isContainerNode()) {
            node.forEach(child -> collectUuids(child, found));
        } else if (node.isTextual() && node.asText()
                .matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            found.add(node.asText());
        }
    }

    private void term(String word, String severity) {
        terms.saveAndFlush(ScreeningTerm.of(word, TextNormalizer.normalizeForSearch(word),
                severity, null, Instant.now()));
        screener.invalidate();
    }

    private void block(UUID blockerId, UUID blockedId) {
        jdbc.update("insert into block (blocker_id, blocked_id, display_level) values (?, ?, 'anonymous')",
                blockerId, blockedId);
    }

    private UUID event(Section section, UUID creatorId, String boardMode) {
        return jdbc.queryForObject("""
                        insert into event (name, scope, section_id, starts_at, ends_at, cover,
                                           board_mode, join_code, creator_id)
                        values ('Welcome night', 'section', ?, ?, ?, 'coral', ?, ?, ?)
                        returning id
                        """,
                UUID.class, section.getId(), Timestamp.from(base.minusSeconds(3600)),
                Timestamp.from(base.plusSeconds(3600)), boardMode, joinCode(), creatorId);
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

    private static String key() {
        return UUID.randomUUID().toString();
    }

    private AppUser approved(Section section, String name) {
        AppUser user = AppUser.register(
                "thread-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null,
                Instant.now());
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
}
