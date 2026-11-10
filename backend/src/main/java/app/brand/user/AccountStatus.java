package app.brand.user;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * Where an account sits. Wire values are lowercase and match {@code AccountStatus}
 * in {@code app/src/api/tenant.ts}.
 *
 * <p>[D14] Approval is no longer an account state: it belongs to the membership
 * of an organisation. The account only knows whether its profile has been sent
 * ({@code INCOMPLETE} → {@code ACTIVE}) and whether a super admin banned it
 * ({@code BANNED}, platform-wide [D19]).
 */
public enum AccountStatus {
    /** Registered, profile not sent yet. */
    INCOMPLETE,
    /** Profile sent. Which organisations it can enter is decided per membership. */
    ACTIVE,
    /** Set by a super admin only. */
    BANNED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static AccountStatus of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
