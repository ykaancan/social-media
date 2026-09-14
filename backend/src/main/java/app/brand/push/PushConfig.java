package app.brand.push;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Which transport the outbox drains into [B8].
 *
 * <p>{@code brand.push.enabled} is the whole switch, and it is off by default:
 * a fresh clone, the test suite and the founder's laptop all write and drain the
 * outbox without an Expo credential and without reaching the network. Setting it
 * to true — with an Expo access token in the environment — is the only difference
 * between "nothing buzzes" and "phones buzz".
 *
 * <p>Exactly one of the two is defined, decided by the flag alone. A test that
 * wants to watch what would have been sent declares its own {@code @Primary}
 * {@link PushSender}, the same way it replaces the clock.
 */
@Configuration
public class PushConfig {

    /** [B8] The real thing: Expo delivers to FCM and APNs with one credential. */
    @Bean
    @ConditionalOnProperty(name = "brand.push.enabled", havingValue = "true")
    public PushSender expoPushSender(RestClient.Builder builder, PushProperties properties) {
        return new ExpoPushSender(builder, properties);
    }

    /** The default. Everything but the HTTP call still happens. */
    @Bean
    @ConditionalOnProperty(name = "brand.push.enabled", havingValue = "false", matchIfMissing = true)
    public PushSender loggingPushSender() {
        return new LoggingPushSender();
    }
}
