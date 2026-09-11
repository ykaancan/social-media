package app.brand.board;

import app.brand.board.BoardDtos.ApproveRequest;
import app.brand.board.BoardDtos.BoardSnapshotDto;
import app.brand.board.BoardDtos.ControlsRequest;
import app.brand.board.BoardDtos.ReactionRequest;
import app.brand.board.BoardDtos.RejectionReceiptDto;
import app.brand.board.BoardDtos.ReportPostRequest;
import app.brand.board.BoardDtos.SendBoardPostRequest;
import app.brand.board.BoardDtos.UndoRequest;
import app.brand.event.EventAccess;
import app.brand.message.MessageDtos.AcceptedDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The board routes, exactly as {@code http.ts} calls them. Approved members only
 * — {@code ApprovedMemberFilter} answers 403 {@code approval_required} before any
 * of this runs, so nothing here checks a status.
 *
 * <p>Three status codes carry meaning the client acts on: <b>404</b> for a board
 * the caller is not a member of (never 403 — "exists but not yours" must not
 * show), <b>409 {@code board_read_only}</b> for a write to a board that is not
 * live [D4], and <b>409 {@code queue_changed}</b> when a moderation batch has been
 * overtaken, which the app answers by refetching rather than by showing an error.
 */
@RestController
@RequestMapping("/events/{eventId}")
public class BoardController {

    private final BoardService board;

    public BoardController(BoardService board) {
        this.board = board;
    }

    @GetMapping("/board")
    public BoardSnapshotDto board(@CurrentUser AppPrincipal principal, @PathVariable String eventId) {
        return board.snapshot(principal.id(), EventAccess.eventId(eventId));
    }

    /** {@code {accepted:true}} for everything that was written, to the room or to a person. */
    @PostMapping("/posts")
    public AcceptedDto send(@CurrentUser AppPrincipal principal,
                            @PathVariable String eventId,
                            @RequestBody(required = false) SendBoardPostRequest request) {
        board.send(principal.id(), EventAccess.eventId(eventId), request);
        return AcceptedDto.yes();
    }

    @PutMapping("/posts/{postId}/reaction")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void react(@CurrentUser AppPrincipal principal,
                      @PathVariable String eventId,
                      @PathVariable String postId,
                      @RequestBody(required = false) ReactionRequest request) {
        board.react(principal.id(), EventAccess.eventId(eventId), postId,
                request == null ? null : request.emoji());
    }

    @PostMapping("/moderation/approve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void approve(@CurrentUser AppPrincipal principal,
                        @PathVariable String eventId,
                        @RequestBody(required = false) ApproveRequest request) {
        board.approve(principal.id(), EventAccess.eventId(eventId),
                request == null ? null : request.ids());
    }

    /** [D8] The receipt is the only place an undo token is ever returned. */
    @PostMapping("/posts/{postId}/reject")
    public RejectionReceiptDto reject(@CurrentUser AppPrincipal principal,
                                      @PathVariable String eventId,
                                      @PathVariable String postId) {
        return board.reject(principal.id(), EventAccess.eventId(eventId), postId);
    }

    @PostMapping("/moderation/undo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void undo(@CurrentUser AppPrincipal principal,
                     @PathVariable String eventId,
                     @RequestBody(required = false) UndoRequest request) {
        board.undo(principal.id(), EventAccess.eventId(eventId),
                request == null ? null : request.undoToken());
    }

    @PostMapping("/posts/{postId}/hide")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hide(@CurrentUser AppPrincipal principal,
                     @PathVariable String eventId,
                     @PathVariable String postId) {
        board.hide(principal.id(), EventAccess.eventId(eventId), postId);
    }

    @PostMapping("/posts/{postId}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@CurrentUser AppPrincipal principal,
                       @PathVariable String eventId,
                       @PathVariable String postId,
                       @RequestBody(required = false) ReportPostRequest request) {
        board.report(principal.id(), EventAccess.eventId(eventId), postId,
                request == null ? null : request.reason());
    }

    @PutMapping("/controls")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void controls(@CurrentUser AppPrincipal principal,
                         @PathVariable String eventId,
                         @RequestBody(required = false) ControlsRequest request) {
        board.controls(principal.id(), EventAccess.eventId(eventId), request);
    }

    /** [D4] Archived immediately; there is no reopen and no fourth status. */
    @PostMapping("/close")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void close(@CurrentUser AppPrincipal principal, @PathVariable String eventId) {
        board.close(principal.id(), EventAccess.eventId(eventId));
    }

    @PutMapping("/moderators/{personId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addModerator(@CurrentUser AppPrincipal principal,
                             @PathVariable String eventId,
                             @PathVariable String personId) {
        board.setModerator(principal.id(), EventAccess.eventId(eventId), personId, true);
    }

    @DeleteMapping("/moderators/{personId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeModerator(@CurrentUser AppPrincipal principal,
                                @PathVariable String eventId,
                                @PathVariable String personId) {
        board.setModerator(principal.id(), EventAccess.eventId(eventId), personId, false);
    }
}
