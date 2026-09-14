package app.brand.support;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A member route that exists only in the test source set.
 *
 * <p>It has no rules of its own, so what it proves is exactly the
 * {@code ApprovedMemberFilter} behaviour — 401 with no token, 403
 * {@code approval_required} for an account that is not approved, 200 once it is —
 * without waiting for wave 2's real member routes.
 */
@RestController
public class PingController {

    @GetMapping("/ping-approved")
    public Map<String, Boolean> ping() {
        return Map.of("ok", true);
    }
}
