package app.brand.organisation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * [D14] Where a person stands in one organisation. Wire and stored values are
 * lowercase and match {@code MembershipStatus} in {@code app/src/api/tenant.ts}
 * and the {@code organisation_member.status} CHECK in {@code V4__organisations.sql}.
 * {@code PENDING} and {@code REJECTED} only occur where the organisation has
 * approval on.
 */
public enum MembershipStatus {
    PENDING,
    APPROVED,
    REJECTED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static MembershipStatus of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
