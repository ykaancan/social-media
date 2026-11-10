package app.brand.event;

import app.brand.organisation.MembershipDtos.OrganisationRefDto;
import app.brand.user.SectionRefDto;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

/**
 * The event DTOs from {@code app/src/api/tenant.ts} (which replace those in
 * {@code types.ts}), field for field.
 *
 * <p>{@code EventDetail extends EventSummary} there; records cannot extend, so
 * {@link EventDetailDto} repeats the summary's fields. The JSON is identical,
 * which is what the contract is about.
 *
 * <p>Optional fields ({@code section}, {@code closedAt}, {@code avatarUrl},
 * {@code bio}) are null here and dropped by Jackson's {@code non_null} inclusion,
 * so the client sees them absent exactly as {@code ?} declares.
 */
public final class EventDtos {

    private EventDtos() {
    }

    /**
     * {@code CreateEventRequest}. Timestamps arrive as strings so a bad one is a 422,
     * not a 400. [D13] {@code organisationId} is required; [P9] {@code scope} is
     * required iff the organisation has sections and must be absent otherwise.
     */
    public record CreateEventRequestDto(
            String organisationId,
            String name,
            String scope,
            String startsAt,
            String endsAt,
            String cover,
            String boardMode) {
    }

    /** {@code POST /events/join}. */
    public record JoinEventRequestDto(String code) {
    }

    /** {@code EventSummary}. {@code scope} is absent for an event without one (P9). */
    public record EventSummaryDto(
            String id,
            String name,
            /** [D13] */
            OrganisationRefDto organisation,
            String scope,
            Instant startsAt,
            Instant endsAt,
            String cover,
            String boardMode,
            EventStatus status,
            /** [D11] Present only for a section-scoped event. */
            SectionRefDto section,
            /** [D11] Present only when the event has a section; it is read off it. */
            String country,
            /** [D4] Set only when a moderator ended the board early. */
            Instant closedAt,
            long memberCount,
            long postCount) {
    }

    /** {@code EventDetail} — the summary plus what a member of the board may see. */
    public record EventDetailDto(
            String id,
            String name,
            OrganisationRefDto organisation,
            String scope,
            Instant startsAt,
            Instant endsAt,
            String cover,
            String boardMode,
            EventStatus status,
            SectionRefDto section,
            String country,
            Instant closedAt,
            long memberCount,
            long postCount,
            String joinCode,
            @JsonProperty("isModerator") boolean isModerator,
            List<EventPersonDto> people) {
    }

    /**
     * {@code Person & { bio?: string }} — the People tab. No email, no status, no
     * role, and no {@code country}: that is read off {@code section} [D11].
     */
    public record EventPersonDto(
            String id,
            String name,
            String avatarUrl,
            SectionRefDto section,
            String bio) {
    }

    /**
     * {@code EventJoinResult}. A miss is an ordinary 200 with {@code ok:false} —
     * the code screen shows "No event with that code", and a 404 would make the
     * client's generic error path swallow it.
     *
     * <p>[D17] The three membership refusals carry {@code organisation},
     * {@code approvalRequired} and {@code eventName}; the other answers leave
     * them null, so they are absent.
     */
    public record EventJoinResultDto(
            boolean ok,
            EventDetailDto event,
            String reason,
            String eventName,
            OrganisationRefDto organisation,
            Boolean approvalRequired) {

        public static EventJoinResultDto joined(EventDetailDto event) {
            return new EventJoinResultDto(true, event, null, null, null, null);
        }

        public static EventJoinResultDto notFound() {
            return new EventJoinResultDto(false, null, "not_found", null, null, null);
        }

        public static EventJoinResultDto alreadyJoined(String eventName) {
            return new EventJoinResultDto(false, null, "already_joined", eventName, null, null);
        }

        /** {@code membership_required | membership_pending | membership_rejected}. */
        public static EventJoinResultDto membership(String reason,
                                                    OrganisationRefDto organisation,
                                                    boolean approvalRequired,
                                                    String eventName) {
            return new EventJoinResultDto(false, null, reason, eventName, organisation, approvalRequired);
        }
    }
}
