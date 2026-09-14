package app.brand.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * One push destination: an Expo push token this account's app installed on one
 * phone [B8].
 *
 * <p>The token, not the account, is the identity of the row — that is what the
 * unique index on {@code push_token} says. A phone handed to somebody else keeps
 * its token and signs in as them, so registering a token that already exists
 * <b>re-binds it</b> to the caller rather than failing: the alternative is a
 * notification about one person's inbox arriving on another person's phone.
 *
 * <p>Nothing here is ever shown to anyone. It exists so the outbox knows where to
 * deliver and which of the two languages to write in.
 */
@Entity
@Table(name = "device")
public class Device {

    /** The CHECK on {@code device.platform}. */
    public static final Set<String> PLATFORMS = Set.of("ios", "android", "web");

    /** The product has two languages; a device that asks for anything else gets English. */
    public static final String LOCALE_EN = "en";
    public static final String LOCALE_TR = "tr";
    public static final Set<String> LOCALES = Set.of(LOCALE_EN, LOCALE_TR);

    /** Expo tokens are ~40 characters; the column is text and this is only a sanity bound. */
    public static final int TOKEN_MAX = 512;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "push_token", nullable = false, updatable = false)
    private String pushToken;

    @Column(name = "platform", nullable = false)
    private String platform;

    @Column(name = "locale", nullable = false)
    private String locale;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected Device() {
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPushToken() {
        return pushToken;
    }

    public String getPlatform() {
        return platform;
    }

    public String getLocale() {
        return locale;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }
}
