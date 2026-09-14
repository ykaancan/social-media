package app.brand.thread;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * [B7] Purging {@code request_key}.
 *
 * <p>A key exists so a phone that lost an answer can ask again. Seven days later
 * nothing is retrying: the rows are only a growing table and a record of when
 * someone wrote something, which is not worth keeping.
 *
 * <p>Hourly, on the same {@code brand.housekeeping} switch as the board's pass —
 * and, like it, the bean exists whatever the switch says so a test can call
 * {@link #run()} at the instant it chooses instead of racing a timer.
 */
@Component
public class ThreadHousekeeping {

    private static final Logger log = LoggerFactory.getLogger(ThreadHousekeeping.class);

    /** [B7] "Keys older than 7 days are purged by the housekeeping job." */
    static final Duration KEEP = Duration.ofDays(7);

    private final RequestKeyRepository requestKeys;
    private final Clock clock;

    public ThreadHousekeeping(RequestKeyRepository requestKeys, Clock clock) {
        this.requestKeys = requestKeys;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${brand.housekeeping.request-key-interval:3600000}")
    @Transactional
    public void run() {
        try {
            Instant cutoff = Instant.now(clock).minus(KEEP);
            int purged = requestKeys.purgeOlderThan(cutoff);
            if (purged > 0) {
                log.debug("purged {} request keys older than {}", purged, cutoff);
            }
        } catch (RuntimeException failed) {
            // A failed pass must not kill the scheduler; the next one purges the same rows.
            log.warn("request key purge failed", failed);
        }
    }
}
