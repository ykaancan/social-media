package app.brand.safety;

import app.brand.common.TextNormalizer;
import app.brand.common.events.ScreeningTermsChanged;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * [B9] The keyword half of screening: every term folded through the one
 * normaliser and matched as a substring of the equally folded text.
 *
 * <p>Substring, not word-boundary, and normalised on both sides on purpose — a
 * hard term has to survive "İZMİR", "izmir", "ızmır" and being glued to the word
 * next to it. Any hard match blocks; otherwise any soft match warns.
 *
 * <p>The list is cached for 30 seconds. An admin edits it a few times a year and
 * every message sent at an event reads it, so a half-minute of staleness is the
 * right trade; it is the only state this bean holds.
 *
 * <p>An edit does not wait out those 30 seconds: {@link #onTermsChanged} drops the
 * cache after the writing transaction commits. That listener is why the freshness
 * contract no longer depends on the caller remembering to call
 * {@link #invalidate()} — a term added on the admin page is matched by the very
 * next message, and a second screener implementation can listen for the same
 * event instead of being wired into the admin code.
 */
@Component
public class KeywordScreener implements ContentScreener {

    static final Duration CACHE_TTL = Duration.ofSeconds(30);

    private final ScreeningTermRepository terms;
    private final Clock clock;

    /** Immutable snapshot swapped in whole; no lock, and a racing double load is harmless. */
    private volatile Snapshot snapshot = new Snapshot(Instant.EPOCH, List.of());

    public KeywordScreener(ScreeningTermRepository terms, Clock clock) {
        this.terms = terms;
        this.clock = clock;
    }

    @Override
    public ScreeningResult screen(String text) {
        String haystack = TextNormalizer.normalizeForSearch(text == null ? "" : text);
        if (haystack.isEmpty()) {
            return ScreeningResult.ALLOW;
        }
        boolean soft = false;
        for (Term term : current()) {
            if (haystack.contains(term.normalized())) {
                if (term.hard()) {
                    return ScreeningResult.BLOCK;
                }
                soft = true;
            }
        }
        return soft ? ScreeningResult.WARN : ScreeningResult.ALLOW;
    }

    /** Drops the cache so a term written in this request is matched by the next one. */
    public void invalidate() {
        snapshot = new Snapshot(Instant.EPOCH, List.of());
    }

    /**
     * [B9] The list changed; reload on the next screen.
     *
     * <p>{@code AFTER_COMMIT} because a cache dropped before the commit could be
     * refilled from the old rows by a message sent in between, and
     * {@code fallbackExecution = true} so a write outside a transaction (a test,
     * a future import job) still invalidates.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onTermsChanged(ScreeningTermsChanged event) {
        invalidate();
    }

    private List<Term> current() {
        Instant now = Instant.now(clock);
        Snapshot cached = snapshot;
        if (!cached.loadedAt().equals(Instant.EPOCH)
                && Duration.between(cached.loadedAt(), now).compareTo(CACHE_TTL) < 0) {
            return cached.terms();
        }
        List<Term> loaded = new ArrayList<>();
        for (ScreeningTerm row : terms.findAll()) {
            String normalized = TextNormalizer.normalizeForSearch(row.getNormalized());
            if (!normalized.isEmpty()) {
                loaded.add(new Term(normalized, row.isHard()));
            }
        }
        snapshot = new Snapshot(now, List.copyOf(loaded));
        return snapshot.terms();
    }

    private record Term(String normalized, boolean hard) {
    }

    private record Snapshot(Instant loadedAt, List<Term> terms) {
    }
}
