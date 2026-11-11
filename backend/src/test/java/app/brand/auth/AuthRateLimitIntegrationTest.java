package app.brand.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.auth.AuthRateLimiter.Limits;
import app.brand.support.AbstractIntegrationTest;
import app.brand.support.MutableClock;
import app.brand.support.RecordingResetLinkSender;
import app.brand.user.AppUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * [D21] Rate limits on login, sign-up and password reset (DECISIONS.md §21).
 *
 * <p>The suite runs with every one of these limits off ({@code application-test.yml}),
 * because it shares one context and one loopback address. Each test here switches
 * on the limits it needs through {@link AuthRateLimiter}'s package-private test
 * seam, and every test starts and ends with the counts forgotten and the
 * configured (off) limits back. Each test also comes from its own network address,
 * so nothing it counts could reach another test even without the reset.
 */
class AuthRateLimitIntegrationTest extends AbstractIntegrationTest {

    /** Decision 21's numbers, for the tests that use them as they ship. */
    private static final Limits SHIPPED = new Limits(10, 100, 300, 3, 30);

    private static final String PASSWORD = "correct horse";

    @Autowired
    private AuthRateLimiter limiter;

    @Autowired
    private MutableClock clock;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private RecordingResetLinkSender resetLinks;

    private Instant base;

    private String address;

    @BeforeEach
    void start() {
        limiter.resetForTest();
        resetLinks.clear();
        base = Instant.parse("2026-11-11T20:00:00Z");
        clock.freezeAt(base);
        address = "10.21." + (int) (Math.random() * 250) + "." + (int) (Math.random() * 250 + 1);
    }

    @AfterEach
    void finish() {
        limiter.resetForTest();
        clock.reset();
    }

    /* ------------------------------------------------------------- login */

    @Test
    @DisplayName("the 11th failed login for one email in 15 minutes is 429, the right password too, and after the window it works")
    void failedLoginsPerEmail() throws Exception {
        String email = registered();
        limiter.setLimitsForTest(SHIPPED);

        for (int i = 1; i <= 10; i++) {
            login(email, "wrong " + i).andExpect(status().isUnauthorized());
        }
        login(email, "wrong 11")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        // Refused before the password is looked at, even when it is the right one.
        login(email, PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        // Case and spaces do not make a new key: login compares the same way.
        login("  " + email.toUpperCase(java.util.Locale.ROOT) + " ", PASSWORD)
                .andExpect(status().isTooManyRequests());

        // Rolling: 15 minutes after the failures they no longer count.
        clock.freezeAt(base.plus(Duration.ofMinutes(15)).plusSeconds(1));
        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    @DisplayName("failed logins for an unknown email count and answer exactly as for a known one")
    void unknownEmailCountsTheSame() throws Exception {
        String known = registered();
        String unknown = uniqueEmail();
        limiter.setLimitsForTest(SHIPPED);

        List<String> knownBodies = new ArrayList<>();
        List<String> unknownBodies = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            knownBodies.add(login(known, "wrong").andExpect(status().isUnauthorized())
                    .andReturn().getResponse().getContentAsString());
            unknownBodies.add(login(unknown, "wrong").andExpect(status().isUnauthorized())
                    .andReturn().getResponse().getContentAsString());
        }
        assertThat(unknownBodies).isEqualTo(knownBodies);

        String knownRefused = login(known, "wrong").andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getContentAsString();
        String unknownRefused = login(unknown, "wrong").andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getContentAsString();
        assertThat(unknownRefused).isEqualTo(knownRefused);
    }

    @Test
    @DisplayName("a successful login clears the email's failed count")
    void successClearsTheEmailCount() throws Exception {
        String email = registered();
        limiter.setLimitsForTest(SHIPPED);

        for (int i = 1; i <= 9; i++) {
            login(email, "wrong").andExpect(status().isUnauthorized());
        }
        login(email, PASSWORD).andExpect(status().isOk());

        // A fresh allowance of ten: the nine before the success are gone.
        for (int i = 1; i <= 10; i++) {
            login(email, "wrong").andExpect(status().isUnauthorized());
        }
        login(email, "wrong").andExpect(status().isTooManyRequests());
    }

    @Test
    @DisplayName("failed logins across many emails from one address hit the per-address limit")
    void failedLoginsPerAddress() throws Exception {
        String email = registered();
        limiter.setLimitsForTest(new Limits(10, 5, 0, 0, 0));

        for (int i = 1; i <= 5; i++) {
            login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
        }
        // A sixth email, never seen before, is refused: the address is at its limit.
        login(uniqueEmail(), "wrong")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        // So is the right password for a real account, from that address.
        login(email, PASSWORD).andExpect(status().isTooManyRequests());
        // Another address is untouched.
        login(email, PASSWORD, "10.99.0.1").andExpect(status().isOk());

        // A success does not clear the address's count.
        clock.freezeAt(base.plus(Duration.ofMinutes(15)).plusSeconds(1));
        login(email, PASSWORD).andExpect(status().isOk());
        for (int i = 1; i <= 5; i++) {
            login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
        }
        login(email, PASSWORD).andExpect(status().isTooManyRequests());
    }

    /* ----------------------------------------------------------- sign-up */

    @Test
    @DisplayName("the sign-up past the per-address limit is 429 and creates no account; 409 and 422 count too")
    void signUpsPerAddress() throws Exception {
        String existing = registered();
        limiter.setLimitsForTest(new Limits(0, 0, 3, 0, 0));

        register(uniqueEmail(), PASSWORD).andExpect(status().isCreated());
        // A refused sign-up still reached the service and still counts.
        register(existing, PASSWORD).andExpect(status().isConflict());
        register(uniqueEmail(), PASSWORD).andExpect(status().isCreated());

        String refused = uniqueEmail();
        register(refused, PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        assertThat(users.findByEmailIgnoreCase(refused)).isEmpty();

        // Another address is untouched; an hour later this one is too.
        register(uniqueEmail(), PASSWORD, "10.99.0.2").andExpect(status().isCreated());
        clock.freezeAt(base.plus(Duration.ofHours(1)).plusSeconds(1));
        register(refused, PASSWORD).andExpect(status().isCreated());
    }

    /* ---------------------------------------------------- password reset */

    @Test
    @DisplayName("the 4th password reset for one email in an hour is 429 and sends no mail; an address with no account is limited identically")
    void passwordResetsPerEmail() throws Exception {
        String known = registered();
        String unknown = uniqueEmail();
        limiter.setLimitsForTest(SHIPPED);

        for (int i = 1; i <= 3; i++) {
            forgot(known).andExpect(status().isAccepted());
            forgot(unknown).andExpect(status().isAccepted());
        }
        assertThat(resetLinks.sent()).hasSize(3);

        String knownRefused = forgot(known)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"))
                .andReturn().getResponse().getContentAsString();
        String unknownRefused = forgot(unknown)
                .andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getContentAsString();
        assertThat(unknownRefused).isEqualTo(knownRefused);
        // Nothing went out for the refused request.
        assertThat(resetLinks.sent()).hasSize(3);

        // The email typed, normalised: a different case is the same key.
        forgot(known.toUpperCase(java.util.Locale.ROOT)).andExpect(status().isTooManyRequests());

        clock.freezeAt(base.plus(Duration.ofHours(1)).plusSeconds(1));
        forgot(known).andExpect(status().isAccepted());
        assertThat(resetLinks.sent()).hasSize(4);
    }

    @Test
    @DisplayName("password resets from one address hit the per-address limit, across emails")
    void passwordResetsPerAddress() throws Exception {
        limiter.setLimitsForTest(new Limits(0, 0, 0, 3, 4));

        for (int i = 1; i <= 4; i++) {
            forgot(uniqueEmail()).andExpect(status().isAccepted());
        }
        forgot(uniqueEmail())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        forgot(uniqueEmail(), "10.99.0.3").andExpect(status().isAccepted());
    }

    /* ----------------------------------------------------------- off switch */

    @Test
    @DisplayName("a limit set to 0 is off")
    void zeroIsOff() throws Exception {
        String email = registered();
        // Only the per-email login limit is on; every other one is 0.
        limiter.setLimitsForTest(new Limits(2, 0, 0, 0, 0));

        for (int i = 1; i <= 20; i++) {
            register(uniqueEmail(), PASSWORD).andExpect(status().isCreated());
            forgot(email).andExpect(status().isAccepted());
            login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
        }
        // The one limit that is on still works.
        login(email, "wrong").andExpect(status().isUnauthorized());
        login(email, "wrong").andExpect(status().isUnauthorized());
        login(email, "wrong").andExpect(status().isTooManyRequests());

        // An off limit is not counted either: with every limit at 0, requests on all
        // three routes leave nothing in memory.
        limiter.resetForTest();
        limiter.setLimitsForTest(new Limits(0, 0, 0, 0, 0));
        login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
        register(uniqueEmail(), PASSWORD).andExpect(status().isCreated());
        forgot(email).andExpect(status().isAccepted());
        assertThat(limiter.trackedKeysForTest()).isZero();
    }

    /* ---------------------------------------------------------- concurrency */

    @Test
    @DisplayName("parallel failed logins at the boundary never let more than the limit be evaluated")
    void concurrentFailuresStopAtTheLimit() throws Exception {
        String email = registered();
        int limit = 5;
        int parallel = 24;
        limiter.setLimitsForTest(new Limits(limit, 0, 0, 0, 0));

        ExecutorService pool = Executors.newFixedThreadPool(parallel);
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < parallel; i++) {
                results.add(pool.submit(() -> {
                    go.await();
                    return login(email, "wrong").andReturn().getResponse().getStatus();
                }));
            }
            go.countDown();
            int unauthorized = 0;
            int limited = 0;
            for (Future<Integer> result : results) {
                int code = result.get(60, TimeUnit.SECONDS);
                if (code == 401) {
                    unauthorized++;
                } else if (code == 429) {
                    limited++;
                }
            }
            // A 401 is an evaluated attempt; exactly the limit got that far.
            assertThat(unauthorized).isEqualTo(limit);
            assertThat(limited).isEqualTo(parallel - limit);
        } finally {
            pool.shutdownNow();
        }
    }

    /* --------------------------------------------------------------- memory */

    @Test
    @DisplayName("expired entries are dropped, so the map does not grow without bound")
    void expiredEntriesAreDropped() throws Exception {
        limiter.setLimitsForTest(new Limits(10, 1000, 1000, 3, 1000));

        for (int i = 0; i < 40; i++) {
            login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
            forgot(uniqueEmail()).andExpect(status().isAccepted());
        }
        // 40 login emails + 1 address, 40 reset emails + 1 address.
        assertThat(limiter.trackedKeysForTest()).isEqualTo(82);

        // Past both windows, one request on each route sweeps everything expired:
        // what is left is only what that request itself counted.
        clock.freezeAt(base.plus(Duration.ofHours(1)).plusSeconds(1));
        login(uniqueEmail(), "wrong").andExpect(status().isUnauthorized());
        forgot(uniqueEmail()).andExpect(status().isAccepted());
        assertThat(limiter.trackedKeysForTest()).isEqualTo(4);
    }

    /* -------------------------------------------------------------- helpers */

    /** An account made while every limit is still off, so it costs no allowance. */
    private String registered() throws Exception {
        String email = uniqueEmail();
        register(email, PASSWORD).andExpect(status().isCreated());
        return email;
    }

    private ResultActions login(String email, String password) throws Exception {
        return login(email, password, address);
    }

    private ResultActions login(String email, String password, String from) throws Exception {
        return mockMvc.perform(post("/auth/login")
                .with(remoteAddress(from))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private ResultActions register(String email, String password) throws Exception {
        return register(email, password, address);
    }

    private ResultActions register(String email, String password, String from) throws Exception {
        return mockMvc.perform(post("/auth/register")
                .with(remoteAddress(from))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private ResultActions forgot(String email) throws Exception {
        return forgot(email, address);
    }

    private ResultActions forgot(String email, String from) throws Exception {
        return mockMvc.perform(post("/auth/forgot-password")
                .with(remoteAddress(from))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))));
    }

    /** What {@code getRemoteAddr()} answers for this request. */
    private static RequestPostProcessor remoteAddress(String from) {
        return request -> {
            request.setRemoteAddr(from);
            return request;
        };
    }

    private static String uniqueEmail() {
        return "limit-" + UUID.randomUUID() + "@example.com";
    }
}
