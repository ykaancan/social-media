package app.brand.message;

import app.brand.common.ApiException;
import app.brand.common.Ids;
import app.brand.content.AllowedHints;
import app.brand.content.Anonymity;
import app.brand.content.AnonymityLevel;
import app.brand.content.MessageSenderDto;
import app.brand.content.SenderPresenter;
import app.brand.event.Event;
import app.brand.event.EventAccess;
import app.brand.event.EventMemberRepository;
import app.brand.event.EventRepository;
import app.brand.message.MessageDtos.InboxMessageDto;
import app.brand.message.MessageDtos.InboxSnapshotDto;
import app.brand.message.MessageDtos.SendWallMessageRequest;
import app.brand.message.MessageDtos.SourceDto;
import app.brand.message.MessageDtos.WallMessageDto;
import app.brand.message.MessageDtos.WallPersonDto;
import app.brand.message.MessageDtos.WallSnapshotDto;
import app.brand.safety.BlockService;
import app.brand.safety.ContentScreener;
import app.brand.safety.ContentScreener.ScreeningResult;
import app.brand.safety.RecipientPolicy;
import app.brand.safety.Report;
import app.brand.safety.ReportService;
import app.brand.safety.WritingPolicy;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.MeMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The inbox and the wall — BACKEND_PLAN.md §3 "Walls and inbox", which is
 * {@code mock.ts}'s behaviour unchanged.
 *
 * <p>Four rules shape all of it:
 *
 * <ul>
 *   <li><b>The recipient curates.</b> Everything written to a person lands
 *       privately; the wall is exactly {@code state = approved} [D12] and the
 *       sender has no say in it and is never told where their message went.</li>
 *   <li><b>Hidden is one rule, applied everywhere.</b> Soft-deleted [D12], or from
 *       a sender the viewer blocked [D6] — in the list, in the counts, on the wall
 *       and in every by-id lookup, which is why it lives in the repository's
 *       queries rather than in a filter each caller remembers to call.</li>
 *   <li><b>Refusal tells the sender as little as possible.</b> Every reason a
 *       message cannot be delivered is one 403 with one code: naming which one
 *       would turn the endpoint into a way to read a stranger's settings, their
 *       block list or their membership of a board.</li>
 *   <li><b>Muted words are not screening</b> [D10]. Screening decides delivery and
 *       warns the sender first; a muted word delivers normally, files the message
 *       to {@code private}, suppresses the push and says nothing to anyone.</li>
 * </ul>
 */
@Service
public class MessageService {

    /** One code for every refused delivery. Which rule refused it is never disclosed. */
    private static final String DELIVERY_UNAVAILABLE = "delivery_unavailable";

    private final InboxMessageRepository messages;
    private final AppUserRepository users;
    private final EventRepository events;
    private final EventMemberRepository members;
    private final EventAccess access;
    private final SenderPresenter presenter;
    private final MeMapper meMapper;
    private final BlockService blocks;
    private final RecipientPolicy recipients;
    private final ContentScreener screener;
    private final ReportService reports;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public MessageService(InboxMessageRepository messages,
                          AppUserRepository users,
                          EventRepository events,
                          EventMemberRepository members,
                          EventAccess access,
                          SenderPresenter presenter,
                          MeMapper meMapper,
                          BlockService blocks,
                          RecipientPolicy recipients,
                          ContentScreener screener,
                          ReportService reports,
                          ApplicationEventPublisher publisher,
                          Clock clock) {
        this.messages = messages;
        this.users = users;
        this.events = events;
        this.members = members;
        this.access = access;
        this.presenter = presenter;
        this.meMapper = meMapper;
        this.blocks = blocks;
        this.recipients = recipients;
        this.screener = screener;
        this.reports = reports;
        this.publisher = publisher;
        this.clock = clock;
    }

    /* --------------------------------------------------------- GET /me/inbox */

    /**
     * The caller's own inbox, newest first, with the counts the three filter tabs
     * and the tab badge read. The counts are taken over exactly the list that was
     * returned, so a badge can never promise a card the list does not hold.
     */
    @Transactional(readOnly = true)
    public InboxSnapshotDto inbox(UUID viewerId) {
        List<InboxMessage> rows = messages.inboxOf(viewerId);
        Context context = contextFor(rows);

        List<InboxMessageDto> dtos = new ArrayList<>(rows.size());
        Map<String, Long> counts = new LinkedHashMap<>();
        for (MessageState state : MessageState.values()) {
            counts.put(state.value(), 0L);
        }
        for (InboxMessage row : rows) {
            dtos.add(new InboxMessageDto(row.getId().toString(), row.getText(), context.sender(row),
                    row.getCreatedAt(), context.source(row), row.isFromBoard(), row.getState()));
            counts.merge(row.getState().value(), 1L, Long::sum);
        }
        return new InboxSnapshotDto(dtos, counts);
    }

    /* ------------------------ GET /events/{id}/people/{id}/wall */

    /**
     * Someone's wall, read from inside an event. Both people must be members of it
     * — the event context is what keeps walls from being discoverable, which stage
     * 1 has no surface for (brief §6).
     *
     * <p>Everything that fails is 404: a board the viewer is not in, a person who
     * is not on it, an account that is not approved. "Exists but not yours" must
     * not be distinguishable from "does not exist".
     */
    @Transactional(readOnly = true)
    public WallSnapshotDto wall(UUID viewerId, String rawEventId, String rawPersonId) {
        Event event = access.requireMember(rawEventId, viewerId);
        UUID personId = Ids.orNotFound(rawPersonId, "no such wall");

        AppUser target = users.findById(personId).orElseThrow(() -> ApiException.notFound("no such wall"));
        if (target.getStatus() != AccountStatus.APPROVED
                || !members.existsByEventIdAndUserId(event.getId(), personId)) {
            throw ApiException.notFound("no such wall");
        }

        List<InboxMessage> rows = messages.wallOf(personId, viewerId, MessageState.APPROVED);
        Context context = contextFor(rows);
        List<WallMessageDto> dtos = new ArrayList<>(rows.size());
        for (InboxMessage row : rows) {
            dtos.add(new WallMessageDto(row.getId().toString(), row.getText(), context.sender(row),
                    row.getCreatedAt(), context.source(row), row.isFromBoard()));
        }

        WallPersonDto person = new WallPersonDto(
                target.getId().toString(),
                target.getName(),
                meMapper.avatarUrl(target.getAvatarKey()),
                meMapper.toSectionRef(target.getSection()),
                target.getBio());

        return new WallSnapshotDto(person, dtos, dtos.size(), viewerId.equals(personId),
                recipients.writingPolicy(personId));
    }

    /* ----------------------------------------------------- POST /messages/wall */

    /**
     * Deliver a message to someone's inbox.
     *
     * <p>{@code fromBoard} is B-3's door: a board post addressed to a person is
     * exactly this call with {@code true}, which sets {@code from_board} and makes
     * the card read "approved from the board" once the recipient publishes it.
     * Board posts themselves are not built here.
     *
     * <p>The order is the mock's, and it matters. Every "we will not deliver this"
     * answer (403) is decided before the text is even looked at, so a sender
     * cannot use a validation error to learn that a stranger exists, is on this
     * board, or has blocked them. Then validation, then screening, and only then
     * the recipient's muted words — which are invisible to the sender by
     * construction, because the answer is {@code accepted} either way [D10].
     *
     * @return the stored row, for B-3 to link a {@code board_post} to
     */
    @Transactional
    public InboxMessage deliver(UUID senderId, SendWallMessageRequest request, boolean fromBoard) {
        if (request == null) {
            throw refused();
        }
        AppUser sender = users.findById(senderId).orElseThrow(MessageService::refused);
        UUID recipientId = Ids.orNull(request.recipientId());
        UUID eventId = Ids.orNull(request.eventId());
        if (recipientId == null || eventId == null || recipientId.equals(senderId)) {
            throw refused();
        }
        AppUser recipient = users.findById(recipientId).orElseThrow(MessageService::refused);
        Event event = events.findById(eventId).orElseThrow(MessageService::refused);
        if (recipient.getStatus() != AccountStatus.APPROVED
                || !members.existsByEventIdAndUserId(event.getId(), senderId)
                || !members.existsByEventIdAndUserId(event.getId(), recipientId)
                || blocks.isBlocked(recipientId, senderId)) {
            throw refused();
        }
        // Compared as the raw string, before the level is parsed: an unknown level
        // from someone this person refuses to hear from is still a refusal, not a
        // 422 that tells the sender their policy.
        WritingPolicy policy = recipients.writingPolicy(recipientId);
        if (policy == WritingPolicy.NOBODY
                || (policy == WritingPolicy.NAMED_ONLY
                        && !AnonymityLevel.NAMED.value().equals(request.anonymityLevel()))) {
            throw refused();
        }

        String text = request.text() == null ? "" : request.text().trim();
        if (text.isEmpty() || text.length() > InboxMessage.TEXT_MAX) {
            throw ApiException.validation("invalid message", "text");
        }
        Anonymity anonymity = Anonymity.from(request.anonymityLevel(),
                AllowedHints.orNone(request.allowedHints()),
                sender.getSection() == null ? null : sender.getSection().getId());

        // [B9] Rechecked here, never trusted from the composer's own /messages/screen
        // call: acknowledgement gets a soft match through, and never a hard one.
        ScreeningResult screening = screener.screen(text);
        if (screening == ScreeningResult.BLOCK
                || (screening == ScreeningResult.WARN && !request.acknowledged())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, DELIVERY_UNAVAILABLE,
                    "delivery unavailable");
        }

        boolean muted = recipients.mutedMatch(recipientId, text);
        boolean pushSuppressed = muted || !recipients.notifyInbox(recipientId);
        Instant now = Instant.now(clock);

        InboxMessage stored = messages.saveAndFlush(InboxMessage.deliver(
                senderId, recipientId, event.getId(), text, anonymity,
                muted ? MessageState.PRIVATE : MessageState.NEW,
                fromBoard, muted, pushSuppressed,
                screening == ScreeningResult.WARN ? InboxMessage.SOFT : null,
                now));

        publisher.publishEvent(new InboxMessageDelivered(
                stored.getId(), recipientId, event.getId(), pushSuppressed));
        return stored;
    }

    /* --------------------------------------- PUT /me/inbox/{id}/state, DELETE */

    /** [D12] Any of the three, in either direction, as often as they like. */
    @Transactional
    public InboxMessageDto setState(UUID viewerId, String rawId, String rawState) {
        InboxMessage row = own(viewerId, rawId);
        row.moveTo(MessageState.ofWire(rawState), Instant.now(clock));
        messages.saveAndFlush(row);
        publisher.publishEvent(new InboxMessageChanged(row.getId(), row.getEventId()));

        Context context = contextFor(List.of(row));
        return new InboxMessageDto(row.getId().toString(), row.getText(), context.sender(row),
                row.getCreatedAt(), context.source(row), row.isFromBoard(), row.getState());
    }

    /**
     * [D12] Soft delete. The row survives so a report filed against it still shows
     * the admin the content and the sender — which is also why no copy anywhere
     * may say the message was "removed".
     */
    @Transactional
    public void delete(UUID viewerId, String rawId) {
        InboxMessage row = own(viewerId, rawId);
        row.softDelete(Instant.now(clock));
        messages.saveAndFlush(row);
        publisher.publishEvent(new InboxMessageChanged(row.getId(), row.getEventId()));
    }

    /* ------------------------------------ POST /messages/{id}/report, /block */

    /** One report per person per message; a second tap is a no-op, not a failure. */
    @Transactional
    public void report(UUID viewerId, String rawId, String reason) {
        InboxMessage row = own(viewerId, rawId);
        reports.file(viewerId, Report.INBOX_MESSAGE, row.getId(), reason);
    }

    /**
     * [D6] Block, by message id — so an anonymous sender can be blocked without the
     * blocker ever learning who they are. The frozen display columns are this
     * message's own anonymity snapshot: exactly what the card already showed, and
     * not one field more.
     *
     * <p>Nothing is deleted. The sender's other messages simply stop being visible
     * to this reader on the next read, their board posts stay on the board, and
     * they are not told.
     */
    @Transactional
    public void block(UUID viewerId, String rawId) {
        InboxMessage row = own(viewerId, rawId);
        blocks.block(viewerId, row.getSenderId(), Anonymity.copyOf(row.getAnonymity()));
        // The blocker's own surfaces have to catch up: their inbox loses this
        // sender's cards, and a card written from a board is one the board shows
        // too. Their thread list is invalidated by BlockService, which is also
        // where an unblock is published from.
        publisher.publishEvent(new InboxMessageChanged(row.getId(), row.getEventId()));
    }

    /* ---------------------------------------------------------------- helpers */

    /**
     * The caller's own message, still visible to them. Everything else is 404 —
     * someone else's message, a deleted one, one from a blocked sender, or an id
     * that was never a UUID.
     */
    private InboxMessage own(UUID viewerId, String rawId) {
        UUID id = Ids.orNotFound(rawId, "no such message");
        return messages.visibleTo(id, viewerId).orElseThrow(() -> ApiException.notFound("no such message"));
    }

    /**
     * Everything a batch of rows needs to be rendered: the senders and their
     * snapshot sections, resolved for the whole batch by {@link SenderPresenter},
     * plus the events the messages were written from.
     *
     * <p>Three queries rather than per row, because the inbox is read on every app
     * open and the board read behind it will be doing this a few hundred times at
     * an event.
     */
    private Context contextFor(Collection<InboxMessage> rows) {
        Set<UUID> eventIds = new HashSet<>();
        for (InboxMessage row : rows) {
            if (row.getEventId() != null) {
                eventIds.add(row.getEventId());
            }
        }
        Map<UUID, Event> sources = new HashMap<>();
        if (!eventIds.isEmpty()) {
            events.findAllById(eventIds).forEach(event -> sources.put(event.getId(), event));
        }
        return new Context(presenter.forRows(rows), sources);
    }

    private static ApiException refused() {
        return new ApiException(HttpStatus.FORBIDDEN, DELIVERY_UNAVAILABLE, "delivery unavailable");
    }

    /** One batch of rows' worth of lookups, so rendering a card is pure. */
    private record Context(SenderPresenter.Resolver senders, Map<UUID, Event> sourceEvents) {

        MessageSenderDto sender(InboxMessage row) {
            return senders.present(row);
        }

        SourceDto source(InboxMessage row) {
            Event event = row.getEventId() == null ? null : sourceEvents.get(row.getEventId());
            return event == null ? null : new SourceDto(event.getId().toString(), event.getName());
        }
    }
}
