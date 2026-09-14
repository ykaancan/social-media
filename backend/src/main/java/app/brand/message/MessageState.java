package app.brand.message;

import app.brand.common.ApiException;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * [D12] Where a message sits in the recipient's inbox. Wire values are lowercase
 * and match {@code MessageState} in {@code app/src/api/messages.ts}.
 *
 * <p>All three move freely in both directions, and the wall is exactly
 * {@link #APPROVED}. "On wall" is a view of the private inbox, not a second
 * surface: taking a card back off the wall is {@code approved -> private} and
 * nothing else happens.
 */
public enum MessageState {
    NEW,
    PRIVATE,
    APPROVED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static MessageState of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /** A state that arrived from a client. Anything outside the three is 422 on {@code state}. */
    public static MessageState ofWire(String raw) {
        if (raw != null) {
            for (MessageState state : values()) {
                if (state.value().equals(raw)) {
                    return state;
                }
            }
        }
        throw ApiException.validation("invalid state", "state");
    }
}
