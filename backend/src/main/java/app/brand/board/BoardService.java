package app.brand.board;

import app.brand.board.BoardDtos.BoardPostDto;
import app.brand.board.BoardDtos.BoardSnapshotDto;
import app.brand.board.BoardDtos.ControlsRequest;
import app.brand.board.BoardDtos.RejectionReceiptDto;
import app.brand.board.BoardDtos.SendBoardPostRequest;
import app.brand.common.ApiException;
import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.content.MessageSenderDto;
import app.brand.content.SenderPresenter;
import app.brand.event.Event;
import app.brand.event.EventAccess;
import app.brand.event.EventDtos.EventDetailDto;
import app.brand.event.EventDtos.EventPersonDto;
import app.brand.event.EventMember;
import app.brand.event.EventMemberRepository;
import app.brand.event.EventRepository;
import app.brand.event.EventService;
import app.brand.event.EventStatus;
import app.brand.message.InboxMessage;
import app.brand.message.InboxMessageRepository;
import app.brand.message.MessageDtos.SendWallMessageRequest;
import app.brand.message.MessageService;
import app.brand.message.MessageState;
import app.brand.realtime.BoardChanged;
import app.brand.safety.ContentScreener;
import app.brand.safety.ContentScreener.ScreeningResult;
import app.brand.safety.Report;
import app.brand.safety.ReportService;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.MeMapper;
import app.brand.user.PersonDto;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The live board — BACKEND_PLAN.md §3 "Boards", which is {@code mock.ts}'s
 * behaviour unchanged.
 *
 * <p>Four rules shape everything here:
 *
 * <ul>
 *   <li><b>Published is one rule, asked once.</b> It lives in
 *       {@code BoardPostRepository.PUBLISHED} and every list, lookup and
 *       {@code postCount} reads it. A room post is approved and not hidden; a post
 *       addressed to a person is on the board only while the recipient keeps that
 *       message on their wall [D12].</li>
 *   <li><b>Time is applied, not waited for.</b> A closed or expired board's pending
 *       posts become {@code rejected/board_closed} [D4], and a rejection whose five
 *       seconds ran out becomes final [B6] — both at the start of every board read
 *       and write, inside the transaction. The housekeeping job [B5] runs exactly
 *       the same pass, so a stopped scheduler can only delay a notification.</li>
 *   <li><b>The sender learns nothing early.</b> A rejection publishes a public frame
 *       only: for five seconds it is still {@code pending} to the person who wrote
 *       it, and their private frame comes from the transition that finalises it.</li>
 *   <li><b>No identity, ever.</b> Nothing here emits a {@code sender_id}, a
 *       {@code rejected_by} or a hint boolean. The one secret that leaves is the
 *       undo token, handed back to the moderator who just rejected.</li>
 * </ul>
 */
@Service
public class BoardService {

    /** [B6]/[D8] The five seconds a mis-tap can be taken back in. */
    public static final Duration UNDO_WINDOW = Duration.ofSeconds(5);

    private static final Set<String> BOARD_MODES = Set.of("approve_first", "post_immediately");
    private static final String POST_IMMEDIATELY = "post_immediately";
    private static final String MODERATOR_REQUIRED = "moderator_required";
    private static final String QUEUE_CHANGED = "queue_changed";
    private static final String BOARD_ARCHIVED = "board_archived";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final BoardPostRepository posts;
    private final PostReactionRepository reactions;
    private final InboxMessageRepository inboxMessages;
    private final EventRepository events;
    private final EventMemberRepository members;
    private final EventAccess access;
    private final EventService eventService;
    private final MessageService messages;
    private final AppUserRepository users;
    private final SectionRepository sections;
    private final SenderPresenter presenter;
    private final MeMapper meMapper;
    private final ContentScreener screener;
    private final ReportService reports;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public BoardService(BoardPostRepository posts,
                        PostReactionRepository reactions,
                        InboxMessageRepository inboxMessages,
                        EventRepository events,
                        EventMemberRepository members,
                        EventAccess access,
                        EventService eventService,
                        MessageService messages,
                        AppUserRepository users,
                        SectionRepository sections,
                        SenderPresenter presenter,
                        MeMapper meMapper,
                        ContentScreener screener,
                        ReportService reports,
                        ApplicationEventPublisher publisher,
                        Clock clock) {
        this.posts = posts;
        this.reactions = reactions;
        this.inboxMessages = inboxMessages;
        this.events = events;
        this.members = members;
        this.access = access;
        this.eventService = eventService;
        this.messages = messages;
        this.users = users;
        this.sections = sections;
        this.presenter = presenter;
        this.meMapper = meMapper;
        this.screener = screener;
        this.reports = reports;
        this.publisher = publisher;
        this.clock = clock;
    }

    /* --------------------------------------------- GET /events/{id}/board */

    /**
     * One read answers the whole board screen — feed, the viewer's own unpublished
     * cards, the queue, the counts and the moderator list — because a moderator
     * switching tabs must not see a different board than the one behind it.
     */
    @Transactional
    public BoardSnapshotDto snapshot(UUID viewerId, UUID eventId) {
        Event event = enter(viewerId, eventId);
        boolean moderator = access.isModerator(event, viewerId);

        List<BoardPost> published = posts.published(eventId, BoardPostState.APPROVED, MessageState.APPROVED);
        List<BoardPost> room = posts.roomPosts(eventId);

        List<BoardPost> everything = new ArrayList<>(published.size() + room.size());
        everything.addAll(published);
        everything.addAll(room);
        Context context = contextFor(everything, viewerId);

        List<BoardPostDto> feed = context.map(published);
        List<BoardPostDto> ownUnpublished = context.map(room.stream()
                .filter(post -> post.getSenderId().equals(viewerId)
                        && post.getState() != BoardPostState.APPROVED)
                .toList());

        List<BoardPostDto> queue = List.of();
        List<BoardPostDto> reviewed = List.of();
        int pendingCount = 0;
        if (moderator) {
            List<BoardPost> pending = room.stream()
                    .filter(post -> post.getState() == BoardPostState.PENDING)
                    .toList();
            // [B6] The count includes posts inside an open undo window; the queue
            // does not, so a moderator cannot act on the same card twice while the
            // badge still tells them it is outstanding.
            pendingCount = pending.size();
            List<BoardPost> queueRows = new ArrayList<>(pending.stream()
                    .filter(post -> !post.hasOpenUndoWindow())
                    .toList());
            Collections.reverse(queueRows);
            queue = context.map(queueRows);
            reviewed = context.map(room.stream()
                    .filter(post -> post.getState() != BoardPostState.PENDING && post.getHiddenAt() == null)
                    .toList());
        }

        EventDetailDto detail = eventService.detail(viewerId, eventId);
        Map<UUID, EventPersonDto> peopleById = new HashMap<>();
        for (EventPersonDto person : detail.people()) {
            peopleById.put(UUID.fromString(person.id()), person);
        }

        UUID creatorId = event.getCreatorId();
        PersonDto creator = creatorId == null ? null : person(peopleById.get(creatorId));

        List<PersonDto> moderators = new ArrayList<>();
        for (EventMember member : members.findByEventId(eventId)) {
            if (!member.isModerator() || member.getUserId().equals(creatorId)) {
                continue;
            }
            PersonDto person = person(peopleById.get(member.getUserId()));
            if (person != null) {
                moderators.add(person);
            }
        }
        // The roster is already viewer-first, then by normalised name; keep it.
        List<String> order = detail.people().stream().map(EventPersonDto::id).toList();
        moderators.sort((left, right) -> Integer.compare(order.indexOf(left.id()), order.indexOf(right.id())));

        return new BoardSnapshotDto(detail, feed, ownUnpublished, queue, pendingCount, reviewed,
                creator, List.copyOf(moderators), viewerId.equals(creatorId));
    }

    /* --------------------------------------------- POST /events/{id}/posts */

    /**
     * Write to the board, or to one person on it.
     *
     * <p>With a {@code recipientId} this is {@code MessageService.deliver} with
     * {@code fromBoard = true} plus a card linked to the message it produced — so
     * the refusal rules, their order and their single 403 code are the wall's, not
     * a second copy of them, and the post never enters a queue in either mode.
     *
     * <p>Without one it is a room post: [D9] a moderator's own publishes at once in
     * both modes, recorded as {@code auto_approved_by_author}; everybody else's
     * depends on the board mode.
     */
    @Transactional
    public void send(UUID viewerId, UUID eventId, SendBoardPostRequest request) {
        Event event = enter(viewerId, eventId);
        access.requireLive(event);
        if (request == null) {
            throw ApiException.validation("invalid post", "text");
        }

        if (request.recipientId() != null && !request.recipientId().isBlank()) {
            // The path's event id wins over the body's: a board post belongs to the
            // board it was posted on, whatever the client repeated in the payload.
            SendWallMessageRequest wall = new SendWallMessageRequest(
                    eventId.toString(), request.recipientId(), request.text(),
                    request.anonymityLevel(), request.allowedHints(), request.screeningAcknowledged());
            InboxMessage message = messages.deliver(viewerId, wall, true);
            posts.saveAndFlush(BoardPost.toPerson(eventId, viewerId, message.getText(),
                    copyOf(message.getAnonymity()), message.getId(), message.getCreatedAt()));
        } else {
            posts.saveAndFlush(roomPost(event, viewerId, request));
        }
        publisher.publishEvent(new BoardChanged(eventId, Set.of(viewerId)));
    }

    private BoardPost roomPost(Event event, UUID viewerId, SendBoardPostRequest request) {
        String text = request.text() == null ? "" : request.text().trim();
        if (text.isEmpty() || text.length() > BoardPost.TEXT_MAX) {
            throw ApiException.validation("invalid post", "text");
        }
        AppUser sender = users.findById(viewerId)
                .orElseThrow(() -> ApiException.notFound("no such account"));
        Anonymity anonymity = Anonymity.from(request.anonymityLevel(),
                AllowedHints.orNone(request.allowedHints()),
                sender.getSection() == null ? null : sender.getSection().getId());

        // [B9] Rechecked here, never trusted from the composer's /messages/screen call.
        ScreeningResult screening = screener.screen(text);
        if (screening == ScreeningResult.BLOCK
                || (screening == ScreeningResult.WARN && !Boolean.TRUE.equals(request.screeningAcknowledged()))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "delivery_unavailable",
                    "delivery unavailable");
        }

        boolean moderator = access.isModerator(event, viewerId);
        BoardPostState state;
        String approvalKind;
        if (moderator) {
            state = BoardPostState.APPROVED;
            approvalKind = BoardPost.AUTO_APPROVED_BY_AUTHOR;
        } else if (POST_IMMEDIATELY.equals(event.getBoardMode())) {
            state = BoardPostState.APPROVED;
            approvalKind = BoardPost.IMMEDIATE;
        } else {
            state = BoardPostState.PENDING;
            approvalKind = null;
        }
        return BoardPost.toRoom(event.getId(), viewerId, text, anonymity, state, approvalKind,
                Instant.now(clock));
    }

    /* ----------------------------- PUT /events/{id}/posts/{post}/reaction */

    /**
     * One reaction per person per card; {@code null} takes it back. An unknown post
     * and an emoji outside the set are the same 422, because "that post is not on
     * this board" is not something a reaction tap needs to be told apart.
     */
    @Transactional
    public void react(UUID viewerId, UUID eventId, String rawPostId, String emoji) {
        Event event = enter(viewerId, eventId);
        access.requireLive(event);

        BoardPost post = publishedPost(eventId, rawPostId).orElse(null);
        if (post == null || (emoji != null && !PostReaction.EMOJI.contains(emoji))) {
            throw ApiException.validation("invalid reaction", "emoji");
        }
        if (emoji == null) {
            reactions.findByPostIdAndUserId(post.getId(), viewerId).ifPresent(reactions::delete);
        } else {
            reactions.findByPostIdAndUserId(post.getId(), viewerId)
                    .ifPresentOrElse(row -> row.setEmoji(emoji),
                            () -> reactions.save(PostReaction.of(post.getId(), viewerId, emoji,
                                    Instant.now(clock))));
        }
        reactions.flush();
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
    }

    /* ---------------------------- POST /events/{id}/moderation/approve */

    /**
     * Batch approve, all or nothing. If any id is no longer a pending room post of
     * this board — approved by a co-moderator a second earlier, already rejected,
     * inside an undo window — the whole call is 409 and nothing moves, so two
     * moderators working the same queue can never half-apply each other's batch.
     */
    @Transactional
    public void approve(UUID viewerId, UUID eventId, List<String> rawIds) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        access.requireLive(event);

        Set<String> unique = new LinkedHashSet<>(rawIds == null ? List.of() : rawIds);
        if (unique.isEmpty()) {
            throw queueChanged();
        }
        List<BoardPost> rows = new ArrayList<>(unique.size());
        for (String rawId : unique) {
            rows.add(queueablePost(eventId, rawId));
        }
        rows.forEach(post -> post.approve(BoardPost.MODERATOR));
        posts.saveAllAndFlush(rows);
        publisher.publishEvent(new BoardChanged(eventId, senderIds(rows)));
    }

    /* ------------------------------ POST /events/{id}/posts/{post}/reject */

    /**
     * [D8]/[B6] Rejection is final, but not yet. The post stays {@code pending} for
     * five seconds and leaves the queue; the frame published is <b>public only</b>,
     * so the moderators' queue refreshes and the sender is told nothing about a
     * rejection that may be a mis-tap. Their private frame comes from the
     * transition that finalises it.
     */
    @Transactional
    public RejectionReceiptDto reject(UUID viewerId, UUID eventId, String rawPostId) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        access.requireLive(event);

        BoardPost post = queueablePost(eventId, rawPostId);
        Instant until = Instant.now(clock).plus(UNDO_WINDOW);
        String token = undoToken();
        post.beginRejection(viewerId, token, until);
        posts.saveAndFlush(post);
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
        return new RejectionReceiptDto(token, until);
    }

    /* -------------------------------- POST /events/{id}/moderation/undo */

    /** The moderator who rejected, before the deadline. Anyone or anything else is 409. */
    @Transactional
    public void undo(UUID viewerId, UUID eventId, String token) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        access.requireLive(event);

        // A window that has already closed was finalised by `enter` above, which
        // cleared the token — so an expired undo simply finds nothing.
        BoardPost post = token == null || token.isBlank()
                ? null : posts.findByRejectionUndoToken(token).orElse(null);
        if (post == null
                || !post.getEventId().equals(eventId)
                || !viewerId.equals(post.getRejectedBy())
                || post.getRejectionUndoUntil() == null
                || !Instant.now(clock).isBefore(post.getRejectionUndoUntil())) {
            throw new ApiException(HttpStatus.CONFLICT, "undo_expired", "undo expired");
        }
        post.cancelRejection();
        posts.saveAndFlush(post);
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
    }

    /* -------------------------------- POST /events/{id}/posts/{post}/hide */

    /** Room posts only: a card addressed to a person is the recipient's to take down, not a moderator's. */
    @Transactional
    public void hide(UUID viewerId, UUID eventId, String rawPostId) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        access.requireLive(event);

        BoardPost post = publishedPost(eventId, rawPostId)
                .filter(BoardPost::isRoomPost)
                .orElseThrow(() -> ApiException.notFound("no such post"));
        post.hide(viewerId, Instant.now(clock));
        posts.saveAndFlush(post);
        publisher.publishEvent(new BoardChanged(eventId, Set.of(post.getSenderId())));
    }

    /* ------------------------------ POST /events/{id}/posts/{post}/report */

    /**
     * Any member, on any published card, on a live or an archived board — reporting
     * something must not stop working because the event ended.
     */
    @Transactional
    public void report(UUID viewerId, UUID eventId, String rawPostId, String reason) {
        enter(viewerId, eventId);
        BoardPost post = publishedPost(eventId, rawPostId)
                .orElseThrow(() -> ApiException.notFound("no such post"));
        reports.file(viewerId, Report.BOARD_POST, post.getId(), reason);
    }

    /* -------------------------------------------- PUT /events/{id}/controls */

    /** [D4] A mode change affects future posts only; posts already in the queue stay there. */
    @Transactional
    public void controls(UUID viewerId, UUID eventId, ControlsRequest request) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        if (access.statusOf(event) == EventStatus.ARCHIVED) {
            throw new ApiException(HttpStatus.CONFLICT, BOARD_ARCHIVED, "board archived");
        }
        if (request == null) {
            return;
        }
        if (request.boardMode() != null) {
            String mode = request.boardMode().trim().toLowerCase(Locale.ROOT);
            if (!BOARD_MODES.contains(mode)) {
                throw ApiException.validation("invalid board mode", "boardMode");
            }
            event.setBoardMode(mode);
        }
        if (request.endsAt() != null) {
            Instant endsAt = instant(request.endsAt());
            Instant now = Instant.now(clock);
            Instant floor = now.isAfter(event.getStartsAt()) ? now : event.getStartsAt();
            if (endsAt == null || !endsAt.isAfter(floor)) {
                throw ApiException.validation("invalid end", "endsAt");
            }
            event.setEndsAt(endsAt);
        }
        events.saveAndFlush(event);
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
    }

    /* ----------------------------------------------- POST /events/{id}/close */

    /**
     * [D4] Ending early archives at once — there is no fourth status — and every
     * post still waiting becomes {@code rejected/board_closed}, so the sender sees
     * the ordinary "Not published" card instead of waiting forever.
     */
    @Transactional
    public void close(UUID viewerId, UUID eventId) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);
        access.requireLive(event);

        Instant now = Instant.now(clock);
        event.close(viewerId, now);
        events.saveAndFlush(event);
        publisher.publishEvent(new BoardChanged(eventId, applyTransitions(event, now)));
    }

    /* ------------------------ PUT|DELETE /events/{id}/moderators/{person} */

    /**
     * Creator only. A co-moderator shares the queue, not the guest list — otherwise
     * one add would make the board's moderation self-replicating.
     */
    @Transactional
    public void setModerator(UUID viewerId, UUID eventId, String rawPersonId, boolean enabled) {
        Event event = enter(viewerId, eventId);
        requireModerator(event, viewerId);

        UUID personId = optionalId(rawPersonId);
        if (!viewerId.equals(event.getCreatorId())
                || personId == null
                || personId.equals(event.getCreatorId())) {
            throw cannotChangeModerator();
        }
        EventMember member = members.findByEventIdAndUserId(eventId, personId)
                .orElseThrow(BoardService::cannotChangeModerator);
        if (access.statusOf(event) == EventStatus.ARCHIVED) {
            throw new ApiException(HttpStatus.CONFLICT, BOARD_ARCHIVED, "board archived");
        }
        member.setModerator(enabled);
        members.saveAndFlush(member);
        publisher.publishEvent(BoardChanged.publicOnly(eventId));
    }

    /* ------------------------------------------------------ housekeeping [B5] */

    /**
     * The two things a derived status cannot do, for every board at once: finalise
     * rejections whose window has passed, and reject posts still pending on a board
     * that has closed or ended.
     *
     * <p>It is deliberately the <em>same</em> per-event pass the board read runs, so
     * a scheduler that never fires changes nothing anyone can see — only when they
     * are told.
     */
    @Transactional
    public void housekeeping() {
        Instant now = Instant.now(clock);
        Set<UUID> eventIds = new LinkedHashSet<>();
        eventIds.addAll(posts.eventsWithPendingPostsPastEnd(BoardPostState.PENDING, now));
        eventIds.addAll(posts.eventsWithExpiredUndo(BoardPostState.PENDING, now));
        for (UUID eventId : eventIds) {
            events.findById(eventId).ifPresent(event -> {
                Set<UUID> affected = applyTransitions(event, now);
                if (!affected.isEmpty()) {
                    publisher.publishEvent(new BoardChanged(eventId, affected));
                }
            });
        }
    }

    /* ------------------------------------------------------------- internals */

    /**
     * Membership, then time. Every board route starts here, inside the transaction,
     * so no surface can read or write a board whose pending posts are stale.
     */
    private Event enter(UUID viewerId, UUID eventId) {
        Event event = access.requireMember(eventId, viewerId);
        Set<UUID> affected = applyTransitions(event, Instant.now(clock));
        if (!affected.isEmpty()) {
            publisher.publishEvent(new BoardChanged(eventId, affected));
        }
        return event;
    }

    /**
     * The lazy transitions, which are also the housekeeping job's.
     *
     * <p>Closed or ended wins over an open undo window: a board that is over has no
     * moderator decision left to take back. A moderator rejection keeps
     * {@code rejected_by} as the audit of who did it and stamps {@code rejected_at}
     * at the deadline, not at whatever moment someone happened to read the board —
     * the post has been rejected since then whether anyone looked or not.
     *
     * @return the senders whose own view changed, for the private frames
     */
    private Set<UUID> applyTransitions(Event event, Instant now) {
        List<BoardPost> pending = posts.pendingRoomPosts(event.getId(), BoardPostState.PENDING);
        if (pending.isEmpty()) {
            return Set.of();
        }
        boolean over = event.getClosedAt() != null || !now.isBefore(event.getEndsAt());
        List<BoardPost> changed = new ArrayList<>();
        Set<UUID> affected = new LinkedHashSet<>();
        for (BoardPost post : pending) {
            if (over) {
                post.finaliseRejection(BoardPost.REASON_BOARD_CLOSED, null, now);
            } else if (post.getRejectionUndoUntil() != null
                    && !now.isBefore(post.getRejectionUndoUntil())) {
                post.finaliseRejection(BoardPost.REASON_MODERATOR, post.getRejectedBy(),
                        post.getRejectionUndoUntil());
            } else {
                continue;
            }
            changed.add(post);
            affected.add(post.getSenderId());
        }
        if (changed.isEmpty()) {
            return Set.of();
        }
        posts.saveAllAndFlush(changed);
        return affected;
    }

    private void requireModerator(Event event, UUID viewerId) {
        if (!access.isModerator(event, viewerId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, MODERATOR_REQUIRED, "moderator required");
        }
    }

    /** A card in the queue right now: this board's, to the room, pending, not being rejected. */
    private BoardPost queueablePost(UUID eventId, String rawId) {
        UUID id = optionalId(rawId);
        BoardPost post = id == null ? null : posts.findById(id).orElse(null);
        if (post == null
                || !post.getEventId().equals(eventId)
                || !post.isRoomPost()
                || post.getState() != BoardPostState.PENDING
                || post.hasOpenUndoWindow()) {
            throw queueChanged();
        }
        return post;
    }

    private java.util.Optional<BoardPost> publishedPost(UUID eventId, String rawId) {
        UUID id = optionalId(rawId);
        return id == null ? java.util.Optional.empty()
                : posts.publishedById(eventId, id, BoardPostState.APPROVED, MessageState.APPROVED);
    }

    private static ApiException queueChanged() {
        return new ApiException(HttpStatus.CONFLICT, QUEUE_CHANGED, "queue changed");
    }

    private static ApiException cannotChangeModerator() {
        return new ApiException(HttpStatus.FORBIDDEN, "cannot_change_moderator",
                "cannot change moderator");
    }

    /** [B6] 32 random bytes, URL-safe. It is a capability, not an identifier. */
    private static String undoToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static Set<UUID> senderIds(Collection<BoardPost> rows) {
        Set<UUID> ids = new LinkedHashSet<>();
        rows.forEach(post -> ids.add(post.getSenderId()));
        return ids;
    }

    private PersonDto person(EventPersonDto row) {
        return row == null ? null
                : new PersonDto(row.id(), row.name(), row.avatarUrl(), row.section(), null);
    }

    /**
     * A fresh copy of a message's anonymity columns — value-equal, but a new
     * instance, because handing a managed entity's embeddable to another entity
     * would make two rows share one object.
     */
    private static Anonymity copyOf(Anonymity anonymity) {
        if (anonymity == null) {
            return Anonymity.from(AnonymityLevel.ANONYMOUS, AllowedHints.NONE, null);
        }
        return Anonymity.from(anonymity.level(),
                new AllowedHints(anonymity.hintSection(), anonymity.hintCountry(), anonymity.hintLetter()),
                anonymity.senderSectionId());
    }

    /** ISO-8601, with or without an offset. Null when it is neither; the caller names the field. */
    private static Instant instant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException notInstant) {
            try {
                return OffsetDateTime.parse(raw).toInstant();
            } catch (DateTimeParseException ex) {
                return null;
            }
        }
    }

    private static UUID optionalId(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException notAnId) {
            return null;
        }
    }

    /**
     * Everything a batch of cards needs to render, in four queries rather than per
     * card: the live sender rows (for {@code named} and the first letter), the
     * snapshot sections (for the chips [B4]), the recipients of the cards addressed
     * to a person, and every reaction on the board.
     */
    private Context contextFor(Collection<BoardPost> rows, UUID viewerId) {
        Set<UUID> senderIds = new HashSet<>();
        Set<UUID> sectionIds = new HashSet<>();
        Set<UUID> messageIds = new HashSet<>();
        Set<UUID> postIds = new HashSet<>();
        for (BoardPost post : rows) {
            senderIds.add(post.getSenderId());
            if (post.getAnonymity() != null && post.getAnonymity().senderSectionId() != null) {
                sectionIds.add(post.getAnonymity().senderSectionId());
            }
            if (post.getInboxMessageId() != null) {
                messageIds.add(post.getInboxMessageId());
            }
            postIds.add(post.getId());
        }

        Map<UUID, Section> snapshots = byId(sections.findAllById(sectionIds), Section::getId);

        Map<UUID, PersonDto> recipients = new HashMap<>();
        if (!messageIds.isEmpty()) {
            List<InboxMessage> linked = inboxMessages.findAllById(messageIds);
            Set<UUID> recipientIds = new HashSet<>();
            linked.forEach(message -> recipientIds.add(message.getRecipientId()));
            Map<UUID, AppUser> people = byId(users.findAllById(recipientIds), AppUser::getId);
            for (InboxMessage message : linked) {
                AppUser person = people.get(message.getRecipientId());
                if (person != null) {
                    recipients.put(message.getId(), new PersonDto(person.getId().toString(),
                            person.getName(), meMapper.avatarUrl(person.getAvatarKey()),
                            meMapper.toSectionRef(person.getSection()), null));
                }
            }
        }

        Map<UUID, AppUser> senders = byId(users.findAllById(senderIds), AppUser::getId);

        Map<UUID, Map<String, Integer>> counts = new HashMap<>();
        Map<UUID, String> mine = new HashMap<>();
        if (!postIds.isEmpty()) {
            for (PostReaction reaction : reactions.forPosts(postIds)) {
                counts.computeIfAbsent(reaction.getPostId(), key -> new LinkedHashMap<>())
                        .merge(reaction.getEmoji(), 1, Integer::sum);
                if (reaction.getUserId().equals(viewerId)) {
                    mine.put(reaction.getPostId(), reaction.getEmoji());
                }
            }
        }

        return new Context(senders, snapshots, recipients, counts, mine, presenter, viewerId);
    }

    private static <T> Map<UUID, T> byId(Iterable<T> rows, Function<T, UUID> id) {
        Map<UUID, T> map = new HashMap<>();
        for (T row : rows) {
            map.put(id.apply(row), row);
        }
        return map;
    }

    /** One board's worth of lookups, so rendering a card is pure. */
    private record Context(Map<UUID, AppUser> senders,
                           Map<UUID, Section> snapshotSections,
                           Map<UUID, PersonDto> recipientsByMessage,
                           Map<UUID, Map<String, Integer>> reactionCounts,
                           Map<UUID, String> myReactions,
                           SenderPresenter presenter,
                           UUID viewerId) {

        List<BoardPostDto> map(List<BoardPost> rows) {
            return rows.stream().map(this::dto).toList();
        }

        BoardPostDto dto(BoardPost post) {
            Anonymity anonymity = post.getAnonymity();
            Section snapshot = anonymity == null || anonymity.senderSectionId() == null
                    ? null : snapshotSections.get(anonymity.senderSectionId());
            MessageSenderDto sender = presenter.present(anonymity, senders.get(post.getSenderId()), snapshot);
            return new BoardPostDto(
                    post.getId().toString(),
                    post.getText(),
                    sender,
                    post.getCreatedAt(),
                    // A card addressed to a person was never queued; showing its row
                    // state would leak a decision that is not the board's to show.
                    post.isRoomPost() ? post.getState() : BoardPostState.APPROVED,
                    viewerId.equals(post.getSenderId()),
                    reactionCounts.getOrDefault(post.getId(), Map.of()),
                    myReactions.get(post.getId()),
                    post.isRoomPost() ? null : recipientsByMessage.get(post.getInboxMessageId()),
                    post.getRejectionReason());
        }
    }
}
