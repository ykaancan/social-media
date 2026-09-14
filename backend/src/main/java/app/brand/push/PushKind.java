package app.brand.push;

/**
 * Everything the server may put on someone's lock screen in stage 1, and nothing
 * else.
 *
 * <p>The wire value is the {@code push_outbox.kind} column and the {@code kind}
 * field of the payload; the same string is the middle of the two message keys
 * ({@code push.<kind>.title} / {@code push.<kind>.body}), so adding a kind without
 * adding its English <em>and</em> Turkish copy fails the copy test rather than
 * shipping an untranslated notification.
 *
 * <p>Two rules hold for every kind here:
 *
 * <ul>
 *   <li><b>No identity.</b> A body never carries a name, a hint or anything a
 *       recipient could not already see on the card itself — the whole point of an
 *       anonymous message survives only if the notification is as anonymous as the
 *       message. The most a body says about a person is "someone".</li>
 *   <li><b>No content.</b> The text of a message is never in a push. The
 *       notification says that something arrived and where; the app shows what.</li>
 * </ul>
 */
public enum PushKind {

    /** Brief §4.8 "push is on by default for inbox". Suppressed by a muted word [D10]. */
    INBOX_NEW("inbox_new"),

    /** A reply in a private thread. Gated by {@code notify_threads}. */
    THREAD_MESSAGE("thread_message"),

    /** A moderator released this account's room post. */
    POST_APPROVED("post_approved"),

    /** [D8] Rejection is final; the sender's recovery path is Rewrite, in the app. */
    POST_REJECTED("post_rejected"),

    /** [D4] The board ended with the post still in the queue. Never "rejected by someone". */
    POST_BOARD_CLOSED("post_board_closed"),

    /** The one notification an account can get before it is approved. */
    ACCOUNT_APPROVED("account_approved"),

    /** An admin acted on a report with a warning (CLAUDE.md §4.9). */
    WARNED("warned");

    private final String wire;

    PushKind(String wire) {
        this.wire = wire;
    }

    /** The {@code kind} column and payload field. */
    public String wire() {
        return wire;
    }

    public String titleKey() {
        return "push." + wire + ".title";
    }

    public String bodyKey() {
        return "push." + wire + ".body";
    }

    /**
     * The body for a notification with no event to name. Stage 1 always has one —
     * every message and every thread starts at an event — but the column is
     * nullable and a push must never read "at null".
     */
    public String bodyKeyWithoutEvent() {
        return "push." + wire + ".body.noEvent";
    }
}
