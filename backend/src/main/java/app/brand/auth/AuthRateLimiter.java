package app.brand.auth;

import app.brand.common.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * [D21] Rate limits on the three public auth routes: failed logins per email and
 * per network address, sign-up requests per network address, and password-reset
 * requests per email and per network address (DECISIONS.md §21).
 *
 * <p>A different mechanism from {@code safety.RateLimiter} on purpose. That one
 * counts rows the account has already written; a failed login leaves no row, and
 * a table of attempts would store network addresses, which are personal data. So
 * the counts live <b>in memory only</b>: nothing here is written to a table or a
 * file, and nothing here logs an email or an address. The cost, accepted in
 * decision 21: counts reset when the backend restarts and are per instance.
 *
 * <p>Every window is <b>rolling</b>, like the content limiter: an entry counts while
 * it is younger than the window, and the request that would be the N+1th inside
 * any window is the one refused. A refused request is not itself counted. Time
 * comes from the application {@link Clock}, so a test can stand on a boundary.
 *
 * <p>A limit of {@code 0} or less switches that limit off: it is neither checked
 * nor counted.
 *
 * <p><b>Thread safety.</b> Every public method holds this object's monitor for its
 * whole check-and-record, so two concurrent requests can never both see room for
 * one. The work under the lock is a few map and deque operations; the password
 * check, the database and the mail all run outside it. A login reserves its
 * failure slot <i>before</i> the password is looked at and gives it back if the
 * password was right, so N parallel attempts at the boundary never let more than
 * the limit be evaluated.
 *
 * <p><b>Memory.</b> Each key holds at most {@code limit} instants (refused requests
 * are not recorded). Expired instants are dropped from a key whenever that key is
 * touched, and a key with none left is removed. Once per window length each
 * window also sweeps every key it holds, on the next request that touches it, so
 * a key that is never seen again is gone within two window lengths. No scheduler
 * is involved: scheduling is off in tests ({@code brand.housekeeping.enabled}), and
 * the sweep has to work there too.
 */
@Component
public class AuthRateLimiter {

    /** [D21] "Failed logins … per 15 minutes". */
    static final Duration LOGIN_WINDOW = Duration.ofMinutes(15);

    /** [D21] Sign-up and password-reset limits are per hour. */
    static final Duration HOUR_WINDOW = Duration.ofHours(1);

    /**
     * The five numbers of decision 21. {@code 0} or less switches one off.
     */
    public record Limits(int failedLoginsPerEmail,
                         int failedLoginsPerAddress,
                         int signUpsPerAddress,
                         int passwordResetsPerEmail,
                         int passwordResetsPerAddress) {
    }

    /**
     * A login that passed the limit check. Handed back to
     * {@link #loginSucceeded(LoginAttempt)} when the password was right; on a
     * failure it is simply dropped, and the slots it reserved are the failure.
     */
    public record LoginAttempt(String emailKey, String address, Instant at,
                               boolean countedEmail, boolean countedAddress) {
    }

    private final Clock clock;
    private final Limits configured;
    private volatile Limits limits;

    private final Window failedLoginsByEmail = new Window(LOGIN_WINDOW);
    private final Window failedLoginsByAddress = new Window(LOGIN_WINDOW);
    private final Window signUpsByAddress = new Window(HOUR_WINDOW);
    private final Window passwordResetsByEmail = new Window(HOUR_WINDOW);
    private final Window passwordResetsByAddress = new Window(HOUR_WINDOW);

    public AuthRateLimiter(Clock clock,
                           @Value("${brand.limits.failed-logins-per-email:10}") int failedLoginsPerEmail,
                           @Value("${brand.limits.failed-logins-per-address:100}") int failedLoginsPerAddress,
                           @Value("${brand.limits.sign-ups-per-address:300}") int signUpsPerAddress,
                           @Value("${brand.limits.password-resets-per-email:3}") int passwordResetsPerEmail,
                           @Value("${brand.limits.password-resets-per-address:30}") int passwordResetsPerAddress) {
        this.clock = clock;
        this.configured = new Limits(failedLoginsPerEmail, failedLoginsPerAddress, signUpsPerAddress,
                passwordResetsPerEmail, passwordResetsPerAddress);
        this.limits = configured;
    }

    /**
     * The email key: trimmed and lower-cased, which is how login already compares
     * it ({@code findByEmailIgnoreCase} on the trimmed value).
     */
    static String emailKey(String rawEmail) {
        return rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * [D21] Before the password is looked at. Refuses with {@code 429 rate_limited}
     * when the email's or the address's failed-login count is already at its
     * limit — even if this attempt would have been correct. Otherwise reserves one
     * failure slot on each and returns the attempt.
     */
    public synchronized LoginAttempt beginLogin(String rawEmail, String address) {
        Limits current = limits;
        Instant now = clock.instant();
        String email = emailKey(rawEmail);
        String addr = addressKey(address);
        boolean byEmail = current.failedLoginsPerEmail() > 0;
        boolean byAddress = current.failedLoginsPerAddress() > 0;
        if ((byEmail && failedLoginsByEmail.count(email, now) >= current.failedLoginsPerEmail())
                || (byAddress && failedLoginsByAddress.count(addr, now) >= current.failedLoginsPerAddress())) {
            throw rateLimited();
        }
        if (byEmail) {
            failedLoginsByEmail.record(email, now);
        }
        if (byAddress) {
            failedLoginsByAddress.record(addr, now);
        }
        return new LoginAttempt(email, addr, now, byEmail, byAddress);
    }

    /**
     * [D21] The password was right: the email's failed count is cleared, and the
     * slot this attempt reserved on the address is given back (a success is not
     * a failure). The address's earlier failures stay.
     */
    public synchronized void loginSucceeded(LoginAttempt attempt) {
        failedLoginsByEmail.clear(attempt.emailKey());
        if (attempt.countedAddress()) {
            failedLoginsByAddress.removeOne(attempt.address(), attempt.at());
        }
    }

    /**
     * [D21] Every sign-up request that reaches the service is counted per network
     * address, whatever it then answers. Refuses with {@code 429 rate_limited}
     * when the address is at its limit.
     */
    public synchronized void checkSignUp(String address) {
        Limits current = limits;
        if (current.signUpsPerAddress() <= 0) {
            return;
        }
        Instant now = clock.instant();
        String addr = addressKey(address);
        if (signUpsByAddress.count(addr, now) >= current.signUpsPerAddress()) {
            throw rateLimited();
        }
        signUpsByAddress.record(addr, now);
    }

    /**
     * [D21] Every forgot-password request is counted per network address and per
     * the email typed, whether or not an account exists — the limiter never looks
     * at the accounts, so its answer cannot depend on one. A blank email has no
     * email to count and is counted per address only. Refuses with
     * {@code 429 rate_limited} when either is at its limit; nothing is recorded
     * then.
     */
    public synchronized void checkPasswordReset(String rawEmail, String address) {
        Limits current = limits;
        Instant now = clock.instant();
        String email = emailKey(rawEmail);
        String addr = addressKey(address);
        boolean byEmail = current.passwordResetsPerEmail() > 0 && !email.isEmpty();
        boolean byAddress = current.passwordResetsPerAddress() > 0;
        if ((byEmail && passwordResetsByEmail.count(email, now) >= current.passwordResetsPerEmail())
                || (byAddress && passwordResetsByAddress.count(addr, now) >= current.passwordResetsPerAddress())) {
            throw rateLimited();
        }
        if (byEmail) {
            passwordResetsByEmail.record(email, now);
        }
        if (byAddress) {
            passwordResetsByAddress.record(addr, now);
        }
    }

    /* ------------------------------------------------- test seam (package-private) */

    /**
     * Test only. Package-private, so nothing outside {@code app.brand.auth} can
     * reach it. Replaces the limits until {@link #resetForTest()}.
     */
    synchronized void setLimitsForTest(Limits testLimits) {
        this.limits = testLimits;
    }

    /** Test only. Forgets every count and goes back to the configured limits. */
    synchronized void resetForTest() {
        this.limits = configured;
        for (Window window : windows()) {
            window.hits.clear();
            window.lastSweep = null;
        }
    }

    /** Test only. How many keys all five windows hold together. */
    synchronized int trackedKeysForTest() {
        int keys = 0;
        for (Window window : windows()) {
            keys += window.hits.size();
        }
        return keys;
    }

    /* -------------------------------------------------------------- internals */

    private Window[] windows() {
        return new Window[] {failedLoginsByEmail, failedLoginsByAddress, signUpsByAddress,
                passwordResetsByEmail, passwordResetsByAddress};
    }

    private static String addressKey(String address) {
        return address == null ? "" : address;
    }

    private static ApiException rateLimited() {
        // No email and no address in the message: it is returned to the caller.
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "too many attempts");
    }

    /**
     * One rolling window: per key, the instants of the counted requests, oldest
     * first. Only touched under the limiter's monitor.
     */
    private static final class Window {

        private final Duration length;
        private final Map<String, ArrayDeque<Instant>> hits = new HashMap<>();
        private Instant lastSweep;

        private Window(Duration length) {
            this.length = length;
        }

        /** Live entries for the key, after dropping its expired ones. */
        int count(String key, Instant now) {
            sweepIfDue(now);
            ArrayDeque<Instant> deque = hits.get(key);
            if (deque == null) {
                return 0;
            }
            Instant cutoff = now.minus(length);
            deque.removeIf(at -> !at.isAfter(cutoff));
            if (deque.isEmpty()) {
                hits.remove(key);
                return 0;
            }
            return deque.size();
        }

        void record(String key, Instant now) {
            hits.computeIfAbsent(key, ignored -> new ArrayDeque<>()).addLast(now);
        }

        void clear(String key) {
            hits.remove(key);
        }

        void removeOne(String key, Instant at) {
            ArrayDeque<Instant> deque = hits.get(key);
            if (deque == null) {
                return;
            }
            deque.removeLastOccurrence(at);
            if (deque.isEmpty()) {
                hits.remove(key);
            }
        }

        /** Once per window length, every key: drop expired instants and empty keys. */
        private void sweepIfDue(Instant now) {
            if (lastSweep != null && now.isBefore(lastSweep.plus(length))) {
                return;
            }
            lastSweep = now;
            Instant cutoff = now.minus(length);
            hits.values().removeIf(deque -> {
                deque.removeIf(at -> !at.isAfter(cutoff));
                return deque.isEmpty();
            });
        }
    }
}
