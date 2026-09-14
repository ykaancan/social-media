package app.brand.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * The application clock, with a brake.
 *
 * <p>[B5] Event status is derived from {@code now}, and {@code now} comes from
 * this bean in Java and is bound into every event query as a parameter, so a test
 * can stand exactly on a boundary — {@code now == startsAt}, {@code now == endsAt}
 * — instead of creating rows a second either side of real time and hoping.
 *
 * <p>Unfrozen it is an ordinary system UTC clock, which is what every test that
 * does not care about time gets. A test that freezes it must reset it, because
 * the Spring context is shared across the suite.
 */
public class MutableClock extends Clock {

    private volatile Instant fixed;

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        Instant frozen = fixed;
        return frozen != null ? frozen : Instant.now();
    }

    public void freezeAt(Instant instant) {
        this.fixed = instant;
    }

    /** Back to real time. Call it in {@code @AfterEach}, always. */
    public void reset() {
        this.fixed = null;
    }
}
