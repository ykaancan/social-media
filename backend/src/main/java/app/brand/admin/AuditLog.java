package app.brand.admin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One admin action, written before the response is built. Brief §4.9 and §5: every
 * approval, rejection, ban, promotion and (from step B-5) every identity view
 * leaves a row here.
 *
 * <p>{@code actorId} is null for an action the server took by itself — the
 * bootstrap promotion [B11] is the only such action in stage 1.
 */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "action", nullable = false, updatable = false)
    private String action;

    @Column(name = "subject_user_id")
    private UUID subjectUserId;

    @Column(name = "subject_kind")
    private String subjectKind;

    @Column(name = "subject_id")
    private UUID subjectId;

    /** Free-form context; jsonb so a later query can filter on it. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details")
    private String details;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditLog() {
    }

    /** An action taken on an account. {@code actorId} null means the server itself. */
    public static AuditLog aboutUser(UUID actorId,
                                     AuditAction action,
                                     UUID subjectUserId,
                                     String details,
                                     Instant now) {
        AuditLog row = new AuditLog();
        row.actorId = actorId;
        row.action = action.value();
        row.subjectUserId = subjectUserId;
        row.subjectKind = "user";
        row.subjectId = subjectUserId;
        row.details = details;
        row.createdAt = now;
        return row;
    }

    public UUID getId() {
        return id;
    }

    public UUID getActorId() {
        return actorId;
    }

    public String getAction() {
        return action;
    }

    public UUID getSubjectUserId() {
        return subjectUserId;
    }

    public String getSubjectKind() {
        return subjectKind;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public String getDetails() {
        return details;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
