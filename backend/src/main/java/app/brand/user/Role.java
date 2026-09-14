package app.brand.user;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * The two roles stored on an account. {@code event_moderator} is never stored
 * here: it is {@code event_member.is_moderator}, per event.
 *
 * <p>The role is data, never a hardcoded user id, so a second super_admin is a row
 * change and not a deploy.
 */
public enum Role {
    MEMBER,
    SUPER_ADMIN;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static Role of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /** Spring Security authority for this role. */
    public String authority() {
        return "ROLE_" + name();
    }
}
