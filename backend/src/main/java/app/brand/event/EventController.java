package app.brand.event;

import app.brand.event.EventDtos.CreateEventRequestDto;
import app.brand.event.EventDtos.EventDetailDto;
import app.brand.event.EventDtos.EventJoinResultDto;
import app.brand.event.EventDtos.EventSummaryDto;
import app.brand.event.EventDtos.JoinEventRequestDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /events} — approved members only; {@code ApprovedMemberFilter} answers
 * 403 {@code approval_required} before any of this runs, so nothing here checks a
 * status.
 *
 * <p>Every route answers 200. {@code POST /events} is not a 201 because the client
 * only reads {@code res.ok} and the mock returns the DTO — a different status here
 * would be a contract the app never asked for.
 */
@RestController
@RequestMapping("/events")
public class EventController {

    private final EventService events;

    public EventController(EventService events) {
        this.events = events;
    }

    @GetMapping
    public List<EventSummaryDto> list(@CurrentUser AppPrincipal principal) {
        return events.listMine(principal.id());
    }

    @PostMapping
    public EventDetailDto create(@CurrentUser AppPrincipal principal,
                                 @RequestBody(required = false) CreateEventRequestDto request) {
        return events.create(principal.id(), request);
    }

    /** A miss is {@code ok:false}, not a 404: the code screen has its own copy for it. */
    @PostMapping("/join")
    public EventJoinResultDto join(@CurrentUser AppPrincipal principal,
                                   @RequestBody(required = false) JoinEventRequestDto request) {
        return events.join(principal.id(), request == null ? null : request.code());
    }

    /** 404 for a non-member, deliberately: "exists but not yours" must not show. */
    @GetMapping("/{id}")
    public EventDetailDto detail(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        return events.detail(principal.id(), EventAccess.eventId(id));
    }
}
