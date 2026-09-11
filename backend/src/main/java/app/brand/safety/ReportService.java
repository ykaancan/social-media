package app.brand.safety;

import app.brand.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Filing a report, for every kind of content there is. B-2 reports inbox
 * messages, B-3 board posts and B-4 threads through this one method, so the
 * duplicate rule and the reason list cannot drift apart between them.
 *
 * <p>Two rules that are the product's, not the database's:
 *
 * <ul>
 *   <li>A second report of the same thing by the same person is a <b>no-op, not
 *       an error</b>. Someone who taps Report twice, or reports a message they
 *       already reported from another screen, has done nothing wrong and must not
 *       be shown a failure.</li>
 *   <li>Nothing here answers with an identity. The report carries the content's
 *       id; who sent it is read later by a {@code super_admin}, through an
 *       endpoint that writes an {@code audit_log} row first (CLAUDE.md §5).</li>
 * </ul>
 */
@Service
public class ReportService {

    private final ReportRepository reports;
    private final Clock clock;

    public ReportService(ReportRepository reports, Clock clock) {
        this.reports = reports;
        this.clock = clock;
    }

    /**
     * @param targetKind one of {@link Report#INBOX_MESSAGE}, {@link Report#BOARD_POST},
     *                   {@link Report#THREAD}
     * @param rawReason  as the client sent it; anything outside the five is 422 on
     *                   {@code reason}
     * @return the report row — the one just written, or the one that was already there
     */
    @Transactional
    public Report file(UUID reporterId, String targetKind, UUID targetId, String rawReason) {
        if (reporterId == null || targetId == null) {
            throw ApiException.notFound("nothing to report");
        }
        String reason = rawReason == null ? null : rawReason.trim().toLowerCase(Locale.ROOT);
        if (reason == null || !Report.REASONS.contains(reason)) {
            throw ApiException.validation("invalid reason", "reason");
        }
        return reports.findByReporterIdAndTargetKindAndTargetId(reporterId, targetKind, targetId)
                .orElseGet(() -> insert(reporterId, targetKind, targetId, reason));
    }

    /**
     * The unique index is the real guard: two taps that race past the read above
     * must still leave one row and one 204, never a 500.
     */
    private Report insert(UUID reporterId, String targetKind, UUID targetId, String reason) {
        try {
            return reports.saveAndFlush(
                    Report.of(reporterId, targetKind, targetId, reason, Instant.now(clock)));
        } catch (DataIntegrityViolationException raced) {
            return reports.findByReporterIdAndTargetKindAndTargetId(reporterId, targetKind, targetId)
                    .orElseThrow(() -> raced);
        }
    }
}
