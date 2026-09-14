package app.brand.thread;

import app.brand.content.AllowedHints;
import app.brand.content.MessageSenderDto;
import java.time.Instant;
import java.util.List;

/**
 * The thread DTOs from {@code app/src/api/threads.ts}, field for field.
 *
 * <p>What is not here is again the point: no {@code senderId}, no participant ids,
 * no user ids of any kind. {@code other}, {@code mySender} and every message's
 * {@code sender} are a {@link MessageSenderDto} and nothing else, and
 * {@code blockMessageId} is a <em>message</em> id — the client blocks by pointing
 * at something that was written, never at a person [D6], which is what lets
 * someone block an anonymous sender without ever learning who they are.
 *
 * <p>{@code ThreadDetail extends ThreadSummary} in TypeScript; records cannot
 * extend, so {@link ThreadDetailDto} repeats the summary's five fields.
 */
public final class ThreadDtos {

    private ThreadDtos() {
    }

    /**
     * {@code ThreadMessage}. {@code system} is absent on an ordinary bubble
     * (Jackson's {@code non_null} inclusion) and {@code 'revealed'} on the row a
     * reveal appends.
     *
     * <p>{@code sender} is rendered from this row's own anonymity [D5] — never from
     * the sender's current participant level, or a reveal would rewrite history.
     */
    public record ThreadMessageDto(
            String id,
            String text,
            MessageSenderDto sender,
            boolean mine,
            Instant createdAt,
            String system) {
    }

    /** {@code ThreadSummary} — one row of the Threads tab. */
    public record ThreadSummaryDto(
            String id,
            MessageSenderDto other,
            String source,
            ThreadMessageDto lastMessage,
            long unreadCount,
            Instant updatedAt) {
    }

    /** {@code ThreadsSnapshot}. {@code unreadCount} is the sum over exactly this list. */
    public record ThreadsSnapshotDto(List<ThreadSummaryDto> threads, long unreadCount) {
    }

    /** {@code ThreadDetail['origin']} — the card the conversation started from. */
    public record OriginDto(String id, String text, MessageSenderDto sender, boolean mine) {
    }

    /** {@code ThreadDetail}. */
    public record ThreadDetailDto(
            String id,
            MessageSenderDto other,
            String source,
            ThreadMessageDto lastMessage,
            long unreadCount,
            Instant updatedAt,
            OriginDto origin,
            MessageSenderDto mySender,
            boolean canReveal,
            String blockMessageId,
            List<ThreadMessageDto> messages) {

        public static ThreadDetailDto of(ThreadSummaryDto summary,
                                         OriginDto origin,
                                         MessageSenderDto mySender,
                                         boolean canReveal,
                                         String blockMessageId,
                                         List<ThreadMessageDto> messages) {
            return new ThreadDetailDto(summary.id(), summary.other(), summary.source(),
                    summary.lastMessage(), summary.unreadCount(), summary.updatedAt(),
                    origin, mySender, canReveal, blockMessageId, messages);
        }
    }

    /** {@code ThreadOrigin}: {@code {kind:'inbox',id}} or {@code {kind:'post',id,eventId}}. */
    public record OriginRequest(String kind, String id, String eventId) {
    }

    /**
     * {@code OpenThreadRequest}. {@code anonymityLevel} arrives as a raw string so
     * an unknown value is a 422 naming the field rather than a 400 from Jackson,
     * and {@code allowedHints} is booleans only — the hint values are derived
     * server-side [B4]/[D11].
     */
    public record OpenThreadRequest(
            OriginRequest origin,
            String text,
            String anonymityLevel,
            AllowedHints allowedHints,
            Boolean screeningAcknowledged,
            String requestId) {

        public boolean acknowledged() {
            return Boolean.TRUE.equals(screeningAcknowledged);
        }
    }

    /** {@code POST /threads} — the only thing an open returns. */
    public record OpenedDto(String id) {
    }

    /** {@code POST /threads/{id}/messages}. */
    public record SendThreadMessageRequest(String text, String requestId, Boolean screeningAcknowledged) {

        public boolean acknowledged() {
            return Boolean.TRUE.equals(screeningAcknowledged);
        }
    }

    /** {@code PUT /threads/{id}/read}. */
    public record ReadRequest(String throughMessageId) {
    }

    /** {@code POST /threads/{id}/report}. */
    public record ThreadReportRequest(String reason) {
    }

    /** {@code POST /threads/{id}/block} — a message id, never a person. */
    public record ThreadBlockRequest(String messageId) {
    }
}
