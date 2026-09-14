package app.brand.content;

/**
 * {@code AllowedHints} in {@code app/src/api/messages.ts}: booleans only.
 *
 * <p>The client never sends hint <em>values</em> — a section name or a country
 * could be anything if it did. The values are derived server-side from the
 * sender's account and the section snapshot [B4]/[D11], so a {@code country}
 * hint is always checkable against the sender's section.
 *
 * <p>Boxed booleans, because an absent key and {@code false} both mean "not
 * allowed" and Jackson has to be able to leave them out.
 */
public record AllowedHints(Boolean section, Boolean country, Boolean letter) {

    public static final AllowedHints NONE = new AllowedHints(false, false, false);

    public boolean wantsSection() {
        return Boolean.TRUE.equals(section);
    }

    public boolean wantsCountry() {
        return Boolean.TRUE.equals(country);
    }

    public boolean wantsLetter() {
        return Boolean.TRUE.equals(letter);
    }

    public boolean any() {
        return wantsSection() || wantsCountry() || wantsLetter();
    }

    /** A null body field is "no hints", not a null pointer. */
    public static AllowedHints orNone(AllowedHints hints) {
        return hints == null ? NONE : hints;
    }
}
