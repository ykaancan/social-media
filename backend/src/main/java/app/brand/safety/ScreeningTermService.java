package app.brand.safety;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.common.events.ScreeningTermsChanged;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [B9] The screening list as data: read, add, delete. The admin page is the only
 * caller, but the rules live here rather than in the controller because they are
 * the product's, not the screen's.
 *
 * <p>Two of them matter:
 *
 * <ul>
 *   <li>The stored {@code normalized} column is the term through
 *       {@link TextNormalizer#normalizeForSearch} — the same normaliser as muted
 *       words, section search and people search — so a list written in ASCII still
 *       catches a Turkish writer, and "İZMİR" and "izmir" are one term.</li>
 *   <li>Every write publishes {@link ScreeningTermsChanged}. Nothing here calls
 *       {@code KeywordScreener.invalidate()} directly: the screener listens for the
 *       event after commit, so the cache contract holds for every writer, and a
 *       second screener implementation needs no change on this side.</li>
 * </ul>
 */
@Service
public class ScreeningTermService {

    static final int TERM_MAX = 80;

    private final ScreeningTermRepository terms;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public ScreeningTermService(ScreeningTermRepository terms,
                                ApplicationEventPublisher publisher,
                                Clock clock) {
        this.terms = terms;
        this.publisher = publisher;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ScreeningTerm> list() {
        return terms.findAllByOrderByCreatedAtDescIdDesc();
    }

    /**
     * @param rawTerm     as the admin typed it; stored verbatim and shown back to them
     * @param rawSeverity {@code hard} or {@code soft}; anything else is a 422
     * @throws ApiException 409 when the same normalised term already exists at that severity
     */
    @Transactional
    public ScreeningTerm add(UUID adminId, String rawTerm, String rawSeverity) {
        String term = rawTerm == null ? "" : rawTerm.trim();
        if (term.isEmpty() || term.length() > TERM_MAX) {
            throw ApiException.validation("a term is 1 to " + TERM_MAX + " characters", "term");
        }
        String severity = rawSeverity == null ? "" : rawSeverity.trim().toLowerCase(Locale.ROOT);
        if (!ScreeningTerm.HARD.equals(severity) && !ScreeningTerm.SOFT.equals(severity)) {
            throw ApiException.validation("severity is hard or soft", "severity");
        }
        String normalized = TextNormalizer.normalizeForSearch(term);
        if (normalized.isEmpty()) {
            // Punctuation and diacritics alone fold to nothing; such a row would
            // match every message, because "" is a substring of everything.
            throw ApiException.validation("that term has no letters or digits to match", "term");
        }
        if (terms.existsByNormalizedAndSeverity(normalized, severity)) {
            throw ApiException.conflict("conflict", "that term is already on the list", "term");
        }

        Instant now = Instant.now(clock);
        ScreeningTerm saved = terms.save(ScreeningTerm.of(term, normalized, severity, adminId, now));
        publisher.publishEvent(new ScreeningTermsChanged());
        return saved;
    }

    /** Deleting a term that is already gone is a 404, not a silent success. */
    @Transactional
    public void delete(UUID id) {
        ScreeningTerm term = terms.findById(id)
                .orElseThrow(() -> ApiException.notFound("no such term"));
        terms.delete(term);
        publisher.publishEvent(new ScreeningTermsChanged());
    }
}
