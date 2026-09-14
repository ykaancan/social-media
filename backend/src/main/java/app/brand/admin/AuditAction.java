package app.brand.admin;

import java.util.Locale;

/**
 * The actions the {@code audit_log} CHECK constraint allows. Stage 1 writes the
 * four account actions and the promotion; {@code identity_view}, {@code warn_user}
 * and {@code hide_content} belong to the reports queue (step B-5) and are listed
 * here so that step adds rows, not migrations.
 */
public enum AuditAction {
    IDENTITY_VIEW,
    APPROVE_USER,
    REJECT_USER,
    BAN_USER,
    WARN_USER,
    HIDE_CONTENT,
    PROMOTE_ADMIN;

    /** The stored value, matching the CHECK constraint in V1__schema.sql. */
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
