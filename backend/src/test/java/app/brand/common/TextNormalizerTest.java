package app.brand.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * The server normaliser has to agree with {@code app/src/utils/text.ts} character
 * for character — these are the app's own test inputs. A disagreement here is a
 * muted word that silently stops matching what the person typed [D10].
 */
class TextNormalizerTest {

    @ParameterizedTest
    @CsvSource({
            "İZMİR,izmir",
            "İzmir,izmir",
            "Boğaziçi,bogazici",
            "BOGAZICI,bogazici",
            "Boğazici,bogazici",
            "Işık,isik",
            "IŞIK,isik",
            "istanbul,istanbul",
            "İstanbul,istanbul",
            "ISTANBUL,istanbul",
            "Şeyma,seyma",
            "ESN Çukurova,esn cukurova",
            "Müğla,mugla",
    })
    @DisplayName("normalizeForSearch folds Turkish case and diacritics to one key")
    void normalizes(String input, String expected) {
        assertThat(TextNormalizer.normalizeForSearch(input)).isEqualTo(expected);
    }

    @Test
    @DisplayName("the dotted and dotless I fold together, as they must for search")
    void dottedAndDotlessAgree() {
        assertThat(TextNormalizer.normalizeForSearch("İ"))
                .isEqualTo(TextNormalizer.normalizeForSearch("ı"))
                .isEqualTo("i");
    }

    @Test
    @DisplayName("Turkish lowercase maps I to the dotless i before folding")
    void lowerTrKeepsTheTurkishPairs() {
        assertThat(TextNormalizer.lowerTr("IŞIK")).isEqualTo("ışık");
        assertThat(TextNormalizer.lowerTr("İZMİR")).isEqualTo("izmir");
    }

    @Test
    @DisplayName("null and empty are the empty key, never a null pointer")
    void nullSafe() {
        assertThat(TextNormalizer.normalizeForSearch(null)).isEmpty();
        assertThat(TextNormalizer.normalizeForSearch("")).isEmpty();
        assertThat(TextNormalizer.lowerTr(null)).isEmpty();
    }
}
