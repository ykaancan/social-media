package app.brand.organisation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * [D14]/[D19] A person's role inside one organisation. {@code ADMIN} approves and
 * rejects that organisation's members and nothing else; it is not a platform
 * role and never reaches reports, identity views, ban or promote.
 */
public enum MembershipRole {
    MEMBER,
    ADMIN;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static MembershipRole of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
