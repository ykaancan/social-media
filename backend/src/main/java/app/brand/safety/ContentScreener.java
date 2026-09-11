package app.brand.safety;

/**
 * [B9] "Keyword + model screening runs server-side before delivery" (CLAUDE.md
 * §5). The keyword list is the implementation today; a model-backed screener is a
 * later, flag-gated sub-step, and it arrives behind this interface without a
 * single caller changing.
 *
 * <p>Screening decides <em>delivery</em>. It is not the recipient's muted words
 * [D10], which never affect delivery and never tell the sender anything.
 */
public interface ContentScreener {

    ScreeningResult screen(String text);

    /** The three answers every caller branches on. */
    enum ScreeningResult {
        /** Nothing matched: deliver, no warning. */
        ALLOW,
        /** A soft term matched: warn before send; deliver if the sender acknowledged. */
        WARN,
        /** A hard term matched: refuse delivery (422), whatever the sender acknowledged. */
        BLOCK;

        public boolean isWarning() {
            return this != ALLOW;
        }
    }
}
