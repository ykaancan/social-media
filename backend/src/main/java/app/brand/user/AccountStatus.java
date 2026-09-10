package app.brand.user;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * Where an account sits in the approval flow. Wire values are lowercase and match
 * {@code AccountStatus} in {@code app/src/api/types.ts}.
 *
 * <p>[D7] {@code PENDING} means the account cannot use the app yet — there is no
 * approved-but-read-only state.
 */
public enum AccountStatus {
    INCOMPLETE,
    PENDING,
    APPROVED,
    REJECTED,
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
