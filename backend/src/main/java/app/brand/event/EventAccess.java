package app.brand.event;

import app.brand.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The three questions every board surface asks before it does anything, in one
 * place so wave 2 ({@code /events/{id}/people/{id}/wall}, {@code /messages/wall})
 * and step B-3 (the board itself) cannot each answer them slightly differently.
 *
 * <p>The important one is {@link #requireMember}: it is <b>404, never 403</b>.
 * "Exists but not yours" must not be distinguishable from "does not exist", or a
 * join code becomes something you can probe for [B14].
 */
@Component
public class EventAccess {

    private final EventRepository events;
    private final EventMemberRepository members;
    private final Clock clock;

    public EventAccess(EventRepository events, EventMemberRepository members, Clock clock) {
        this.events = events;
        this.members = members;
        this.clock = clock;
    }

    /** A malformed id is simply not an event anyone has: 404, not a parse error. */
    public static UUID eventId(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw ApiException.notFound("no such event");
        }
    }

    /** The event, if the caller is a member of it. Otherwise 404. */
    @Transactional(readOnly = true)
    public Event requireMember(UUID eventId, UUID userId) {
        Event event = events.findById(eventId).orElseThrow(() -> ApiException.notFound("no such event"));
        if (!members.existsByEventIdAndUserId(eventId, userId)) {
            throw ApiException.notFound("no such event");
        }
        return event;
    }

    /** Same, from the raw path variable. */
    @Transactional(readOnly = true)
    public Event requireMember(String rawEventId, UUID userId) {
        return requireMember(eventId(rawEventId), userId);
    }

    /**
     * Creator or co-moderator. The creator's own {@code event_member} row carries
     * the flag, but the creator id is checked too so a hand-written membership row
     * can never demote the person who made the board.
     */
    @Transactional(readOnly = true)
    public boolean isModerator(Event event, UUID userId) {
        if (userId == null) {
            return false;
        }
        if (userId.equals(event.getCreatorId())) {
            return true;
        }
        return members.findByEventIdAndUserId(event.getId(), userId)
                .map(EventMember::isModerator)
                .orElse(false);
    }

    public EventStatus statusOf(Event event) {
        return EventStatus.of(event, now());
    }

    /**
     * [D4] Board writability is {@code status = 'live'} and nothing else — not
     * "live and not closed", because closing makes it archived at once.
     */
    public void requireLive(Event event) {
        if (statusOf(event) != EventStatus.LIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "board_read_only", "board is read only");
        }
    }

    public Instant now() {
        return Instant.now(clock);
    }
}
