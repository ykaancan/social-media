package app.brand.board;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns {@code @Scheduled} on for the application [B5].
 *
 * <p>It is its own class, and conditional, for one reason: the integration suite
 * runs against a real Postgres and drives {@link BoardHousekeeping#run()} at the
 * instant it chooses. A background timer firing the same transitions in the middle
 * of an assertion would make "the undo window expired" a race rather than a fact,
 * so {@code brand.housekeeping.enabled: false} in {@code application-test.yml}
 * leaves the annotation unprocessed and the bean callable.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "brand.housekeeping.enabled", havingValue = "true", matchIfMissing = true)
public class BoardSchedulingConfig {
}
