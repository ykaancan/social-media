package app.brand.board;

import app.brand.content.AllowedHints;
import app.brand.content.MessageSenderDto;
import app.brand.event.EventDtos.EventDetailDto;
import app.brand.user.PersonDto;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The board DTOs from {@code app/src/api/board.ts}, field for field.
 *
 * <p>What is not here is the point of the file: no {@code senderId} on any card,
 * no hint booleans, no {@code hiddenBy}, no {@code rejectedBy}, and no undo token
 * anywhere except {@link RejectionReceiptDto}, which is handed straight back to
 * the moderator who just rejected something and to nobody else. A sender is only
 * ever a {@link MessageSenderDto}, built by {@code SenderPresenter} from the
 * post's own anonymity snapshot.
 *
 * <p>Optional fields ({@code myReaction}, {@code recipient}, {@code rejectionReason},
 * {@code creator}) are null here and dropped by Jackson's {@code non_null}
 * inclusion, so the client sees them absent exactly as {@code ?} declares.
 */
public final class BoardDtos {

    private BoardDtos() {
    }

    /**
     * {@code BoardPost}.
     *
     * <p>{@code state} of a post addressed to a person is always {@code approved}:
     * it was never queued, and what decides whether it is on the board is the
     * recipient's own inbox state [D12], which is not the board's business to show.
     *
     * <p>{@code recipient} is present only for such a post — the one place a board
     * card names anybody, and it names the person written <em>to</em>, never the
     * person writing.
     */
    public record BoardPostDto(
            String id,
            String text,
            MessageSenderDto sender,
            Instant createdAt,
            BoardPostState state,
            @JsonProperty("mine") boolean mine,
            /** Emoji to number of people; always present, often empty. */
            Map<String, Integer> reactions,
            String myReaction,
            PersonDto recipient,
            /** [D8] {@code moderator} or {@code board_closed}; only the sender ever sees it. */
            String rejectionReason) {
    }

    /**
     * {@code BoardSnapshot}. One read answers every surface of the board screen,
     * because a moderator switching to the queue must not be able to see a
     * different board than the one behind it.
     *
     * <p>{@code queue}, {@code pendingCount} and {@code reviewed} are empty and
     * zero for a member who is not a moderator — not omitted, so the client never
     * has to guess, and not populated, because the queue is not theirs.
     */
    public record BoardSnapshotDto(
            EventDetailDto event,
            List<BoardPostDto> posts,
            List<BoardPostDto> ownUnpublished,
            List<BoardPostDto> queue,
            int pendingCount,
            List<BoardPostDto> reviewed,
            PersonDto creator,
            List<PersonDto> moderators,
            @JsonProperty("canManageModerators") boolean canManageModerators) {
    }

    /**
     * {@code RejectionReceipt} — [D8] the five seconds in which a mis-tap can be
     * taken back, handed to the moderator who rejected and to nobody else.
     */
    public record RejectionReceiptDto(String undoToken, Instant undoUntil) {
    }

    /**
     * {@code SendBoardPost} = {@code SendWallMessage} with {@code recipientId}
     * optional. Absent means "to the room"; present means the card is really an
     * inbox message with a board card attached, and it never enters a queue.
     */
    public record SendBoardPostRequest(
            String eventId,
            String recipientId,
            String text,
            String anonymityLevel,
            AllowedHints allowedHints,
            Boolean screeningAcknowledged) {
    }

    /** {@code PUT /events/{id}/posts/{post}/reaction}. {@code null} clears. */
    public record ReactionRequest(String emoji) {
    }

    /** {@code POST /events/{id}/moderation/approve}. */
    public record ApproveRequest(List<String> ids) {
    }

    /** {@code POST /events/{id}/moderation/undo}. */
    public record UndoRequest(String undoToken) {
    }

    /** {@code POST /events/{id}/posts/{post}/report}. */
    public record ReportPostRequest(String reason) {
    }

    /** {@code PUT /events/{id}/controls}. A mode change affects future posts only. */
    public record ControlsRequest(String boardMode, String endsAt) {
    }
}
