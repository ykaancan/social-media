package app.brand.content;

import java.util.UUID;

/**
 * Anything that has to be shown to a member as a sender: an
 * {@code inbox_message}, a {@code board_post}, a {@code block}'s frozen display
 * columns [D6]. Two accessors, because that is all
 * {@link SenderPresenter#present(Anonymity, app.brand.user.AppUser, app.brand.section.Section)}
 * needs to decide what may be rendered.
 *
 * <p>{@link #senderId()} never leaves the server. It is here so the presenter can
 * load the live user row [B4]; no DTO built from a {@code SenderRow} carries it.
 */
public interface SenderRow {

    /** The row's own anonymity columns — the level it was written at, never a later one [D5]. */
    Anonymity anonymity();

    /** The account behind the row: the sender of a message or post, the blocked person of a block. */
    UUID senderId();
}
