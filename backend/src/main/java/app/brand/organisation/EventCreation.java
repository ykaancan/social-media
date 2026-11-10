package app.brand.organisation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * [D16] Who may create an event in an organisation: its admins only, or any
 * approved member. Stored in {@code organisation.event_creation}.
 */
public enum EventCreation {
    ADMINS,
    MEMBERS;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static EventCreation of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
