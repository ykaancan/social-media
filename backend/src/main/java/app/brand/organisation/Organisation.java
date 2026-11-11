package app.brand.organisation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * [D13] A tenant: it owns events and, optionally, sections. Created by a
 * {@code super_admin} only; columns exactly as {@code V4__organisations.sql}.
 *
 * <p>{@code hasSections} has no setter and is not updatable: TENANT_PLAN.md P10,
 * it is never changed after creation.
 */
@Entity
@Table(name = "organisation")
public class Organisation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    /** [D14] true: a new membership starts {@code pending}. */
    @Column(name = "approval_required", nullable = false)
    private boolean approvalRequired;

    /** [D15] false for an organisation with no sections. Never changed (P10). */
    @Column(name = "has_sections", nullable = false, updatable = false)
    private boolean hasSections;

    /** [D16] who may create an event here. */
    @Column(name = "event_creation", nullable = false)
    private EventCreation eventCreation;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Organisation() {
    }

    public static Organisation create(String name,
                                      boolean approvalRequired,
                                      boolean hasSections,
                                      EventCreation eventCreation,
                                      UUID createdBy,
                                      Instant now) {
        Organisation organisation = new Organisation();
        organisation.name = name;
        organisation.approvalRequired = approvalRequired;
        organisation.hasSections = hasSections;
        organisation.eventCreation = eventCreation;
        organisation.createdBy = createdBy;
        organisation.createdAt = now;
        return organisation;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isApprovalRequired() {
        return approvalRequired;
    }

    public void setApprovalRequired(boolean approvalRequired) {
        this.approvalRequired = approvalRequired;
    }

    public boolean hasSections() {
        return hasSections;
    }

    public EventCreation getEventCreation() {
        return eventCreation;
    }

    public void setEventCreation(EventCreation eventCreation) {
        this.eventCreation = eventCreation;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
