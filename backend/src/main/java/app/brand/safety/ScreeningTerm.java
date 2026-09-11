package app.brand.safety;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * [B9] Keyword screening is lists as data, edited from the admin page (step B-5),
 * never a constant in the source.
 *
 * <p>{@code normalized} is the term through {@code TextNormalizer} — the same
 * normaliser as muted words, section search and people search, so "İZMİR" and
 * "izmir" are one term and a Turkish writer cannot slip past a list written in
 * ASCII.
 */
@Entity
@Table(name = "screening_term")
public class ScreeningTerm {

    public static final String HARD = "hard";
    public static final String SOFT = "soft";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** As the admin typed it; shown back to them, never matched against. */
    @Column(name = "term", nullable = false)
    private String term;

    @Column(name = "normalized", nullable = false)
    private String normalized;

    /** {@code hard} refuses delivery; {@code soft} warns the sender first. */
    @Column(name = "severity", nullable = false)
    private String severity;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ScreeningTerm() {
    }

    public static ScreeningTerm of(String term, String normalized, String severity,
                                   UUID createdBy, Instant now) {
        ScreeningTerm row = new ScreeningTerm();
        row.term = term;
        row.normalized = normalized;
        row.severity = severity;
        row.createdBy = createdBy;
        row.createdAt = now;
        return row;
    }

    public UUID getId() {
        return id;
    }

    public String getTerm() {
        return term;
    }

    public String getNormalized() {
        return normalized;
    }

    public String getSeverity() {
        return severity;
    }

    public boolean isHard() {
        return HARD.equals(severity);
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
