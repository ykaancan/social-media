package app.brand.message;

import app.brand.content.AllowedHints;
import app.brand.content.MessageSenderDto;
import app.brand.safety.WritingPolicy;
import app.brand.user.SectionRefDto;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The wall and inbox DTOs from {@code app/src/api/messages.ts}, field for field.
 *
 * <p>What is <em>not</em> here is the point of the file: no {@code senderId}, no
 * hint booleans, no {@code mutedMatch}, no {@code pushSuppressed}, no
 * {@code screeningFlag}, no {@code deletedAt}. A sender is only ever a
 * {@link MessageSenderDto}, built by {@code SenderPresenter} from the row's own
 * anonymity snapshot.
 *
 * <p>{@code InboxMessage extends WallMessage} in TypeScript; records cannot
 * extend, so {@link InboxMessageDto} repeats the fields and adds {@code state}.
 * The wall DTO carrying no {@code state} is a rule, not an oversight: a wall
 * visitor must not be able to tell an approved card from anything else the owner
 * has.
 */
public final class MessageDtos {

    private MessageDtos() {
    }

    /** {@code WallMessage['source']} — which event this was written from. */
    public record SourceDto(String eventId, String name) {
    }

    /** {@code WallMessage}. Public: no state, ever. */
    public record WallMessageDto(
            String id,
            String text,
            MessageSenderDto sender,
            Instant createdAt,
            SourceDto source,
            boolean approvedFromBoard) {
    }

    /** {@code InboxMessage} — the wall card plus where it sits [D12]. Owner only. */
    public record InboxMessageDto(
            String id,
            String text,
            MessageSenderDto sender,
            Instant createdAt,
            SourceDto source,
            boolean approvedFromBoard,
            MessageState state) {
    }

    /**
     * {@code InboxSnapshot}. {@code counts} is a map because {@code new} and
     * {@code private} are Java keywords and cannot be record components; it always
     * carries all three keys, and every count is over exactly the {@code messages}
     * list — the same visibility rule, never a second query that could disagree
     * (principle 4: a badge is never a number nothing backs).
     */
    public record InboxSnapshotDto(List<InboxMessageDto> messages, Map<String, Long> counts) {
    }

    /** {@code WallSnapshot['person']} — {@code Person & { bio?: string }}. */
    public record WallPersonDto(
            String id,
            String name,
            String avatarUrl,
            SectionRefDto section,
            String bio) {
    }

    /** {@code WallSnapshot}. */
    public record WallSnapshotDto(
            WallPersonDto person,
            List<WallMessageDto> messages,
            int count,
            @JsonProperty("isOwner") boolean isOwner,
            WritingPolicy writingPolicy) {
    }

    /**
     * {@code SendWallMessage}. {@code anonymityLevel} arrives as a raw string so an
     * unknown value is a 422 naming the field, not a 400 from Jackson.
     *
     * <p>{@code allowedHints} is booleans only: the hint <em>values</em> are derived
     * server-side from the sender's account and section snapshot [B4]/[D11], so a
     * country chip is always checkable against a real section.
     */
    public record SendWallMessageRequest(
            String eventId,
            String recipientId,
            String text,
            String anonymityLevel,
            AllowedHints allowedHints,
            Boolean screeningAcknowledged) {

        public boolean acknowledged() {
            return Boolean.TRUE.equals(screeningAcknowledged);
        }
    }

    /**
     * The answer to every delivered send. Always {@code true}, always the same
     * shape: the sender must not be able to tell a muted message [D10] from an
     * ordinary one.
     */
    public record AcceptedDto(boolean accepted) {

        public static AcceptedDto yes() {
            return new AcceptedDto(true);
        }
    }

    /** {@code PUT /me/inbox/{id}/state}. */
    public record StateRequest(String state) {
    }

    /** {@code POST /messages/{id}/report}. */
    public record ReportRequest(String reason) {
    }
}
