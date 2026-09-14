package app.brand.thread;

import app.brand.board.BoardPost;
import app.brand.board.BoardPostRepository;
import app.brand.board.BoardPostState;
import app.brand.common.ApiException;
import app.brand.common.Ids;
import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.content.MessageSenderDto;
import app.brand.content.SenderPresenter;
import app.brand.content.SenderRow;
import app.brand.event.Event;
import app.brand.event.EventAccess;
import app.brand.event.EventRepository;
import app.brand.message.InboxMessage;
import app.brand.message.InboxMessageRepository;
import app.brand.message.MessageState;
import app.brand.realtime.ThreadsChanged;
import app.brand.safety.BlockService;
import app.brand.safety.ContentScreener;
import app.brand.safety.ContentScreener.ScreeningResult;
import app.brand.safety.Report;
import app.brand.safety.ReportService;
import app.brand.thread.ThreadDtos.OpenThreadRequest;
import app.brand.thread.ThreadDtos.OpenedDto;
import app.brand.thread.ThreadDtos.OriginDto;
import app.brand.thread.ThreadDtos.OriginRequest;
import app.brand.thread.ThreadDtos.SendThreadMessageRequest;
import app.brand.thread.ThreadDtos.ThreadDetailDto;
import app.brand.thread.ThreadDtos.ThreadMessageDto;
import app.brand.thread.ThreadDtos.ThreadSummaryDto;
import app.brand.thread.ThreadDtos.ThreadsSnapshotDto;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Private threads — BACKEND_PLAN.md §3 "Threads", which is {@code mock.ts}'s
 * behaviour unchanged.
 *
 * <p>Four rules shape all of it:
 *
 * <ul>
 *   <li><b>A thread is always an answer to something</b> (CLAUDE.md §4.7, §6): it
 *       opens from an inbox message the caller received or a published board post,
 *       never from a profile. The origin is stored on the thread and shown above
 *       the first bubble.</li>
 *   <li><b>A bubble is rendered from its own row</b> [D5]. The participant row
 *       carries the level <em>new</em> messages go out at; revealing yourself
 *       changes that and appends a system row, and every word already sent keeps
 *       the level it was sent at. That is the promise anonymity makes, and it is
 *       the one rule in this file that must never bend.</li>
 *   <li><b>Refusal says as little as possible.</b> Not a participant, or the other
 *       person is someone this account blocked → 404, the same answer an id that
 *       never existed gets. Cannot deliver — they are not approved, or they blocked
 *       you → one 403 with one code, never saying which.</li>
 *   <li><b>A retry is not a second thread</b> [B7]. Every write that creates
 *       something carries a {@code requestId}; the same key with the same request
 *       returns the first answer, and the same key with a different request is a
 *       409 rather than a silent surprise.</li>
 * </ul>
 */
@Service
public class ThreadService {

    /** One code for every refused delivery. Which rule refused it is never disclosed. */
    private static final String DELIVERY_UNAVAILABLE = "delivery_unavailable";

    /** [B7] Same key, different request: the client reused a key it promised not to. */
    private static final String REQUEST_KEY_REUSED = "request_key_reused";

    private static final int REQUEST_ID_MAX = 100;

    /** CLAUDE.md §5. The window the opening limit is counted over. */
    private static final Duration OPENING_WINDOW = Duration.ofDays(1);

    private final ThreadRepository threads;
    private final ThreadParticipantRepository participants;
    private final ThreadMessageRepository messages;
    private final RequestKeyRepository requestKeys;
    private final InboxMessageRepository inboxMessages;
    private final BoardPostRepository posts;
    private final EventRepository events;
    private final EventAccess access;
    private final AppUserRepository users;
    private final SenderPresenter presenter;
    private final BlockService blocks;
    private final ContentScreener screener;
    private final ReportService reports;
    private final org.springframework.context.ApplicationEventPublisher publisher;
    private final Clock clock;
    private final int openingsPerDay;

    public ThreadService(ThreadRepository threads,
                         ThreadParticipantRepository participants,
                         ThreadMessageRepository messages,
                         RequestKeyRepository requestKeys,
                         InboxMessageRepository inboxMessages,
                         BoardPostRepository posts,
                         EventRepository events,
                         EventAccess access,
                         AppUserRepository users,
                         SenderPresenter presenter,
                         BlockService blocks,
                         ContentScreener screener,
                         ReportService reports,
                         org.springframework.context.ApplicationEventPublisher publisher,
                         Clock clock,
                         @Value("${brand.limits.thread-openings-per-day:20}") int openingsPerDay) {
        this.threads = threads;
        this.participants = participants;
        this.messages = messages;
        this.requestKeys = requestKeys;
        this.inboxMessages = inboxMessages;
        this.posts = posts;
        this.events = events;
        this.access = access;
        this.users = users;
        this.presenter = presenter;
        this.blocks = blocks;
        this.screener = screener;
        this.reports = reports;
        this.publisher = publisher;
        this.clock = clock;
        this.openingsPerDay = openingsPerDay;
    }

    /* ------------------------------------------------------------ POST /threads */

    /**
     * Open a thread from an inbox message or a board post.
     *
     * <p>The order is the mock's and it matters. The idempotency key is looked at
     * first, so a retry never trips the rate limit or re-screens text that was
     * already delivered. Then the limit, which is about this account and says
     * nothing about the origin. Then the origin and every "we will not deliver
     * this" answer, all before the text is looked at, so a validation error cannot
     * be used to learn that a stranger exists or has blocked you. Then the text,
     * screening and the anonymity choice.
     */
    @Transactional
    public OpenedDto open(UUID viewerId, OpenThreadRequest request) {
        OpenThreadRequest body = request == null
                ? new OpenThreadRequest(null, null, null, null, null, null)
                : request;
        String key = requestKey("open", requireRequestId(body.requestId()));
        String fingerprint = fingerprintOf(
                "open",
                body.origin() == null ? null : body.origin().kind(),
                body.origin() == null ? null : body.origin().id(),
                body.origin() == null ? null : body.origin().eventId(),
                body.text(),
                body.anonymityLevel(),
                hintsOf(body.allowedHints()),
                String.valueOf(body.acknowledged()));

        Optional<RequestKey> prior = requestKeys.findByIdUserIdAndIdKey(viewerId, key);
        if (prior.isPresent()) {
            return replay(viewerId, prior.get(), fingerprint);
        }

        requireOpeningAllowance(viewerId);

        AppUser viewer = users.findById(viewerId).orElseThrow(ThreadService::refused);
        Origin origin = resolveOrigin(viewerId, body.origin());

        AppUser author = origin.senderId() == null
                ? null : users.findById(origin.senderId()).orElse(null);
        if (author == null
                || author.getId().equals(viewerId)
                || author.getStatus() != AccountStatus.APPROVED
                || blocks.isBlocked(viewerId, author.getId())
                || blocks.isBlocked(author.getId(), viewerId)) {
            throw refused();
        }

        String text = requireText(body.text(), Thread.OPENING_TEXT_MAX);
        requireDeliverable(text, body.acknowledged());
        Anonymity mine = Anonymity.from(body.anonymityLevel(), AllowedHints.orNone(body.allowedHints()),
                viewer.getSection() == null ? null : viewer.getSection().getId());

        Instant now = Instant.now(clock);
        Thread thread = threads.saveAndFlush(origin.isPost()
                ? Thread.fromBoardPost(origin.id(), origin.eventId(), now)
                : Thread.fromInboxMessage(origin.id(), origin.eventId(), now));

        participants.saveAndFlush(ThreadParticipant.of(thread.getId(), viewerId, mine.copy(), now));
        // [D5] The author joins at the level the card they wrote was written at, not
        // at whatever they are elsewhere: answering an anonymous post must not out them.
        participants.saveAndFlush(ThreadParticipant.of(thread.getId(), author.getId(),
                Anonymity.copyOf(origin.anonymity()), now));
        append(thread, viewerId, text, mine.copy(), null, now);

        store(viewerId, key, fingerprint, thread.getId(), now);
        publisher.publishEvent(new ThreadsChanged(Set.of(viewerId, author.getId())));
        return new OpenedDto(thread.getId().toString());
    }

    /* ---------------------------------------------------------- GET /me/threads */

    /** The Threads tab: every thread this account is in, newest last message first. */
    @Transactional(readOnly = true)
    public ThreadsSnapshotDto list(UUID viewerId) {
        List<Thread> rows = threads.listFor(viewerId);
        if (rows.isEmpty()) {
            return new ThreadsSnapshotDto(List.of(), 0);
        }
        List<UUID> ids = rows.stream().map(Thread::getId).toList();

        Map<UUID, ThreadParticipant> others = new HashMap<>();
        for (ThreadParticipant participant : participants.findByIdThreadIdIn(ids)) {
            if (!participant.getUserId().equals(viewerId)) {
                others.put(participant.getThreadId(), participant);
            }
        }
        Map<UUID, ThreadMessage> lasts = new HashMap<>();
        for (ThreadMessage message : messages.lastMessagesOf(ids)) {
            lasts.put(message.getThreadId(), message);
        }
        Map<UUID, Long> unread = new HashMap<>();
        for (Object[] row : messages.unreadCountsFor(viewerId, ids)) {
            unread.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        Map<UUID, String> sources = sourcesOf(rows);

        List<SenderRow> senderRows = new ArrayList<>(others.values());
        senderRows.addAll(lasts.values());
        SenderPresenter.Resolver resolver = presenter.forRows(senderRows);

        List<ThreadSummaryDto> summaries = new ArrayList<>(rows.size());
        long total = 0;
        for (Thread thread : rows) {
            ThreadMessage last = lasts.get(thread.getId());
            ThreadParticipant other = others.get(thread.getId());
            if (last == null || other == null) {
                // A thread with no message or one side missing cannot be rendered and
                // cannot exist by construction; skipping beats a half-drawn row.
                continue;
            }
            long count = unread.getOrDefault(thread.getId(), 0L);
            total += count;
            summaries.add(summary(thread, other, last, count, sources, resolver, viewerId));
        }
        return new ThreadsSnapshotDto(summaries, total);
    }

    /* --------------------------------------------------------- GET /threads/{id} */

    /** One conversation. Reading it marks nothing read — that is the client's call. */
    @Transactional(readOnly = true)
    public ThreadDetailDto detail(UUID viewerId, String rawId) {
        Thread thread = requireThread(viewerId, rawId);
        List<ThreadMessage> rows = messages.findByThreadIdOrderBySeqAsc(thread.getId());
        ThreadParticipant mine = participantOf(thread.getId(), viewerId);
        ThreadParticipant other = otherParticipant(thread.getId(), viewerId);
        Origin origin = storedOrigin(thread);

        List<SenderRow> senderRows = new ArrayList<>(rows);
        senderRows.add(mine);
        senderRows.add(other);
        senderRows.add(origin);
        SenderPresenter.Resolver resolver = presenter.forRows(senderRows);

        List<ThreadMessageDto> bubbles = new ArrayList<>(rows.size());
        long unread = 0;
        String blockMessageId = null;
        for (ThreadMessage row : rows) {
            bubbles.add(message(row, resolver, viewerId));
            if (!row.getSenderId().equals(viewerId)) {
                if (blockMessageId == null) {
                    blockMessageId = row.getId().toString();
                }
                if (row.getSeq() > mine.getReadThroughSeq()) {
                    unread++;
                }
            }
        }
        ThreadMessage last = rows.isEmpty() ? null : rows.get(rows.size() - 1);
        ThreadSummaryDto summary = summary(thread, other, last, unread,
                sourcesOf(List.of(thread)), resolver, viewerId);

        OriginDto originDto = new OriginDto(
                origin.id() == null ? null : origin.id().toString(),
                origin.text(),
                resolver.present(origin),
                viewerId.equals(origin.senderId()));

        return ThreadDetailDto.of(summary, originDto, resolver.present(mine), !mine.isNamed(),
                // [D6] Something the other person wrote, so an anonymous sender can be
                // blocked without the blocker ever learning who they are. The origin is
                // the fallback: a thread whose only message is the viewer's own.
                blockMessageId == null ? originDto.id() : blockMessageId,
                bubbles);
    }

    /* ------------------------------------------------ POST /threads/{id}/messages */

    /** Append a reply, at the level this account is currently sending at [D5]. */
    @Transactional
    public void send(UUID viewerId, String rawId, SendThreadMessageRequest request) {
        SendThreadMessageRequest body = request == null
                ? new SendThreadMessageRequest(null, null, null) : request;
        Thread thread = requireThread(viewerId, rawId);
        ThreadParticipant other = otherParticipant(thread.getId(), viewerId);
        requireDeliverableTo(other.getUserId(), viewerId);

        String key = requestKey("send:" + thread.getId(), requireRequestId(body.requestId()));
        String fingerprint = fingerprintOf("send", thread.getId().toString(), body.text(),
                String.valueOf(body.acknowledged()));
        Optional<RequestKey> prior = requestKeys.findByIdUserIdAndIdKey(viewerId, key);
        if (prior.isPresent()) {
            requireSameFingerprint(prior.get(), fingerprint);
            // Already appended. The client is retrying a send whose answer it lost.
            return;
        }

        String text = requireText(body.text(), Thread.TEXT_MAX);
        requireDeliverable(text, body.acknowledged());

        ThreadParticipant mine = participantOf(thread.getId(), viewerId);
        Instant now = Instant.now(clock);
        append(thread, viewerId, text, Anonymity.copyOf(mine.getAnonymity()), null, now);
        store(viewerId, key, fingerprint, null, now);
        publisher.publishEvent(new ThreadsChanged(Set.of(viewerId, other.getUserId())));
    }

    /* ---------------------------------------------------- PUT /threads/{id}/read */

    /** [B2] A watermark, not a flag: it only ever moves forward. */
    @Transactional
    public void read(UUID viewerId, String rawId, String rawMessageId) {
        Thread thread = requireThread(viewerId, rawId);
        UUID messageId = Ids.orNull(rawMessageId);
        ThreadMessage row = messageId == null ? null
                : messages.findByIdAndThreadId(messageId, thread.getId()).orElse(null);
        if (row == null) {
            throw ApiException.validation("unknown read watermark", "throughMessageId");
        }
        ThreadParticipant mine = participantOf(thread.getId(), viewerId);
        if (mine.readThrough(row.getSeq())) {
            participants.saveAndFlush(mine);
            // Only this reader: nobody else's screen changes when someone catches up.
            publisher.publishEvent(new ThreadsChanged(Set.of(viewerId)));
        }
    }

    /* -------------------------------------------------- POST /threads/{id}/reveal */

    /**
     * [D5] "Reveal myself": from here on this person sends as themselves.
     *
     * <p>It replaces the participant row's level and appends a system row at the
     * new level. It touches no message that was already sent — the whole point.
     * Idempotent, because a second tap after a lost answer must not append a second
     * "revealed" row.
     */
    @Transactional
    public void reveal(UUID viewerId, String rawId) {
        Thread thread = requireThread(viewerId, rawId);
        ThreadParticipant other = otherParticipant(thread.getId(), viewerId);
        requireDeliverableTo(other.getUserId(), viewerId);

        ThreadParticipant mine = participantOf(thread.getId(), viewerId);
        if (mine.isNamed()) {
            return;
        }
        AppUser viewer = users.findById(viewerId).orElseThrow(ThreadService::refused);
        Instant now = Instant.now(clock);
        mine.reveal(Anonymity.from(AnonymityLevel.NAMED, AllowedHints.NONE,
                viewer.getSection() == null ? null : viewer.getSection().getId()), now);
        participants.saveAndFlush(mine);

        append(thread, viewerId, "", Anonymity.copyOf(mine.getAnonymity()),
                ThreadMessage.REVEALED, now);
        publisher.publishEvent(new ThreadsChanged(Set.of(viewerId, other.getUserId())));
    }

    /* ------------------------------------ POST /threads/{id}/report, /block */

    /** The whole thread is reported; an admin reads it later, audited (CLAUDE.md §5). */
    @Transactional
    public void report(UUID viewerId, String rawId, String reason) {
        Thread thread = requireThread(viewerId, rawId);
        reports.file(viewerId, Report.THREAD, thread.getId(), reason);
    }

    /**
     * [D6] Block, by the id of something the other person wrote — a message of this
     * thread or the origin card. The frozen display columns are that row's own
     * anonymity, so blocking an anonymous message leaves an anonymous entry in the
     * Blocked list and the blocker never learns who it was.
     */
    @Transactional
    public void block(UUID viewerId, String rawId, String rawMessageId) {
        Thread thread = requireThread(viewerId, rawId);
        UUID messageId = Ids.orNull(rawMessageId);
        SenderRow row = null;
        UUID senderId = null;
        if (messageId != null) {
            ThreadMessage message = messages.findByIdAndThreadId(messageId, thread.getId()).orElse(null);
            if (message != null) {
                row = message;
                senderId = message.getSenderId();
            } else if (messageId.equals(thread.getOriginId())) {
                Origin origin = storedOrigin(thread);
                row = origin;
                senderId = origin.senderId();
            }
        }
        if (row == null || senderId == null || senderId.equals(viewerId)) {
            throw ApiException.validation("other participant message required", "messageId");
        }
        blocks.block(viewerId, senderId, Anonymity.copyOf(row.anonymity()));
    }

    /* ---------------------------------------------------------------- helpers */

    private Thread requireThread(UUID viewerId, String rawId) {
        UUID id = Ids.orNotFound(rawId, "no such thread");
        return threads.visibleTo(id, viewerId)
                .orElseThrow(() -> ApiException.notFound("no such thread"));
    }

    private ThreadParticipant participantOf(UUID threadId, UUID userId) {
        return participants.findByIdThreadIdAndIdUserId(threadId, userId)
                .orElseThrow(() -> ApiException.notFound("no such thread"));
    }

    private ThreadParticipant otherParticipant(UUID threadId, UUID viewerId) {
        return participants.findByIdThreadId(threadId).stream()
                .filter(row -> !row.getUserId().equals(viewerId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("no such thread"));
    }

    /** One 403 for "they are gone" and for "they blocked you"; never which. */
    private void requireDeliverableTo(UUID otherId, UUID viewerId) {
        AppUser other = users.findById(otherId).orElse(null);
        if (other == null || other.getStatus() != AccountStatus.APPROVED
                || blocks.isBlocked(otherId, viewerId)) {
            throw refused();
        }
    }

    private static String requireText(String raw, int max) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty() || text.length() > max) {
            throw ApiException.validation("invalid message", "text");
        }
        return text;
    }

    /** [B9] Rechecked on every send; the composer's own screening call is never trusted. */
    private void requireDeliverable(String text, boolean acknowledged) {
        ScreeningResult screening = screener.screen(text);
        if (screening == ScreeningResult.BLOCK || (screening == ScreeningResult.WARN && !acknowledged)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, DELIVERY_UNAVAILABLE,
                    "delivery unavailable");
        }
    }

    /** CLAUDE.md §5: a rolling 24-hour window, so "tomorrow" needs no calendar. */
    private void requireOpeningAllowance(UUID viewerId) {
        if (openingsPerDay <= 0) {
            return;
        }
        Instant since = Instant.now(clock).minus(OPENING_WINDOW);
        if (threads.countOpenedSince(viewerId, since) >= openingsPerDay) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited",
                    "too many threads opened");
        }
    }

    /**
     * The origin a client asked to open from, resolved through the same access rule
     * the surface it came from uses: a message must be one this account received and
     * can still see, a post must be published on a board this account is on.
     */
    private Origin resolveOrigin(UUID viewerId, OriginRequest request) {
        String kind = request == null ? null : request.kind();
        if (Thread.INBOX.equals(kind)) {
            UUID id = Ids.orNotFound(request.id(), "no such message");
            InboxMessage row = inboxMessages.visibleTo(id, viewerId)
                    .orElseThrow(() -> ApiException.notFound("no such message"));
            return Origin.of(row);
        }
        if (Thread.POST.equals(kind)) {
            Event event = access.requireMember(request.eventId(), viewerId);
            UUID id = Ids.orNotFound(request.id(), "no such post");
            BoardPost row = posts.publishedById(event.getId(), id,
                            BoardPostState.APPROVED, MessageState.APPROVED)
                    .orElseThrow(() -> ApiException.notFound("no such post"));
            return Origin.of(row);
        }
        throw ApiException.validation("origin required", "origin");
    }

    /**
     * The origin as the thread stored it. The row is read without the visibility
     * rule that opened the thread: a card the recipient later took off their wall,
     * or a post a moderator hid, must not blank out a conversation that already
     * exists — the two people in it are answering it, not the board.
     */
    private Origin storedOrigin(Thread thread) {
        UUID id = thread.getOriginId();
        if (id == null) {
            return Origin.missing(null);
        }
        if (Thread.POST.equals(thread.getOriginKind())) {
            return posts.findById(id).map(Origin::of).orElseGet(() -> Origin.missing(id));
        }
        return inboxMessages.findById(id).map(Origin::of).orElseGet(() -> Origin.missing(id));
    }

    /** {@code ThreadSummary.source} is the event's name; there is always one in stage 1. */
    private Map<UUID, String> sourcesOf(List<Thread> rows) {
        Set<UUID> eventIds = new HashSet<>();
        for (Thread thread : rows) {
            if (thread.getEventId() != null) {
                eventIds.add(thread.getEventId());
            }
        }
        Map<UUID, String> names = new HashMap<>();
        if (!eventIds.isEmpty()) {
            events.findAllById(eventIds).forEach(event -> names.put(event.getId(), event.getName()));
        }
        return names;
    }

    private ThreadSummaryDto summary(Thread thread,
                                     ThreadParticipant other,
                                     ThreadMessage last,
                                     long unreadCount,
                                     Map<UUID, String> sources,
                                     SenderPresenter.Resolver resolver,
                                     UUID viewerId) {
        ThreadMessageDto lastDto = last == null ? null : message(last, resolver, viewerId);
        return new ThreadSummaryDto(
                thread.getId().toString(),
                resolver.present(other),
                thread.getEventId() == null ? null : sources.get(thread.getEventId()),
                lastDto,
                unreadCount,
                lastDto == null ? thread.getLastMessageAt() : lastDto.createdAt());
    }

    /** [D5] Always from the row's own anonymity, never from the sender's current level. */
    private ThreadMessageDto message(ThreadMessage row, SenderPresenter.Resolver resolver, UUID viewerId) {
        return new ThreadMessageDto(row.getId().toString(), row.getText(), resolver.present(row),
                row.getSenderId().equals(viewerId), row.getCreatedAt(), row.getSystem());
    }

    /**
     * Append one row under the thread's write lock, so two sends cannot pick the
     * same {@code seq} and lose on the unique index.
     */
    private ThreadMessage append(Thread thread,
                                 UUID senderId,
                                 String text,
                                 Anonymity anonymity,
                                 String system,
                                 Instant now) {
        Thread locked = threads.lockForAppend(thread.getId())
                .orElseThrow(() -> ApiException.notFound("no such thread"));
        long seq = messages.maxSeq(locked.getId()) + 1;
        ThreadMessage row = messages.saveAndFlush(
                ThreadMessage.of(locked.getId(), seq, senderId, text, anonymity, system, now));
        locked.touch(now);
        threads.saveAndFlush(locked);
        return row;
    }

    /* ------------------------------------------------------------ [B7] request keys */

    private static String requireRequestId(String requestId) {
        if (requestId == null || requestId.isBlank() || requestId.length() > REQUEST_ID_MAX) {
            throw ApiException.validation("request key required", "requestId");
        }
        return requestId;
    }

    /**
     * A prior key for this account: the same request replays its answer, a different
     * one is a 409.
     *
     * <p>Access is re-checked before the id goes back out, so a retry that arrives
     * after the other person was blocked answers 404 like every other read of that
     * thread rather than handing back an id the caller may no longer use.
     */
    private OpenedDto replay(UUID viewerId, RequestKey prior, String fingerprint) {
        requireSameFingerprint(prior, fingerprint);
        UUID result = prior.getResultId();
        if (result == null) {
            throw new ApiException(HttpStatus.CONFLICT, REQUEST_KEY_REUSED, "request key in progress");
        }
        return new OpenedDto(requireThread(viewerId, result.toString()).getId().toString());
    }

    private static void requireSameFingerprint(RequestKey prior, String fingerprint) {
        if (!prior.getFingerprintHash().equals(fingerprint)) {
            throw new ApiException(HttpStatus.CONFLICT, REQUEST_KEY_REUSED, "request key reused");
        }
    }

    /**
     * Store the key that makes this call replayable.
     *
     * <p>Losing the insert means an identical request committed while this one was
     * running. Answering 409 rolls this transaction back — the duplicate thread with
     * it — and the client's next retry of the same {@code requestId} gets the
     * winner's answer. A silent second thread would be worse than one conflict.
     */
    private void store(UUID viewerId, String key, String fingerprint, UUID resultId, Instant now) {
        int stored = requestKeys.storeIfAbsent(viewerId, key, fingerprint, resultId,
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        if (stored == 0) {
            throw new ApiException(HttpStatus.CONFLICT, REQUEST_KEY_REUSED, "request key reused");
        }
    }

    /**
     * The stored key: SHA-256 of the scope and the client's {@code requestId}.
     *
     * <p>Hashed because a send's key is scoped to its thread as the mock scopes it
     * ({@code thread.requests}), and {@code request_key.key} is capped at 100
     * characters — a 36-character thread id plus a 100-character {@code requestId}
     * does not fit. A fixed-width digest fits every scope and cannot collide across
     * them.
     */
    private static String requestKey(String scope, String requestId) {
        return sha256(scope + " " + requestId);
    }

    /** [B7] The request itself, so one key can never answer for two different drafts. */
    private static String fingerprintOf(String... parts) {
        return sha256(String.join(" ", java.util.Arrays.stream(parts)
                .map(part -> part == null ? "" : part).toList()));
    }

    private static String hintsOf(AllowedHints hints) {
        AllowedHints allowed = AllowedHints.orNone(hints);
        return allowed.wantsSection() + "," + allowed.wantsCountry() + "," + allowed.wantsLetter();
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by the platform", impossible);
        }
    }

    private static ApiException refused() {
        return new ApiException(HttpStatus.FORBIDDEN, DELIVERY_UNAVAILABLE, "delivery unavailable");
    }

    /**
     * The card a thread started from, whichever table it lives in — a
     * {@link SenderRow}, so it renders through the same presenter as everything
     * else and cannot leak an id.
     */
    private record Origin(UUID id, String text, UUID senderId, Anonymity anonymity, UUID eventId,
                          boolean isPost) implements SenderRow {

        static Origin of(InboxMessage row) {
            return new Origin(row.getId(), row.getText(), row.getSenderId(), row.getAnonymity(),
                    row.getEventId(), false);
        }

        static Origin of(BoardPost row) {
            return new Origin(row.getId(), row.getText(), row.getSenderId(), row.getAnonymity(),
                    row.getEventId(), true);
        }

        /** A row that is no longer there: an empty card, never a 500 and never a name. */
        static Origin missing(UUID id) {
            return new Origin(id, "", null, null, null, false);
        }
    }
}
