package app.brand.admin;

import app.brand.content.MessageSenderDto;
import java.time.Instant;
import java.util.List;

/**
 * The reports queue's wire shapes (brief §4.9, §5).
 *
 * <p>The whole file turns on one split, and it is the product's central promise:
 *
 * <ul>
 *   <li>A <b>list</b> row carries {@code senderDisplay} — the sender exactly as the
 *       members involved see them, a {@link MessageSenderDto} and nothing more. An
 *       admin can read and triage the entire queue without deanonymising anybody.</li>
 *   <li>A <b>detail</b> adds {@link SenderIdentityDto}, and that read is written to
 *       the {@code audit_log} before the response is built. It is the only place in
 *       the product where the person behind anonymous content is named.</li>
 * </ul>
 *
 * <p>{@code reporter} is named in both: they are not anonymous — they chose to
 * file — and the admin has to be able to see somebody reporting everything.
 */
public final class AdminReportDtos {

    private AdminReportDtos() {
    }

    /** Who filed it. */
    public record ReporterDto(String id, String name) {
    }

    /**
     * What was reported, whichever kind it is.
     *
     * <p>{@code eventName} is absent when the content was not written at an event,
     * and {@code messages} is present only on a thread's detail — the last bubbles,
     * which is the only way a report about a conversation can be judged at all.
     */
    public record ReportContentDto(
            String kind,
            String text,
            Instant createdAt,
            String eventName,
            List<ThreadBubbleDto> messages) {

        public static ReportContentDto of(String kind, String text, Instant createdAt, String eventName) {
            return new ReportContentDto(kind, text, createdAt, eventName, null);
        }

        public ReportContentDto withMessages(List<ThreadBubbleDto> messages) {
            return new ReportContentDto(kind, text, createdAt, eventName, messages);
        }
    }

    /**
     * One bubble of a reported thread. {@code mine} is from <em>the reporter's</em>
     * side, so the admin reads the conversation the way the person who complained
     * read it; the sender of each bubble is still only a {@link MessageSenderDto},
     * at the level that bubble was sent at [D5].
     */
    public record ThreadBubbleDto(
            String text,
            MessageSenderDto sender,
            boolean mine,
            Instant createdAt,
            String system) {
    }

    /**
     * The identity view. {@code section} carries its country with it [D11]; there
     * is no country field of its own anywhere in this product.
     */
    public record SenderIdentityDto(String id, String name, String email, String section) {
    }

    /** A row of the queue. No identity, by construction. */
    public record ReportRowDto(
            String id,
            String targetKind,
            String targetId,
            String reason,
            String status,
            Instant createdAt,
            ReporterDto reporter,
            ReportContentDto content,
            MessageSenderDto senderDisplay) {
    }

    /** One report, opened. The {@code sender} is what the audit row records. */
    public record ReportDetailDto(
            String id,
            String targetKind,
            String targetId,
            String reason,
            String status,
            Instant createdAt,
            ReporterDto reporter,
            ReportContentDto content,
            MessageSenderDto senderDisplay,
            SenderIdentityDto sender) {

        public static ReportDetailDto of(ReportRowDto row, SenderIdentityDto sender) {
            return new ReportDetailDto(row.id(), row.targetKind(), row.targetId(), row.reason(),
                    row.status(), row.createdAt(), row.reporter(), row.content(),
                    row.senderDisplay(), sender);
        }
    }

    /**
     * [B9] A row of the flagged list: a message that was delivered with an
     * acknowledged soft match. Nobody reported it, so there is no reporter and no
     * status — it is a list of things worth a look, not a queue of decisions.
     */
    public record FlaggedRowDto(
            String id,
            ReportContentDto content,
            MessageSenderDto senderDisplay) {
    }

    /** The flagged row, opened — audited exactly like a report's identity view. */
    public record FlaggedDetailDto(
            String id,
            ReportContentDto content,
            MessageSenderDto senderDisplay,
            SenderIdentityDto sender) {
    }

    /** [B9] A screening term as the admin page lists it. {@code normalized} is internal. */
    public record ScreeningTermDto(String id, String term, String severity, Instant createdAt) {
    }

    /** {@code POST /admin/api/screening-terms}. */
    public record AddScreeningTermRequest(String term, String severity) {
    }
}
