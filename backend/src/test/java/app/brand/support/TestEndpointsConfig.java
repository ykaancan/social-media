package app.brand.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Test-only beans.
 *
 * <p>{@link PingController} is not declared here: it is an ordinary
 * {@code @RestController} in the test source set and the application's own
 * component scan finds it. Declaring it as a bean too would map the same path
 * twice.
 */
@TestConfiguration
public class TestEndpointsConfig {

    /**
     * Captures the reset link instead of mailing or logging it, so the reset flow
     * can be driven end to end without a live token reaching a log file.
     */
    @Bean
    @Primary
    public RecordingResetLinkSender recordingResetLinkSender() {
        return new RecordingResetLinkSender();
    }
}
