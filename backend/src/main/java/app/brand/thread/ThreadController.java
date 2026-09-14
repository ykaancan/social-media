package app.brand.thread;

import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import app.brand.thread.ThreadDtos.OpenThreadRequest;
import app.brand.thread.ThreadDtos.OpenedDto;
import app.brand.thread.ThreadDtos.ReadRequest;
import app.brand.thread.ThreadDtos.SendThreadMessageRequest;
import app.brand.thread.ThreadDtos.ThreadBlockRequest;
import app.brand.thread.ThreadDtos.ThreadDetailDto;
import app.brand.thread.ThreadDtos.ThreadReportRequest;
import app.brand.thread.ThreadDtos.ThreadsSnapshotDto;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The thread routes, exactly as {@code http.ts} calls them. Approved members only
 * — {@code ApprovedMemberFilter} answers 403 {@code approval_required} before any
 * of this runs, so nothing here checks a status.
 *
 * <p>{@code /me/threads} is the caller's own list; everything else acts on one
 * thread by id, and a thread that is not theirs is 404 on every one of them.
 */
@RestController
public class ThreadController {

    private final ThreadService threads;

    public ThreadController(ThreadService threads) {
        this.threads = threads;
    }

    /** [B7] Idempotent: the same {@code requestId} returns the first thread, not a second. */
    @PostMapping("/threads")
    public OpenedDto open(@CurrentUser AppPrincipal principal,
                          @RequestBody(required = false) OpenThreadRequest request) {
        return threads.open(principal.id(), request);
    }

    @GetMapping("/me/threads")
    public ThreadsSnapshotDto list(@CurrentUser AppPrincipal principal) {
        return threads.list(principal.id());
    }

    /** Reading a thread marks nothing read; the client sends the watermark itself. */
    @GetMapping("/threads/{id}")
    public ThreadDetailDto detail(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        return threads.detail(principal.id(), id);
    }

    @PostMapping("/threads/{id}/messages")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void send(@CurrentUser AppPrincipal principal,
                     @PathVariable String id,
                     @RequestBody(required = false) SendThreadMessageRequest request) {
        threads.send(principal.id(), id, request);
    }

    @PutMapping("/threads/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@CurrentUser AppPrincipal principal,
                     @PathVariable String id,
                     @RequestBody(required = false) ReadRequest request) {
        threads.read(principal.id(), id, request == null ? null : request.throughMessageId());
    }

    /** [D5] One way and idempotent; the bubbles above it keep the level they were sent at. */
    @PostMapping("/threads/{id}/reveal")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reveal(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        threads.reveal(principal.id(), id);
    }

    @PostMapping("/threads/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@CurrentUser AppPrincipal principal,
                       @PathVariable String id,
                       @RequestBody(required = false) ThreadReportRequest request) {
        threads.report(principal.id(), id, request == null ? null : request.reason());
    }

    /** [D6] By message id, and never an identity in the answer. */
    @PostMapping("/threads/{id}/block")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void block(@CurrentUser AppPrincipal principal,
                      @PathVariable String id,
                      @RequestBody(required = false) ThreadBlockRequest request) {
        threads.block(principal.id(), id, request == null ? null : request.messageId());
    }
}
