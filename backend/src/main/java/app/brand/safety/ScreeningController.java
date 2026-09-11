package app.brand.safety;

import app.brand.common.ApiException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /messages/screen} — the pre-send check behind the composer's "this
 * may not be delivered" warning (brief §4.6).
 *
 * <p>It answers a boolean and nothing else. It does not say which word matched or
 * how severely: that would make the endpoint a way to read the hard list one
 * probe at a time. Delivery is decided again, server-side, when the message is
 * actually sent — this call is a courtesy to the sender, never a permit.
 */
@RestController
@RequestMapping("/messages")
public class ScreeningController {

    /** Wall and board posts are 280 characters; a thread message is 500. */
    private static final int MAX_MESSAGE = 280;
    private static final int MAX_THREAD_MESSAGE = 500;

    private final ContentScreener screener;

    public ScreeningController(ContentScreener screener) {
        this.screener = screener;
    }

    @PostMapping("/screen")
    public ScreenResponse screen(@RequestBody(required = false) ScreenRequest request) {
        String text = request == null || request.text() == null ? "" : request.text().trim();
        int max = "thread".equals(request == null ? null : request.context())
                ? MAX_THREAD_MESSAGE : MAX_MESSAGE;
        if (text.isEmpty() || text.length() > max) {
            throw ApiException.validation("invalid message", "text");
        }
        return new ScreenResponse(screener.screen(text).isWarning());
    }

    /** {@code context} is absent for wall and board text, {@code "thread"} in a thread. */
    public record ScreenRequest(String text, String context) {
    }

    public record ScreenResponse(boolean warning) {
    }
}
