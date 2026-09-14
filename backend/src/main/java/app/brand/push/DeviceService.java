package app.brand.push;

import app.brand.common.ApiException;
import app.brand.push.PushDtos.RegisterDeviceRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code PUT|DELETE /me/devices} — where the app says "notifications for this
 * account land here" [B8].
 *
 * <p>The token is the row's identity, not the account: a phone that is signed out
 * of one account and into another keeps the same Expo token, so registering it
 * <b>re-binds</b> it to the caller. Refusing, or keeping both rows, would send one
 * person's inbox notification to the phone somebody else is now holding.
 *
 * <p>{@code DELETE} is the app's sign-out call and deletes only the caller's own
 * row for that token. A token that belongs to somebody else answers 204 all the
 * same: there is nothing here worth telling a prober, and a device that is not
 * registered to you is already in the state the call asked for.
 */
@Service
public class DeviceService {

    private final DeviceRepository devices;
    private final Clock clock;

    public DeviceService(DeviceRepository devices, Clock clock) {
        this.devices = devices;
        this.clock = clock;
    }

    @Transactional
    public void register(UUID userId, RegisterDeviceRequest request) {
        RegisterDeviceRequest body = request == null
                ? new RegisterDeviceRequest(null, null, null) : request;
        String token = requireToken(body.token());
        String platform = requirePlatform(body.platform());
        String locale = requireLocale(body.locale());

        devices.upsert(userId, token, platform, locale, Instant.now(clock));
    }

    @Transactional
    public void unregister(UUID userId, String rawToken) {
        String token = rawToken == null ? "" : rawToken.trim();
        if (!token.isEmpty()) {
            devices.deleteByUserIdAndPushToken(userId, token);
        }
    }

    /* ------------------------------------------------------------ validation */

    private static String requireToken(String raw) {
        String token = raw == null ? "" : raw.trim();
        if (token.isEmpty() || token.length() > Device.TOKEN_MAX) {
            throw ApiException.validation("push token required", "token");
        }
        return token;
    }

    private static String requirePlatform(String raw) {
        String platform = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (!Device.PLATFORMS.contains(platform)) {
            throw ApiException.validation("unknown platform", "platform");
        }
        return platform;
    }

    /**
     * The app sends its own i18n language, so this is {@code en} or {@code tr}. A
     * regional tag ({@code tr-TR}) is narrowed to its language; a missing one is
     * English, which is the product's default (CLAUDE.md §1).
     */
    private static String requireLocale(String raw) {
        String locale = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (locale.isEmpty()) {
            return Device.LOCALE_EN;
        }
        int separator = locale.indexOf('-');
        if (separator > 0) {
            locale = locale.substring(0, separator);
        }
        if (!Device.LOCALES.contains(locale)) {
            throw ApiException.validation("unsupported locale", "locale");
        }
        return locale;
    }
}
