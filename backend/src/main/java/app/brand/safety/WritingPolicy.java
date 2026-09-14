package app.brand.safety;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * "Who can write to me" (brief §4.8). Wire values are lowercase and match
 * {@code WallSnapshot['writingPolicy']} in {@code app/src/api/messages.ts}.
 *
 * <p>This is a delivery rule the sender is told about (403), unlike muted words
 * [D10], which are invisible to them.
 */
public enum WritingPolicy {
    ANYONE,
    NAMED_ONLY,
    NOBODY;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static WritingPolicy of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /** An unreadable or missing value is the default; it must never fail a read. */
    public static WritingPolicy orDefault(String raw) {
        if (raw == null) {
            return ANYONE;
        }
        for (WritingPolicy policy : values()) {
            if (policy.value().equals(raw)) {
                return policy;
            }
        }
        return ANYONE;
    }
}
