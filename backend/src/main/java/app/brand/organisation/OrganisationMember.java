package app.brand.organisation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * [D14] One person's place in one organisation: approval and role live here, not
 * on the account. [D15] {@code sectionId} is required by the application iff the
 * organisation has sections; the composite foreign key in V4 guarantees it is a
 * section of this organisation. [D17] {@code pendingEventId} is the event the
 * request came from, joined automatically on approval.
 *
 * <p>Plain ids rather than associations, for the same reason as
 * {@code EventMember}: two of them are halves of the composite key.
 */
@Entity
@Table(name = "organisation_member")
@IdClass(OrganisationMemberId.class)
public class OrganisationMember {

    @Id
    @Column(name = "organisation_id", nullable = false, updatable = false)
    private UUID organisationId;

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "status", nullable = false)
    private MembershipStatus status;

    @Column(name = "role", nullable = false)
    private MembershipRole role;

    @Column(name = "section_id")
    private UUID sectionId;

    @Column(name = "pending_event_id")
    private UUID pendingEventId;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected OrganisationMember() {
    }

    /**
     * TENANT_PLAN.md P6: the membership a super admin creates when assigning an
     * organisation admin who is not a member yet — approved at once, role admin.
     */
    public static OrganisationMember approvedAdmin(UUID organisationId,
                                                   UUID userId,
                                                   UUID sectionId,
                                                   UUID approvedBy,
                                                   Instant now) {
        OrganisationMember member = new OrganisationMember();
        member.organisationId = organisationId;
        member.userId = userId;
        member.status = MembershipStatus.APPROVED;
        member.role = MembershipRole.ADMIN;
        member.sectionId = sectionId;
        member.submittedAt = now;
        member.approvedAt = now;
        member.approvedBy = approvedBy;
        member.createdAt = now;
        return member;
    }

    public UUID getOrganisationId() {
        return organisationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public MembershipStatus getStatus() {
        return status;
    }

    public void setStatus(MembershipStatus status) {
        this.status = status;
    }

    public MembershipRole getRole() {
        return role;
    }

    public void setRole(MembershipRole role) {
        this.role = role;
    }

    public UUID getSectionId() {
        return sectionId;
    }

    public UUID getPendingEventId() {
        return pendingEventId;
    }

    public void setPendingEventId(UUID pendingEventId) {
        this.pendingEventId = pendingEventId;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(Instant approvedAt) {
        this.approvedAt = approvedAt;
    }

    public UUID getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(UUID approvedBy) {
        this.approvedBy = approvedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** [D14] Approved with role admin: approves and rejects this organisation's members. */
    public boolean isApprovedAdmin() {
        return status == MembershipStatus.APPROVED && role == MembershipRole.ADMIN;
    }
}
