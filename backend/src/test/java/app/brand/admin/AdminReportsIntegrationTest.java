package app.brand.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.board.BoardPost;
import app.brand.board.BoardPostRepository;
import app.brand.board.BoardPostState;
import app.brand.common.events.AccountApproved;
import app.brand.common.events.UserWarned;
import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.event.Event;
import app.brand.event.EventRepository;
import app.brand.message.InboxMessage;
import app.brand.message.InboxMessageRepository;
import app.brand.message.MessageState;
import app.brand.realtime.BoardChanged;
import app.brand.safety.Report;
import app.brand.safety.ReportService;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.support.AbstractIntegrationTest;
import app.brand.thread.Thread;
import app.brand.thread.ThreadMessage;
import app.brand.thread.ThreadMessageRepository;
import app.brand.thread.ThreadParticipant;
import app.brand.thread.ThreadParticipantRepository;
import app.brand.thread.ThreadRepository;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Brief §4.9 and §5 — the reports queue, the flagged list [B9], and the rule the
 * whole product rests on: <b>an admin triages anonymously and every identity view
 * is written down</b>.
 *
 * <p>So the assertions come in pairs. A list is checked for what it shows
 * <em>and</em> for the absence of any identity; a detail is checked for the
 * identity <em>and</em> for the audit row that had to be written first. An
 * unaudited identity view is not a detail — it is the bug this file exists to
 * catch.
 */
@RecordApplicationEvents
class AdminReportsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SectionRepository sections;

    @Autowired
    private EventRepository events;

    @Autowired
    private InboxMessageRepository inboxMessages;

    @Autowired
    private BoardPostRepository boardPosts;

    @Autowired
    private ThreadRepository threads;

    @Autowired
    private ThreadMessageRepository threadMessages;

    @Autowired
    private ThreadParticipantRepository threadParticipants;

    @Autowired
    private ReportService reportService;

    @Autowired
    private AuditLogRepository auditLog;

    @Autowired
    private AdminBootstrap bootstrap;

    @Autowired
    private ApplicationEvents applicationEvents;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    /**
     * {@code SchemaMigrationTest} proves nothing is seeded (principle 4) by counting
     * these tables, so every test that writes to them clears up after itself. The
     * order is the foreign keys': a thread holds its origin message, and
     * {@code on delete restrict} means the message cannot go first.
     */
    @org.junit.jupiter.api.AfterEach
    void clearUp() {
        jdbc.update("delete from thread_message");
        jdbc.update("delete from thread_participant");
        jdbc.update("delete from thread");
        jdbc.update("delete from report");
        jdbc.update("delete from board_post");
        jdbc.update("delete from inbox_message");
        jdbc.update("delete from event_member");
        jdbc.update("delete from event");
    }

    /* -------------------------------------------------------------- access */

    @Test
    @DisplayName("a member reaches neither the queue nor an identity view: 403, not 404")
    void memberIsForbidden() throws Exception {
        Account member = member("Curious Member");
        Report report = reportOn(message(member("Writer"), member, event(), "hello", null), member);

        mockMvc.perform(get("/admin/api/reports").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
        mockMvc.perform(get("/admin/api/reports/" + report.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/admin/api/flagged").header(HttpHeaders.AUTHORIZATION, bearer(member)))
                .andExpect(status().isForbidden());

        // And the identity view a member could not reach wrote nothing.
        assertThat(auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(report.getId(), "identity_view"))
                .isEmpty();
    }

    /* ---------------------------------------------------------------- list */

    @Test
    @DisplayName("the queue shows content, reporter and the sender as members see them — never an identity")
    void listCarriesNoIdentity() throws Exception {
        Account admin = admin();
        Event event = event();
        Account reporter = member("Rea Porter");
        Account writer = member("Zeynep Yilmaz");

        InboxMessage hinted = inboxMessages.save(InboxMessage.deliver(writer.id, reporter.id,
                event.getId(), "you were loud last night",
                Anonymity.from(AnonymityLevel.HINT, new AllowedHints(true, true, false), section().getId()),
                MessageState.NEW, false, false, false, null, Instant.now()));
        Report report = reportOn(hinted, reporter, "harassment");

        MvcResult result = mockMvc.perform(get("/admin/api/reports")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode row = rowFor(result, report.getId());
        assertThat(row.get("targetKind").asText()).isEqualTo("inbox_message");
        assertThat(row.get("targetId").asText()).isEqualTo(hinted.getId().toString());
        assertThat(row.get("reason").asText()).isEqualTo("harassment");
        assertThat(row.get("status").asText()).isEqualTo("open");
        assertThat(row.get("reporter").get("name").asText()).isEqualTo("Rea Porter");
        assertThat(row.get("content").get("text").asText()).isEqualTo("you were loud last night");
        assertThat(row.get("content").get("kind").asText()).isEqualTo("inbox_message");
        assertThat(row.get("content").get("eventName").asText()).isEqualTo(event.getName());

        // The sender exactly as the recipient sees them: chips, no name, no id.
        JsonNode display = row.get("senderDisplay");
        assertThat(display.get("level").asText()).isEqualTo("hint");
        assertThat(display.get("hints").get("section").asText()).isEqualTo(section().getName());
        assertThat(display.has("name")).isFalse();
        assertThat(row.has("sender")).isFalse();
        assertThat(result.getResponse().getContentAsString()).doesNotContain(writer.id.toString());

        // Newest first, and never older-before-newer.
        List<Instant> times = timesOf(result);
        for (int i = 1; i < times.size(); i++) {
            assertThat(times.get(i)).isBeforeOrEqualTo(times.get(i - 1));
        }
    }

    @Test
    @DisplayName("the queue defaults to open; status=all lists the rest and nonsense is 422")
    void listFilters() throws Exception {
        Account admin = admin();
        Account reporter = member("Filter Reporter");
        Report report = reportOn(message(member("Writer"), reporter, event(), "text", null), reporter);

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/dismiss")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        assertThat(idsOf(mockMvc.perform(get("/admin/api/reports")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk()).andReturn()))
                .doesNotContain(report.getId().toString());

        assertThat(idsOf(mockMvc.perform(get("/admin/api/reports?status=dismissed")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk()).andReturn()))
                .contains(report.getId().toString());

        assertThat(idsOf(mockMvc.perform(get("/admin/api/reports?status=all")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk()).andReturn()))
                .contains(report.getId().toString());

        mockMvc.perform(get("/admin/api/reports?status=nonsense")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("status"));
    }

    /* -------------------------------------------------------------- detail */

    @Test
    @DisplayName("the detail names the sender and writes exactly one identity_view row per call")
    void detailIsAudited() throws Exception {
        Account admin = admin();
        Account reporter = member("Ayse Reporter");
        Account writer = member("Anonymous Writer");
        InboxMessage message = message(writer, reporter, event(), "meet me outside", null);
        Report report = reportOn(message, reporter, "identity");

        mockMvc.perform(get("/admin/api/reports/" + report.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sender.id").value(writer.id.toString()))
                .andExpect(jsonPath("$.sender.name").value("Anonymous Writer"))
                .andExpect(jsonPath("$.sender.email").value(writer.email))
                // [D11] the country rides on the section and is never a field of its own.
                .andExpect(jsonPath("$.sender.section")
                        .value(section().getName() + " · " + section().getCountry().getName()))
                .andExpect(jsonPath("$.senderDisplay.level").value("anonymous"))
                .andExpect(jsonPath("$.content.text").value("meet me outside"));

        List<AuditLog> rows =
                auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(report.getId(), "identity_view");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getActorId()).isEqualTo(admin.id);
        assertThat(rows.get(0).getSubjectUserId()).isEqualTo(writer.id);
        assertThat(rows.get(0).getSubjectKind()).isEqualTo("inbox_message");
        assertThat(rows.get(0).getDetails()).contains("identity");

        // No dedupe: "how many times was this looked at" is the question the log answers.
        mockMvc.perform(get("/admin/api/reports/" + report.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());
        assertThat(auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(report.getId(), "identity_view"))
                .hasSize(2);

        mockMvc.perform(get("/admin/api/reports/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a reported thread shows the other side and the last 20 bubbles, mine from the reporter")
    void threadDetail() throws Exception {
        Account admin = admin();
        Account reporter = member("Thread Reporter");
        Account other = member("Other Side");
        Event event = event();

        Thread thread = thread(event, reporter, other);
        for (int seq = 1; seq <= 25; seq++) {
            boolean fromReporter = seq % 2 == 0;
            threadMessages.save(ThreadMessage.of(thread.getId(), seq,
                    fromReporter ? reporter.id : other.id, "bubble " + seq,
                    fromReporter ? named() : anonymous(), null, Instant.now()));
        }
        Report report = reportService.file(reporter.id, Report.THREAD, thread.getId(), "harassment");

        MvcResult result = mockMvc.perform(get("/admin/api/reports/" + report.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                // The "sender" of a thread report is the participant who is not the reporter.
                .andExpect(jsonPath("$.sender.name").value("Other Side"))
                .andExpect(jsonPath("$.senderDisplay.level").value("anonymous"))
                .andReturn();

        JsonNode detail = objectMapper.readTree(result.getResponse().getContentAsString());
        JsonNode bubbles = detail.get("content").get("messages");
        assertThat(bubbles).hasSize(20);
        assertThat(bubbles.get(0).get("text").asText()).isEqualTo("bubble 6");
        assertThat(bubbles.get(19).get("text").asText()).isEqualTo("bubble 25");
        // seq 25 is odd, so it is the other side's: not the reporter's.
        assertThat(bubbles.get(19).get("mine").asBoolean()).isFalse();
        assertThat(bubbles.get(18).get("mine").asBoolean()).isTrue();
        // Not one id of the person behind the anonymous bubbles is on the wire...
        assertThat(bubbles.toString()).doesNotContain(other.id.toString());

        assertThat(auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(report.getId(), "identity_view"))
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.getSubjectKind()).isEqualTo("thread");
                    assertThat(row.getSubjectUserId()).isEqualTo(other.id);
                });
    }

    /* ------------------------------------------------------------- actions */

    @Test
    @DisplayName("dismiss resolves the report, and a second decision on it is 409")
    void dismissIsFinalForTheQueue() throws Exception {
        Account admin = admin();
        Account reporter = member("Dismissing Reporter");
        Report report = reportOn(message(member("Writer"), reporter, event(), "nothing much", null), reporter);

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/dismiss")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("dismissed"));

        for (String verb : List.of("dismiss", "hide", "warn", "ban")) {
            mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/" + verb)
                            .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("conflict"));
        }
    }

    @Test
    @DisplayName("hiding a board post takes it off the board, keeps the row, and refreshes every board")
    void hideBoardPost() throws Exception {
        Account admin = admin();
        Account reporter = member("Board Reporter");
        Account writer = member("Board Writer");
        Event event = event();
        BoardPost post = boardPosts.save(BoardPost.toRoom(event.getId(), writer.id, "a rude card",
                anonymous(), BoardPostState.APPROVED, BoardPost.IMMEDIATE, Instant.now()));
        Report report = reportService.file(reporter.id, Report.BOARD_POST, post.getId(), "hate");

        assertThat(boardPosts.published(event.getId(), BoardPostState.APPROVED, MessageState.APPROVED))
                .extracting(BoardPost::getId).contains(post.getId());

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/hide")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("hidden"));

        // [D6] Hidden, not removed: the row and its text are still there.
        BoardPost stored = boardPosts.findById(post.getId()).orElseThrow();
        assertThat(stored.getHiddenAt()).isNotNull();
        assertThat(stored.getHiddenBy()).isEqualTo(admin.id);
        assertThat(stored.getText()).isEqualTo("a rude card");
        assertThat(boardPosts.published(event.getId(), BoardPostState.APPROVED, MessageState.APPROVED))
                .extracting(BoardPost::getId).doesNotContain(post.getId());

        assertThat(applicationEvents.stream(BoardChanged.class))
                .anyMatch(changed -> changed.eventId().equals(event.getId()));
        assertThat(auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(post.getId(), "hide_content"))
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.getActorId()).isEqualTo(admin.id);
                    assertThat(row.getSubjectUserId()).isEqualTo(writer.id);
                    assertThat(row.getSubjectKind()).isEqualTo("board_post");
                });
    }

    @Test
    @DisplayName("hiding an inbox message soft-deletes it; the row and the report survive [D12]")
    void hideInboxMessage() throws Exception {
        Account admin = admin();
        Account reporter = member("Inbox Reporter");
        Account writer = member("Inbox Writer");
        InboxMessage message = message(writer, reporter, event(), "something cruel", null);
        Report report = reportOn(message, reporter, "hate");

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/hide")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("hidden"));

        InboxMessage stored = inboxMessages.findById(message.getId()).orElseThrow();
        assertThat(stored.getDeletedAt()).isNotNull();
        assertThat(stored.getText()).isEqualTo("something cruel");
        assertThat(inboxMessages.inboxOf(reporter.id)).extracting(InboxMessage::getId)
                .doesNotContain(message.getId());

        // The report is still answerable after the content left the inbox.
        MvcResult hidden = mockMvc.perform(get("/admin/api/reports?status=hidden")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(rowFor(hidden, report.getId()).get("content").get("text").asText())
                .isEqualTo("something cruel");
    }

    @Test
    @DisplayName("a thread cannot be hidden: 409, and the report stays open for warn or ban")
    void hideThreadIsRefused() throws Exception {
        Account admin = admin();
        Account reporter = member("No Hide Reporter");
        Account other = member("No Hide Other");
        Thread thread = thread(event(), reporter, other);
        threadMessages.save(ThreadMessage.of(thread.getId(), 1, other.id, "hi", anonymous(), null, Instant.now()));
        Report report = reportService.file(reporter.id, Report.THREAD, thread.getId(), "spam");

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/hide")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/warn")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("warned"));
    }

    @Test
    @DisplayName("warn audits and publishes UserWarned; the content is untouched")
    void warnTellsThePerson() throws Exception {
        Account admin = admin();
        Account reporter = member("Warning Reporter");
        Account writer = member("Warned Writer");
        InboxMessage message = message(writer, reporter, event(), "borderline", null);
        Report report = reportOn(message, reporter, "spam");

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/warn")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("warned"));

        assertThat(applicationEvents.stream(UserWarned.class))
                .anyMatch(warned -> warned.userId().equals(writer.id)
                        && warned.reportId().equals(report.getId()));
        assertThat(auditLog.findBySubjectUserIdAndActionOrderByCreatedAtDesc(writer.id, "warn_user"))
                .singleElement()
                .satisfies(row -> assertThat(row.getActorId()).isEqualTo(admin.id));
        assertThat(inboxMessages.findById(message.getId()).orElseThrow().getDeletedAt()).isNull();
    }

    @Test
    @DisplayName("ban closes the sender's account; a super_admin's content is 409, demote first")
    void banGoesThroughTheOneImplementation() throws Exception {
        Account admin = admin();
        Account reporter = member("Banning Reporter");
        Account writer = member("Banned Writer");
        Report report = reportOn(message(writer, reporter, event(), "way over the line", null),
                reporter, "harassment");

        mockMvc.perform(post("/admin/api/reports/" + report.getId() + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("banned"));

        assertThat(users.findById(writer.id).orElseThrow().getStatus()).isEqualTo(AccountStatus.BANNED);
        assertThat(auditLog.findBySubjectUserIdAndActionOrderByCreatedAtDesc(writer.id, "ban_user"))
                .isNotEmpty();

        // The founder cannot be banned out of their own product from the queue either.
        Account second = admin();
        Report onAdmin = reportOn(message(second, reporter, event(), "an admin wrote this", null),
                reporter, "spam");
        mockMvc.perform(post("/admin/api/reports/" + onAdmin.getId() + "/ban")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("conflict"));

        // The refused ban left the report open, so the admin can still act on it.
        assertThat(idsOf(mockMvc.perform(get("/admin/api/reports")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk()).andReturn()))
                .contains(onAdmin.getId().toString());
        assertThat(users.findById(second.id).orElseThrow().getStatus()).isEqualTo(AccountStatus.APPROVED);
    }

    /* ------------------------------------------------------------- flagged */

    @Test
    @DisplayName("[B9] the flagged list is soft-flagged messages only, with no identity until asked")
    void flaggedList() throws Exception {
        Account admin = admin();
        Account recipient = member("Flag Recipient");
        Account writer = member("Flag Writer");
        Event event = event();
        InboxMessage flagged = message(writer, recipient, event, "a soft word slipped through",
                InboxMessage.SOFT);
        InboxMessage clean = message(writer, recipient, event, "perfectly fine", null);

        MvcResult result = mockMvc.perform(get("/admin/api/flagged")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andReturn();
        List<String> ids = idsOf(result);
        assertThat(ids).contains(flagged.getId().toString()).doesNotContain(clean.getId().toString());
        assertThat(result.getResponse().getContentAsString()).doesNotContain(writer.id.toString());

        JsonNode row = rowFor(result, flagged.getId());
        assertThat(row.get("content").get("text").asText()).isEqualTo("a soft word slipped through");
        assertThat(row.get("content").get("eventName").asText()).isEqualTo(event.getName());
        assertThat(row.get("senderDisplay").get("level").asText()).isEqualTo("anonymous");
        assertThat(row.has("sender")).isFalse();

        mockMvc.perform(get("/admin/api/flagged/" + flagged.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sender.name").value("Flag Writer"))
                .andExpect(jsonPath("$.sender.email").value(writer.email));

        assertThat(auditLog.findBySubjectIdAndActionOrderByCreatedAtDesc(flagged.getId(), "identity_view"))
                .singleElement()
                .satisfies(row2 -> {
                    assertThat(row2.getActorId()).isEqualTo(admin.id);
                    assertThat(row2.getSubjectUserId()).isEqualTo(writer.id);
                    assertThat(row2.getSubjectKind()).isEqualTo("inbox_message");
                });

        mockMvc.perform(get("/admin/api/flagged/" + UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isNotFound());
    }

    /* -------------------------------------------------------------- events */

    @Test
    @DisplayName("approving an account publishes AccountApproved, so the push layer can tell them")
    void approvePublishesTheEvent() throws Exception {
        Account admin = admin();
        Account waiting = account(AccountStatus.PENDING);

        mockMvc.perform(post("/admin/api/users/" + waiting.id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk());

        assertThat(applicationEvents.stream(AccountApproved.class))
                .anyMatch(approved -> approved.userId().equals(waiting.id));
    }

    /* ------------------------------------------------------------ the page */

    @Test
    @DisplayName("[B11] the page still serves, carries the four tabs, and never says 'removed'")
    void pageCarriesTheNewTabs() throws Exception {
        String page = mockMvc.perform(get("/admin/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andReturn().getResponse().getContentAsString();

        assertThat(page).contains("data-tab=\"users\"")
                .contains("data-tab=\"reports\"")
                .contains("data-tab=\"flagged\"")
                .contains("data-tab=\"terms\"")
                .contains("audit log")
                .contains("Hide content");
        // [D6]/[D12] Hiding is never described as removing. The confirm copy says
        // what actually happens, including that the row is kept.
        String copy = page.toLowerCase(java.util.Locale.ROOT);
        assertThat(copy).doesNotContain("was removed")
                .doesNotContain("has been removed")
                .doesNotContain("permanently deleted");
        assertThat(page).contains("The post is kept").contains("The message is kept");
    }

    /* ------------------------------------------------------------ fixtures */

    private record Account(UUID id, String email, String accessToken) {
    }

    private static String bearer(Account account) {
        return "Bearer " + account.accessToken;
    }

    private Section section() {
        return sections.findAll().get(0);
    }

    private Anonymity anonymous() {
        return Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, section().getId());
    }

    private Anonymity named() {
        return Anonymity.from(AnonymityLevel.NAMED, AllowedHints.NONE, section().getId());
    }

    private Event event() {
        Instant now = Instant.now();
        return events.save(Event.create("Report Test Night", "section", section(),
                now.minusSeconds(3600), now.plusSeconds(3600), "azure", "post_immediately",
                joinCode(), null, now));
    }

    private static String joinCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            code.append(alphabet.charAt((int) (Math.random() * alphabet.length())));
        }
        return code.toString();
    }

    private InboxMessage message(Account sender, Account recipient, Event event,
                                 String text, String screeningFlag) {
        return inboxMessages.save(InboxMessage.deliver(sender.id, recipient.id, event.getId(), text,
                anonymous(), MessageState.NEW, false, false, false, screeningFlag, Instant.now()));
    }

    /** A real thread: the origin is a real inbox message, as the FK requires. */
    private Thread thread(Event event, Account reporter, Account other) throws Exception {
        InboxMessage origin = message(other, reporter, event, "the card this started from", null);
        Thread thread = threads.save(Thread.fromInboxMessage(origin.getId(), event.getId(), Instant.now()));
        threadParticipants.save(ThreadParticipant.of(thread.getId(), reporter.id, named(), Instant.now()));
        threadParticipants.save(ThreadParticipant.of(thread.getId(), other.id, anonymous(), Instant.now()));
        return thread;
    }

    private Report reportOn(InboxMessage message, Account reporter) {
        return reportOn(message, reporter, "spam");
    }

    private Report reportOn(InboxMessage message, Account reporter, String reason) {
        return reportService.file(reporter.id, Report.INBOX_MESSAGE, message.getId(), reason);
    }

    /** Registers a real account through the API, then puts it in the state under test. */
    private Account account(AccountStatus status) throws Exception {
        String email = "reports-test-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "correct horse",
                                "phone", "+90 555 000 0000"))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        UUID id = UUID.fromString(body.get("me").get("id").asText());
        if (status != AccountStatus.INCOMPLETE) {
            AppUser user = users.findById(id).orElseThrow();
            user.setStatus(status);
            user.setSection(section());
            user.setSubmittedAt(Instant.now());
            users.save(user);
        }
        return new Account(id, email, body.get("tokens").get("accessToken").asText());
    }

    /** An approved account with a name: the sender behind anonymous content. */
    private Account member(String name) throws Exception {
        Account account = account(AccountStatus.APPROVED);
        AppUser user = users.findById(account.id).orElseThrow();
        user.setName(name);
        users.save(user);
        return account;
    }

    private Account admin() throws Exception {
        Account account = account(AccountStatus.APPROVED);
        bootstrap.promote(account.email);
        return account;
    }

    /** Top-level row ids only: a nested {@code reporter.id} must not count as a row. */
    private List<String> idsOf(MvcResult result) throws Exception {
        List<String> ids = new java.util.ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString())) {
            ids.add(row.get("id").asText());
        }
        return ids;
    }

    private List<Instant> timesOf(MvcResult result) throws Exception {
        List<Instant> times = new java.util.ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString())) {
            times.add(Instant.parse(row.get("createdAt").asText()));
        }
        return times;
    }

    private JsonNode rowFor(MvcResult result, UUID id) throws Exception {
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString())) {
            if (row.get("id").asText().equals(id.toString())) {
                return row;
            }
        }
        throw new AssertionError("no row for " + id);
    }
}
