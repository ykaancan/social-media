package app.brand.common;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The one normaliser, mirroring {@code app/src/utils/text.ts} exactly.
 *
 * <p>[D10] Muted words, screening terms [B9], section search and people search all
 * fold through this, and client and server must agree character for character —
 * if this and {@code normalizeForSearch} in the app ever disagree, a muted word
 * stops matching what the person typed.
 *
 * <p>The Turkish pairs are mapped explicitly BEFORE the generic case call, in the
 * same order as the app: {@code U+0130} (dotted capital I) → {@code i} first,
 * because the default lowercase of {@code İ} is {@code i} plus a combining dot,
 * then {@code I} → {@code U+0131} (dotless i).
 */
public final class TextNormalizer {

    private static final char DOTTED_CAPITAL_I = 'İ';
    private static final char DOTLESS_SMALL_I = 'ı';
    private static final Pattern COMBINING_MARKS = Pattern.compile("[\\u0300-\\u036f]");

    private TextNormalizer() {
    }

    /**
     * Turkish-aware lowercase: {@code İ → i} and {@code I → ı}. Mirrors
     * {@code lower(s, 'tr')}.
     */
    public static String lowerTr(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace(DOTTED_CAPITAL_I, 'i')
                .replace('I', DOTLESS_SMALL_I)
                .toLowerCase(Locale.ROOT);
    }

    /**
     * Turkish-aware lowercase, then dotless i → i, then NFD with combining marks
     * stripped, so "Boğaziçi" and "BOGAZICI" fold to the same key.
     */
    public static String normalizeForSearch(String value) {
        if (value == null) {
            return "";
        }
        String lowered = lowerTr(value).replace(DOTLESS_SMALL_I, 'i');
        String decomposed = Normalizer.normalize(lowered, Normalizer.Form.NFD);
        return COMBINING_MARKS.matcher(decomposed).replaceAll("");
    }
}
