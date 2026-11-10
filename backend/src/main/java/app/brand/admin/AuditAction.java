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
    PROMOTE_ADMIN,
    /** [D13] A super admin created an organisation. */
    CREATE_ORGANISATION,
    /** [D13] A super admin changed an organisation's name or switches. */
    UPDATE_ORGANISATION,
    /** [D14] A super admin made an account an admin of an organisation. */
    ASSIGN_ORGANISATION_ADMIN,
    /** [D14] A super admin set an organisation admin back to member. */
    REMOVE_ORGANISATION_ADMIN,
    /** [D14] An organisation admin (or a super admin) approved a pending membership. */
    APPROVE_MEMBER,
    /** [D14] An organisation admin (or a super admin) rejected a pending membership. */
    REJECT_MEMBER;

    /** The stored value, matching the CHECK constraint in V4__organisations.sql. */
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
