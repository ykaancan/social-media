package app.brand.admin;

import app.brand.admin.AdminReportDtos.FlaggedDetailDto;
import app.brand.admin.AdminReportDtos.FlaggedRowDto;
import app.brand.admin.AdminReportDtos.ReportContentDto;
import app.brand.admin.AdminReportDtos.ReportDetailDto;
import app.brand.admin.AdminReportDtos.ReportRowDto;
import app.brand.admin.AdminReportDtos.ReporterDto;
import app.brand.admin.AdminReportDtos.SenderIdentityDto;
import app.brand.admin.AdminReportDtos.ThreadBubbleDto;
import app.brand.board.BoardPost;
import app.brand.board.BoardPostRepository;
import app.brand.common.ApiException;
import app.brand.common.events.UserWarned;
import app.brand.content.MessageSenderDto;
import app.brand.content.SenderPresenter;
import app.brand.content.SenderRow;
import app.brand.event.Event;
import app.brand.event.EventRepository;
import app.brand.message.InboxMessage;
import app.brand.realtime.BoardChanged;
import app.brand.safety.Report;
import app.brand.section.Section;
import app.brand.thread.Thread;
import app.brand.thread.ThreadMessage;
import app.brand.thread.ThreadMessageRepository;
import app.brand.thread.ThreadParticipant;
import app.brand.thread.ThreadParticipantRepository;
import app.brand.thread.ThreadRepository;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Brief §4.9 and §5 — the reports queue, the flagged list [B9], and the one place
 * in the product where the person behind anonymous content is named.
 *
 * <p>The design is a single rule applied everywhere: <b>triage is anonymous,
 * identity is audited</b>. Every list renders the sender through
 * {@link SenderPresenter}, exactly as the members involved see them, so an admin
 * can work the whole queue without deanonymising anybody; the detail endpoints are
 * the only ones that name a sender, and each writes an {@code identity_view} row
 * before the response is built. Every call writes a row — there is no dedupe,
 * because "how many times was this looked at" is precisely the question the log
 * exists to answer.
 *
 * <p>Hiding does not delete [D6]/[D12]: a board post gets {@code hidden_at}, an
 * inbox message gets {@code deleted_at}, and both rows stay for the report, for a
 * second report, and for a KVKK question. Nothing here calls {@code BoardService}
 * or {@code MessageService} — the admin's decision is not a member action and must
 * not pick up a member surface's rules (a moderator check, a block filter) on the
 * way through.
 */
@Service
public class AdminReportService {

    /** Every list and action answers with the same statuses the column allows. */
    private static final Set<String> STATUSES =
            Set.of(Report.OPEN, Report.DISMISSED, Report.HIDDEN, Report.WARNED, Report.BANNED);

    /** How many bubbles of a reported conversation the admin is shown. */
    static final int THREAD_BUBBLES = 20;

    private final AdminReportRepository reports;
    private final AdminInboxRepository inboxMessages;
    private final BoardPostRepository boardPosts;
    private final ThreadRepository threads;
    private final ThreadMessageRepository threadMessages;
    private final ThreadParticipantRepository threadParticipants;
    private final EventRepository events;
    private final AppUserRepository users;
    private final AuditLogRepository auditLog;
    private final AdminUserService adminUsers;
    private final SenderPresenter presenter;
    private final ApplicationEventPublisher publisher;
    private final ObjectMapper json;
    private final Clock clock;

    public AdminReportService(AdminReportRepository reports,
                              AdminInboxRepository inboxMessages,
                              BoardPostRepository boardPosts,
                              ThreadRepository threads,
                              ThreadMessageRepository threadMessages,
                              ThreadParticipantRepository threadParticipants,
                              EventRepository events,
                              AppUserRepository users,
                              AuditLogRepository auditLog,
                              AdminUserService adminUsers,
                              SenderPresenter presenter,
                              ApplicationEventPublisher publisher,
                              ObjectMapper json,
                              Clock clock) {
        this.reports = reports;
        this.inboxMessages = inboxMessages;
        this.boardPosts = boardPosts;
        this.threads = threads;
        this.threadMessages = threadMessages;
        this.threadParticipants = threadParticipants;
        this.events = events;
        this.users = users;
        this.auditLog = auditLog;
        this.adminUsers = adminUsers;
        this.presenter = presenter;
        this.publisher = publisher;
        this.json = json;
        this.clock = clock;
    }

    /* ---------------------------------------------------------------- list */

    /** {@code all} lists every status; anything unknown is a 422, never a silent default. */
    @Transactional(readOnly = true)
    public List<ReportRowDto> list(String rawStatus) {
        String status = rawStatus == null ? "" : rawStatus.trim().toLowerCase(Locale.ROOT);
        List<Report> rows;
        if (status.equals("all")) {
            rows = reports.allNewestFirst();
        } else if (STATUSES.contains(status)) {
            rows = reports.byStatusNewestFirst(status);
        } else {
            throw ApiException.validation("unknown status", "status");
        }
        return rowsOf(rows);
    }

    /* -------------------------------------------------------------- detail */

    /**
     * The identity view. The audit row is written first and unconditionally: if
     * building the response then fails, the log still says an admin asked.
     */
    @Transactional
    public ReportDetailDto detail(UUID adminId, UUID reportId) {
        Report report = reports.findById(reportId)
                .orElseThrow(() -> ApiException.notFound("no such report"));
        Rendered rendered = render(List.of(report), true).get(report.getId());
        if (rendered == null || rendered.senderId() == null) {
            // Only real account deletion (KVKK) removes the content behind a report.
            throw ApiException.notFound("the reported content is gone");
        }

        auditLog.save(AuditLog.aboutContent(adminId, AuditAction.IDENTITY_VIEW, rendered.senderId(),
                report.getTargetKind(), report.getId(),
                details(Map.of("reason", report.getReason())), Instant.now(clock)));

        return ReportDetailDto.of(row(report, rendered), identityOf(rendered.senderId()));
    }

    /* ------------------------------------------------------------- actions */

    /** Read, but not acted on. Nothing is hidden and nobody is told. */
    @Transactional
    public ReportRowDto dismiss(UUID adminId, UUID reportId) {
        Report report = open(reportId);
        report.resolve(Report.DISMISSED, adminId, Instant.now(clock));
        return single(report);
    }

    /**
     * [D6]/[D12] Hidden, never destroyed. A board post stops being published and a
     * message leaves its recipient's inbox; both rows stay, so a second report, an
     * appeal or a KVKK question still has everything.
     *
     * <p>A thread cannot be hidden: it is two people's private conversation, there
     * is no surface to take it off, and hiding one side's copy would be a lie. The
     * admin's remaining actions on a thread report are warn and ban.
     */
    @Transactional
    public ReportRowDto hide(UUID adminId, UUID reportId) {
        Report report = open(reportId);
        Instant now = Instant.now(clock);
        UUID senderId;

        switch (report.getTargetKind()) {
            case Report.INBOX_MESSAGE -> {
                InboxMessage message = inboxMessages.findById(report.getTargetId())
                        .orElseThrow(() -> ApiException.notFound("the reported message is gone"));
                senderId = message.getSenderId();
                if (message.getDeletedAt() == null) {
                    // Already deleted by the recipient? Keep their timestamp: it is
                    // the honest answer to "when did this stop being visible".
                    message.softDelete(now);
                }
            }
            case Report.BOARD_POST -> {
                BoardPost post = boardPosts.findById(report.getTargetId())
                        .orElseThrow(() -> ApiException.notFound("the reported post is gone"));
                senderId = post.getSenderId();
                if (post.getHiddenAt() == null) {
                    post.hide(adminId, now);
                }
                // Every board open on a phone at the event refetches [B12].
                publisher.publishEvent(BoardChanged.publicOnly(post.getEventId()));
            }
            default -> throw ApiException.conflict("conflict",
                    "a thread is private to the two people in it and cannot be hidden", null);
        }

        auditLog.save(AuditLog.aboutContent(adminId, AuditAction.HIDE_CONTENT, senderId,
                report.getTargetKind(), report.getTargetId(),
                details(Map.of("reportId", report.getId().toString())), now));
        report.resolve(Report.HIDDEN, adminId, now);
        return single(report);
    }

    /** The person is told; the content stays where it is. */
    @Transactional
    public ReportRowDto warn(UUID adminId, UUID reportId) {
        Report report = open(reportId);
        UUID senderId = senderOf(report);
        Instant now = Instant.now(clock);

        auditLog.save(AuditLog.aboutUser(adminId, AuditAction.WARN_USER, senderId,
                details(Map.of("reportId", report.getId().toString())), now));
        report.resolve(Report.WARNED, adminId, now);
        publisher.publishEvent(new UserWarned(senderId, report.getId()));
        return single(report);
    }

    /**
     * The ban itself is {@link AdminUserService#ban} — one implementation, so a ban
     * from the reports queue revokes sessions and refuses a {@code super_admin}
     * exactly like a ban from the users tab, and writes the same audit row.
     */
    @Transactional
    public ReportRowDto ban(UUID adminId, UUID reportId) {
        Report report = open(reportId);
        UUID senderId = senderOf(report);
        adminUsers.ban(adminId, senderId);
        report.resolve(Report.BANNED, adminId, Instant.now(clock));
        return single(report);
    }

    /* ------------------------------------------------------------- flagged */

    /** [B9] Delivered with an acknowledged soft match. Nobody reported it; no identity. */
    @Transactional(readOnly = true)
    public List<FlaggedRowDto> flagged() {
        List<InboxMessage> rows = inboxMessages.flagged(InboxMessage.SOFT);
        SenderPresenter.Resolver senders = presenter.forRows(rows);
        Map<UUID, String> eventNames = eventNames(rows.stream().map(InboxMessage::getEventId).toList());
        return rows.stream()
                .map(message -> new FlaggedRowDto(message.getId().toString(),
                        contentOf(message, eventNames), senders.present(message)))
                .toList();
    }

    /** The same audited identity view as a report's, with the message as the subject. */
    @Transactional
    public FlaggedDetailDto flaggedDetail(UUID adminId, UUID messageId) {
        InboxMessage message = inboxMessages.findById(messageId)
                .orElseThrow(() -> ApiException.notFound("no such message"));

        auditLog.save(AuditLog.aboutContent(adminId, AuditAction.IDENTITY_VIEW, message.getSenderId(),
                Report.INBOX_MESSAGE, message.getId(),
                details(Map.of("source", "flagged")), Instant.now(clock)));

        SenderPresenter.Resolver senders = presenter.forRows(List.of(message));
        Map<UUID, String> eventNames = eventNames(List.of(message.getEventId()));
        return new FlaggedDetailDto(message.getId().toString(),
                contentOf(message, eventNames),
                senders.present(message),
                identityOf(message.getSenderId()));
    }

    /* ------------------------------------------------------------- helpers */

    /**
     * A decision is taken once and only from {@code open} [D8]-style finality: a
     * second admin working the same queue is told, not silently overridden. The row
     * is read under its write lock so two requests cannot both pass this check.
     */
    private Report open(UUID reportId) {
        Report report = reports.findForUpdate(reportId)
                .orElseThrow(() -> ApiException.notFound("no such report"));
        if (!report.isOpen()) {
            throw ApiException.conflict("conflict", "this report was already resolved", null);
        }
        return report;
    }

    private UUID senderOf(Report report) {
        Rendered rendered = render(List.of(report), false).get(report.getId());
        if (rendered == null || rendered.senderId() == null) {
            throw ApiException.notFound("the reported content is gone");
        }
        return rendered.senderId();
    }

    private ReportRowDto single(Report report) {
        return rowsOf(List.of(report)).get(0);
    }

    private List<ReportRowDto> rowsOf(List<Report> rows) {
        Map<UUID, Rendered> rendered = render(rows, false);
        return rows.stream()
                .map(report -> row(report, rendered.get(report.getId())))
                .toList();
    }

    private ReportRowDto row(Report report, Rendered rendered) {
        Rendered safe = rendered == null ? Rendered.missing(report.getTargetKind()) : rendered;
        return new ReportRowDto(
                report.getId().toString(),
                report.getTargetKind(),
                report.getTargetId().toString(),
                report.getReason(),
                report.getStatus(),
                report.getCreatedAt(),
                reporterOf(report.getReporterId()),
                safe.content(),
                safe.senderDisplay());
    }

    private ReporterDto reporterOf(UUID reporterId) {
        AppUser reporter = reporterId == null ? null : users.findById(reporterId).orElse(null);
        return new ReporterDto(reporterId == null ? null : reporterId.toString(),
                reporter == null ? null : reporter.getName());
    }

    private SenderIdentityDto identityOf(UUID senderId) {
        AppUser sender = users.findById(senderId).orElse(null);
        if (sender == null) {
            // The account was really deleted (KVKK); the content row outlived it.
            return new SenderIdentityDto(senderId.toString(), null, null, null);
        }
        return new SenderIdentityDto(sender.getId().toString(), sender.getName(), sender.getEmail(),
                sectionLabel(sender.getSection()));
    }

    /** [D11] The country is read through the section and never shown on its own. */
    private static String sectionLabel(Section section) {
        if (section == null) {
            return null;
        }
        return section.getName() + " · " + section.getCountry().getName();
    }

    /**
     * Everything a batch of reports needs, in a fixed number of queries whatever
     * the mix of kinds: the content rows, the event names, the sender rows for the
     * presenter, and — for a thread — the participants and the last bubbles.
     *
     * @param withThreadBubbles true for a detail view, which shows the conversation
     */
    private Map<UUID, Rendered> render(List<Report> rows, boolean withThreadBubbles) {
        Set<UUID> inboxIds = targetsOf(rows, Report.INBOX_MESSAGE);
        Set<UUID> postIds = targetsOf(rows, Report.BOARD_POST);
        Set<UUID> threadIds = targetsOf(rows, Report.THREAD);

        Map<UUID, InboxMessage> messages = byId(inboxMessages.findAllById(inboxIds), InboxMessage::getId);
        Map<UUID, BoardPost> posts = byId(boardPosts.findAllById(postIds), BoardPost::getId);
        Map<UUID, Thread> conversations = byId(threads.findAllById(threadIds), Thread::getId);

        Map<UUID, List<ThreadParticipant>> participants = new HashMap<>();
        Map<UUID, ThreadMessage> lastBubbles = new HashMap<>();
        if (!threadIds.isEmpty()) {
            for (ThreadParticipant participant : threadParticipants.findByIdThreadIdIn(threadIds)) {
                participants.computeIfAbsent(participant.getThreadId(), key -> new ArrayList<>())
                        .add(participant);
            }
            for (ThreadMessage last : threadMessages.lastMessagesOf(threadIds)) {
                lastBubbles.put(last.getThreadId(), last);
            }
        }

        List<UUID> eventIds = new ArrayList<>();
        messages.values().forEach(message -> eventIds.add(message.getEventId()));
        posts.values().forEach(post -> eventIds.add(post.getEventId()));
        conversations.values().forEach(thread -> eventIds.add(thread.getEventId()));
        Map<UUID, String> eventNames = eventNames(eventIds);

        List<SenderRow> senderRows = new ArrayList<>();
        senderRows.addAll(messages.values());
        senderRows.addAll(posts.values());
        participants.values().forEach(senderRows::addAll);
        SenderPresenter.Resolver senders = presenter.forRows(senderRows);

        Map<UUID, Rendered> rendered = new HashMap<>();
        for (Report report : rows) {
            UUID targetId = report.getTargetId();
            switch (report.getTargetKind()) {
                case Report.INBOX_MESSAGE -> {
                    InboxMessage message = messages.get(targetId);
                    if (message != null) {
                        rendered.put(report.getId(), new Rendered(contentOf(message, eventNames),
                                senders.present(message), message.getSenderId()));
                    }
                }
                case Report.BOARD_POST -> {
                    BoardPost post = posts.get(targetId);
                    if (post != null) {
                        rendered.put(report.getId(), new Rendered(
                                ReportContentDto.of(Report.BOARD_POST, post.getText(), post.getCreatedAt(),
                                        eventNames.get(post.getEventId())),
                                senders.present(post), post.getSenderId()));
                    }
                }
                case Report.THREAD -> {
                    Thread thread = conversations.get(targetId);
                    ThreadParticipant other = otherSide(participants.get(targetId), report.getReporterId());
                    if (thread != null && other != null) {
                        rendered.put(report.getId(), threadRendered(thread, other,
                                lastBubbles.get(targetId), eventNames, senders,
                                report.getReporterId(), withThreadBubbles));
                    }
                }
                default -> {
                    // An unknown kind cannot exist: the column has a CHECK constraint.
                }
            }
        }
        return rendered;
    }

    private Rendered threadRendered(Thread thread,
                                    ThreadParticipant other,
                                    ThreadMessage lastBubble,
                                    Map<UUID, String> eventNames,
                                    SenderPresenter.Resolver senders,
                                    UUID reporterId,
                                    boolean withBubbles) {
        ReportContentDto content = ReportContentDto.of(Report.THREAD,
                lastBubble == null ? null : lastBubble.getText(),
                lastBubble == null ? thread.getCreatedAt() : lastBubble.getCreatedAt(),
                eventNames.get(thread.getEventId()));
        if (withBubbles) {
            content = content.withMessages(bubblesOf(thread.getId(), reporterId));
        }
        // [D5] The sender display follows the participant's current level, exactly
        // as the reporter sees the other side of the thread today; each bubble
        // below is still rendered from its own row.
        return new Rendered(content, senders.present(other), other.getUserId());
    }

    /** The last {@value #THREAD_BUBBLES} bubbles, oldest first, as the reporter read them. */
    private List<ThreadBubbleDto> bubblesOf(UUID threadId, UUID reporterId) {
        List<ThreadMessage> all = threadMessages.findByThreadIdOrderBySeqAsc(threadId);
        List<ThreadMessage> tail = all.size() <= THREAD_BUBBLES
                ? all
                : all.subList(all.size() - THREAD_BUBBLES, all.size());
        SenderPresenter.Resolver senders = presenter.forRows(tail);
        return tail.stream()
                .map(bubble -> new ThreadBubbleDto(bubble.getText(), senders.present(bubble),
                        bubble.getSenderId().equals(reporterId), bubble.getCreatedAt(),
                        bubble.getSystem()))
                .toList();
    }

    /** The person the report is about: the participant who is not the reporter. */
    private static ThreadParticipant otherSide(List<ThreadParticipant> sides, UUID reporterId) {
        if (sides == null) {
            return null;
        }
        for (ThreadParticipant side : sides) {
            if (!side.getUserId().equals(reporterId)) {
                return side;
            }
        }
        return null;
    }

    private ReportContentDto contentOf(InboxMessage message, Map<UUID, String> eventNames) {
        return ReportContentDto.of(Report.INBOX_MESSAGE, message.getText(), message.getCreatedAt(),
                eventNames.get(message.getEventId()));
    }

    private Map<UUID, String> eventNames(Collection<UUID> ids) {
        Set<UUID> wanted = new HashSet<>();
        for (UUID id : ids) {
            if (id != null) {
                wanted.add(id);
            }
        }
        Map<UUID, String> names = new HashMap<>();
        if (!wanted.isEmpty()) {
            for (Event event : events.findAllById(wanted)) {
                names.put(event.getId(), event.getName());
            }
        }
        return names;
    }

    private static Set<UUID> targetsOf(List<Report> rows, String kind) {
        Set<UUID> ids = new HashSet<>();
        for (Report report : rows) {
            if (kind.equals(report.getTargetKind())) {
                ids.add(report.getTargetId());
            }
        }
        return ids;
    }

    private static <T> Map<UUID, T> byId(Iterable<T> rows, java.util.function.Function<T, UUID> id) {
        Map<UUID, T> map = new HashMap<>();
        rows.forEach(row -> map.put(id.apply(row), row));
        return map;
    }

    private String details(Map<String, String> fields) {
        try {
            return json.writeValueAsString(fields);
        } catch (JsonProcessingException ex) {
            // A map of two strings cannot fail to serialise; never swallow it silently.
            throw new IllegalStateException("could not write the audit details", ex);
        }
    }

    /** One report's content and sender, rendered. {@code senderId} never leaves the server. */
    private record Rendered(ReportContentDto content, MessageSenderDto senderDisplay, UUID senderId) {

        /** The content is gone (real account deletion); the report itself is still a row. */
        static Rendered missing(String kind) {
            return new Rendered(ReportContentDto.of(kind, null, null, null),
                    MessageSenderDto.anonymous(), null);
        }
    }
}
