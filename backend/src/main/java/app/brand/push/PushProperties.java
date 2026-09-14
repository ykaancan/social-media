package app.brand.push;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * [B8] Everything about push that is not code, bound from {@code brand.push.*}.
 *
 * <p>It is its own record rather than another component of
 * {@code config/BrandProperties}: push is the one subsystem that talks to a third
 * party, and the day it is swapped for direct FCM/APNs senders the whole block
 * moves with the package.
 *
 * <p>{@code enabled} is <b>off by default</b>. Off means the outbox is still
 * written and still drained — the copy, the locale and the payload are exercised
 * exactly as in production — but the drain hands each row to
 * {@link LoggingPushSender} instead of Expo. Nothing about the product changes the
 * day it is switched on except that a phone buzzes.
 *
 * @param enabled         false → {@link LoggingPushSender}; true → {@link ExpoPushSender}.
 * @param expoAccessToken optional Expo access token; sent as a bearer when set.
 * @param interval        how often {@link PushHousekeeping} drains the outbox.
 * @param batchSize       outbox rows per pass, and the cap Expo puts on one request.
 */
@ConfigurationProperties(prefix = "brand.push")
public record PushProperties(boolean enabled,
                             String expoAccessToken,
                             Duration interval,
                             int batchSize) {

    /** Expo refuses more than 100 messages in one request. */
    public static final int EXPO_MAX_BATCH = 100;

    public PushProperties {
        expoAccessToken = expoAccessToken == null ? "" : expoAccessToken.trim();
        interval = interval == null ? Duration.ofSeconds(5) : interval;
        batchSize = batchSize <= 0 ? EXPO_MAX_BATCH : Math.min(batchSize, EXPO_MAX_BATCH);
    }

    public boolean hasAccessToken() {
        return !expoAccessToken.isEmpty();
    }
}
