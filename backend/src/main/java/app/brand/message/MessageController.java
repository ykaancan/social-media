package app.brand.message;

import app.brand.message.MessageDtos.AcceptedDto;
import app.brand.message.MessageDtos.InboxMessageDto;
import app.brand.message.MessageDtos.InboxSnapshotDto;
import app.brand.message.MessageDtos.ReportRequest;
import app.brand.message.MessageDtos.SendWallMessageRequest;
import app.brand.message.MessageDtos.StateRequest;
import app.brand.message.MessageDtos.WallSnapshotDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The inbox and wall routes, exactly as {@code http.ts} calls them. Approved
 * members only — {@code ApprovedMemberFilter} answers 403 {@code approval_required}
 * before any of this runs, so nothing here checks a status.
 *
 * <p>The routes are split across three prefixes on purpose and the paths are the
 * client's: {@code /me/inbox*} is the owner's private surface, {@code /messages/*}
 * acts on one message by id, and a wall is only reachable through an event both
 * people joined.
 */
@RestController
public class MessageController {

    private final MessageService messages;

    public MessageController(MessageService messages) {
        this.messages = messages;
    }

    @GetMapping("/me/inbox")
    public InboxSnapshotDto inbox(@CurrentUser AppPrincipal principal) {
        return messages.inbox(principal.id());
    }

    /** 404 for a board the caller is not in, or a person who is not on it. */
    @GetMapping("/events/{eventId}/people/{personId}/wall")
    public WallSnapshotDto wall(@CurrentUser AppPrincipal principal,
                                @PathVariable String eventId,
                                @PathVariable String personId) {
        return messages.wall(principal.id(), eventId, personId);
    }

    /**
     * {@code {accepted:true}} for everything that was delivered, whatever state it
     * landed in. The sender never learns that a muted word filed it privately
     * [D10], and never learns which rule refused a send.
     */
    @PostMapping("/messages/wall")
    public AcceptedDto send(@CurrentUser AppPrincipal principal,
                            @RequestBody(required = false) SendWallMessageRequest request) {
        messages.deliver(principal.id(), request, false);
        return AcceptedDto.yes();
    }

    @PutMapping("/me/inbox/{id}/state")
    public InboxMessageDto state(@CurrentUser AppPrincipal principal,
                                 @PathVariable String id,
                                 @RequestBody(required = false) StateRequest request) {
        return messages.setState(principal.id(), id, request == null ? null : request.state());
    }

    /** [D12] Soft delete; the row survives for a report filed against it. */
    @DeleteMapping("/me/inbox/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        messages.delete(principal.id(), id);
    }

    @PostMapping("/messages/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@CurrentUser AppPrincipal principal,
                       @PathVariable String id,
                       @RequestBody(required = false) ReportRequest request) {
        messages.report(principal.id(), id, request == null ? null : request.reason());
    }

    /** [D6] Never returns an identity — not even to say whose message it was. */
    @PostMapping("/messages/{id}/block")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void block(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        messages.block(principal.id(), id);
    }
}
