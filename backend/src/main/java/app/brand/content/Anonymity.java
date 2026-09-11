package app.brand.content;

import app.brand.common.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.util.UUID;

/**
 * The anonymity columns [B4], as one embeddable every content row reuses:
 * {@code inbox_message}, {@code board_post}, {@code thread_message},
 * {@code thread_participant} and the display columns of {@code block}.
 *
 * <p>{@code senderSectionId} is the section the sender belonged to <em>when they
 * sent</em>. The section chip and the country chip are rendered from it, so a
 * later section change [D7] never rewrites history and [D11] stays checkable:
 * the country is always that snapshot section's country.
 *
 * <p>{@code sender_id} is deliberately NOT here. It is a column of its own on
 * every content table, and it never leaves the server.
 */
@Embeddable
public class Anonymity {

    @Column(name = "anonymity_level", nullable = false)
    private AnonymityLevel level;

    @Column(name = "hint_section", nullable = false)
    private boolean hintSection;

    @Column(name = "hint_country", nullable = false)
    private boolean hintCountry;

    @Column(name = "hint_letter", nullable = false)
    private boolean hintLetter;

    @Column(name = "sender_section_id")
    private UUID senderSectionId;

    protected Anonymity() {
    }

    private Anonymity(AnonymityLevel level,
                      boolean hintSection,
                      boolean hintCountry,
                      boolean hintLetter,
                      UUID senderSectionId) {
        this.level = level;
        this.hintSection = hintSection;
        this.hintCountry = hintCountry;
        this.hintLetter = hintLetter;
        this.senderSectionId = senderSectionId;
    }

    /**
     * Build the columns from what a client sent.
     *
     * <p>An unknown level is 422 on {@code anonymityLevel}; {@code hint} with no
     * hint selected is 422 "select a hint" on {@code allowedHints} — the mock's
     * two rules, unchanged. The booleans are forced false for {@code anonymous}
     * and {@code named}, so a stray {@code allowedHints} can never leak a chip the
     * sender did not pick.
     */
    public static Anonymity from(String rawLevel, AllowedHints hints, UUID senderSectionId) {
        return from(AnonymityLevel.ofWire(rawLevel), hints, senderSectionId);
    }

    public static Anonymity from(AnonymityLevel level, AllowedHints hints, UUID senderSectionId) {
        if (level == null) {
            throw ApiException.validation("invalid anonymity level", "anonymityLevel");
        }
        AllowedHints allowed = AllowedHints.orNone(hints);
        if (level != AnonymityLevel.HINT) {
            return new Anonymity(level, false, false, false, senderSectionId);
        }
        if (!allowed.any()) {
            throw ApiException.validation("select a hint", "allowedHints");
        }
        return new Anonymity(level, allowed.wantsSection(), allowed.wantsCountry(),
                allowed.wantsLetter(), senderSectionId);
    }

    public AnonymityLevel level() {
        return level;
    }

    public boolean hintSection() {
        return hintSection;
    }

    public boolean hintCountry() {
        return hintCountry;
    }

    public boolean hintLetter() {
        return hintLetter;
    }

    public UUID senderSectionId() {
        return senderSectionId;
    }
}
