package app.brand.user;

import app.brand.section.Section;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
 * A real person's account. One per person; the server always knows who sent what,
 * whatever anonymity level a piece of content carries.
 *
 * <p>Deletion of this row is real deletion (KVKK), which is why almost every
 * foreign key pointing here is RESTRICT: the deletion service removes content in
 * a fixed order and the database refuses a half-done job.
 */
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Stored as typed; uniqueness is the {@code lower(email)} index. */
    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** Optional in stage 1: a contact route, not a verification step. */
    @Column(name = "phone")
    private String phone;

    @Convert(converter = AccountStatusConverter.class)
    @Column(name = "status", nullable = false)
    private AccountStatus status;

    @Convert(converter = RoleConverter.class)
    @Column(name = "role", nullable = false)
    private Role role;

    @Column(name = "name")
    private String name;

    @Column(name = "bio")
    private String bio;

    /** [B10] File name under {@code brand.media.dir}; the URL is built by MeMapper. */
    @Column(name = "avatar_key")
    private String avatarKey;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "section_id")
    private Section section;

    /** Invite chain — stage 2 uses it, the column exists from migration 1. */
    @Column(name = "inviter_id")
    private UUID inviterId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "banned_at")
    private Instant bannedAt;

    protected AppUser() {
    }

    /** A fresh registration: {@code incomplete} and {@code member}, always. */
    public static AppUser register(String email, String passwordHash, String phone, Instant now) {
        AppUser user = new AppUser();
        user.email = email;
        user.passwordHash = passwordHash;
        user.phone = phone;
        user.status = AccountStatus.INCOMPLETE;
        user.role = Role.MEMBER;
        user.createdAt = now;
        return user;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getPhone() {
        return phone;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public void setStatus(AccountStatus status) {
        this.status = status;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getAvatarKey() {
        return avatarKey;
    }

    public void setAvatarKey(String avatarKey) {
        this.avatarKey = avatarKey;
    }

    public Section getSection() {
        return section;
    }

    public void setSection(Section section) {
        this.section = section;
    }

    public UUID getInviterId() {
        return inviterId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
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

    public Instant getBannedAt() {
        return bannedAt;
    }

    public void setBannedAt(Instant bannedAt) {
        this.bannedAt = bannedAt;
    }
}
