package app.brand.board;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * {@code BoardState} in {@code app/src/api/board.ts}: where one board post sits.
 *
 * <p>[D8] {@link #REJECTED} is terminal — there is no un-reject. The five-second
 * undo window [B6] happens <em>before</em> this value changes: a post whose
 * rejection is still undoable is still {@link #PENDING}, which is why its sender
 * sees "waiting" and not "not published" until the window closes.
 *
 * <p>A post addressed to a person is stored {@link #APPROVED} and never queued;
 * whether it is <em>published</em> is the recipient's inbox message's business
 * [D12], not this column's.
 */
public enum BoardPostState {
    PENDING,
    APPROVED,
    REJECTED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static BoardPostState of(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
