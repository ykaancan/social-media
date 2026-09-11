package app.brand.safety;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * A report, whatever was reported. One table for all three targets (CLAUDE.md
 * §4.9, §5): an inbox message, a board post or a whole thread.
 *
 * <p>The row is deliberately dumb — {@code target_kind} plus {@code target_id},
 * no foreign key. Two reasons: the admin queue reads one table, and a report
 * <b>survives the recipient soft-deleting the message</b> [D12]. Only real
 * account deletion (KVKK) removes it.
 *
 * <p>Nothing here carries the sender's identity. The reported content's
 * {@code sender_id} lives on the content row, and only {@code super_admin} ever
 * sees it, through an endpoint that writes an {@code audit_log} row first.
 */
@Entity
@Table(name = "report")
public class Report {

    /** {@code target_kind} values, matching the CHECK constraint on the column. */
    public static final String INBOX_MESSAGE = "inbox_message";
    public static final String BOARD_POST = "board_post";
    public static final String THREAD = "thread";

    /** {@code ReportReason} in {@code app/src/api/messages.ts}; the CHECK is the same five. */
    public static final Set<String> REASONS =
            Set.of("harassment", "hate", "sexual", "identity", "spam");

    public static final String OPEN = "open";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reporter_id", nullable = false, updatable = false)
    private UUID reporterId;

    @Column(name = "target_kind", nullable = false, updatable = false)
    private String targetKind;

    @Column(name = "target_id", nullable = false, updatable = false)
    private UUID targetId;

    @Column(name = "reason", nullable = false)
    private String reason;

    /** {@code open | dismissed | hidden | warned | banned}; the admin queue moves it (B-5). */
    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Report() {
    }

    public static Report of(UUID reporterId, String targetKind, UUID targetId, String reason, Instant now) {
        Report report = new Report();
        report.reporterId = reporterId;
        report.targetKind = targetKind;
        report.targetId = targetId;
        report.reason = reason;
        report.status = OPEN;
        report.createdAt = now;
        return report;
    }

    public UUID getId() {
        return id;
    }

    public UUID getReporterId() {
        return reporterId;
    }

    public String getTargetKind() {
        return targetKind;
    }

    public UUID getTargetId() {
        return targetId;
    }

    public String getReason() {
        return reason;
    }

    public String getStatus() {
        return status;
    }

    public UUID getResolvedBy() {
        return resolvedBy;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
