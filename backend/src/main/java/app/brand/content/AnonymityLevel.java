package app.brand.content;

import app.brand.common.ApiException;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * The level a single piece of content was sent at — chosen per action by the
 * sender, never by the account (brief §3). Wire values are lowercase and match
 * {@code MessageLevel} in {@code app/src/api/messages.ts}.
 *
 * <p>[B4] This is a display rule only. The server always knows the sender; no
 * member DTO ever carries {@code sender_id}.
 */
public enum AnonymityLevel {
    ANONYMOUS,
    HINT,
    NAMED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static AnonymityLevel of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /**
     * Parse a level that arrived from a client. Anything outside the three is a
     * 422 on {@code anonymityLevel}, exactly as the mock rejects it — never a 500
     * and never a silent fallback to {@code anonymous}.
     */
    public static AnonymityLevel ofWire(String raw) {
        if (raw != null) {
            for (AnonymityLevel level : values()) {
                if (level.value().equals(raw)) {
                    return level;
                }
            }
        }
        throw ApiException.validation("invalid anonymity level", "anonymityLevel");
    }
}
