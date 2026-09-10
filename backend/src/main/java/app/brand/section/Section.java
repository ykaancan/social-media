package app.brand.section;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A membership tag, not a tenant: sections have no administrative power.
 * Rows come from {@code V2__reference_data.sql} [B13] and are never seeded by code.
 */
@Entity
@Table(name = "section")
public class Section {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    /** Eager: it is one tiny table and every SectionRef needs the country name. */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "country_code", nullable = false)
    private Country country;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Section() {
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Country getCountry() {
        return country;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
