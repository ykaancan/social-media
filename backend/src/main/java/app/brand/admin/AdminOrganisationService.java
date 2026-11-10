package app.brand.admin;

import app.brand.admin.AdminOrganisationDtos.AdminOrganisationDto;
import app.brand.admin.AdminOrganisationDtos.AdminOrganisationMemberDto;
import app.brand.common.ApiException;
import app.brand.common.events.AccountApproved;
import app.brand.event.EventMemberRepository;
import app.brand.event.EventRepository;
import app.brand.organisation.EventCreation;
import app.brand.organisation.MembershipRole;
import app.brand.organisation.MembershipStatus;
import app.brand.organisation.Organisation;
import app.brand.organisation.OrganisationMember;
import app.brand.organisation.OrganisationMemberRepository;
import app.brand.organisation.OrganisationRepository;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.security.AppPrincipal;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.MeMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The organisation decisions behind {@code /admin/api/organisations*}
 * [D13]/[D14]/[D17]. Like {@link AdminUserService}, every decision writes its
 * {@code audit_log} row in the same transaction as the change.
 *
 * <p>Two kinds of caller:
 *
 * <ul>
 *   <li><b>super_admin only</b> — create, change, list, assign and remove admins.
 *       Enforced by method security on {@code AdminOrganisationController}.</li>
 *   <li><b>an approved admin of that organisation, or a super_admin</b> — the
 *       member list, approve and reject. Enforced here by {@link #requireAdminOf}:
 *       anyone else gets {@code 404}, the same "exists but not yours looks like
 *       does not exist" rule as {@code EventAccess.requireMember} [B14].</li>
 * </ul>
 *
 * <p>Audit rows about an organisation itself name it as the subject
 * ({@code subject_kind = 'organisation'}); rows about a person in an organisation
 * name the person as {@code subject_user_id} and the organisation as the subject.
 */
@Service
public class AdminOrganisationService {

    static final String SUBJECT_ORGANISATION = "organisation";

    private final OrganisationRepository organisations;
    private final OrganisationMemberRepository members;
    private final AdminUserRepository users;
    private final SectionRepository sections;
    private final EventRepository events;
    private final EventMemberRepository eventMembers;
    private final AuditLogRepository auditLog;
    private final MeMapper meMapper;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public AdminOrganisationService(OrganisationRepository organisations,
                                    OrganisationMemberRepository members,
                                    AdminUserRepository users,
                                    SectionRepository sections,
                                    EventRepository events,
                                    EventMemberRepository eventMembers,
                                    AuditLogRepository auditLog,
                                    MeMapper meMapper,
                                    ApplicationEventPublisher publisher,
                                    Clock clock) {
        this.organisations = organisations;
        this.members = members;
        this.users = users;
        this.sections = sections;
        this.events = events;
        this.eventMembers = eventMembers;
        this.auditLog = auditLog;
        this.meMapper = meMapper;
        this.publisher = publisher;
        this.clock = clock;
    }

    /* ------------------------------------------------------- super_admin */

    @Transactional(readOnly = true)
    public List<AdminOrganisationDto> list() {
        return organisations.findAllByOrderByCreatedAtAscNameAsc().stream().map(AdminOrganisationService::toDto).toList();
    }

    /** [D13] Values already validated by the controller. */
    @Transactional
    public AdminOrganisationDto create(UUID adminId,
                                       String name,
                                       boolean approvalRequired,
                                       boolean hasSections,
                                       EventCreation eventCreation) {
        Instant now = clock.instant();
        Organisation organisation = organisations.saveAndFlush(
                Organisation.create(name, approvalRequired, hasSections, eventCreation, adminId, now));
        auditOrganisation(adminId, AuditAction.CREATE_ORGANISATION, organisation.getId(), now);
        return toDto(organisation);
    }

    /**
     * [D13] Each argument is null when the request did not carry it. {@code hasSections}
     * is not a parameter at all: P10, it never changes.
     */
    @Transactional
    public AdminOrganisationDto update(UUID adminId,
                                       UUID organisationId,
                                       String name,
                                       Boolean approvalRequired,
                                       EventCreation eventCreation) {
        Organisation organisation = requireOrganisation(organisationId);
        if (name != null) {
            organisation.setName(name);
        }
        if (approvalRequired != null) {
            organisation.setApprovalRequired(approvalRequired);
        }
        if (eventCreation != null) {
            organisation.setEventCreation(eventCreation);
        }
        Instant now = clock.instant();
        auditOrganisation(adminId, AuditAction.UPDATE_ORGANISATION, organisation.getId(), now);
        return toDto(organisations.saveAndFlush(organisation));
    }

    /**
     * TENANT_PLAN.md P6. The email must be an existing account that is
     * {@code active} and email-confirmed [D18]; otherwise {@code 422} on
     * {@code email}.
     *
     * <ul>
     *   <li>Already a member of this organisation (any status): the same row
     *       becomes {@code approved} with role {@code admin}; {@code sectionId} is
     *       not read.</li>
     *   <li>No membership yet: an approved admin membership is created. [D15] In an
     *       organisation with sections {@code sectionId} is required and must be
     *       one of its sections; without sections it must be absent.</li>
     * </ul>
     */
    @Transactional
    public void assignAdmin(UUID adminId, UUID organisationId, String email, String rawSectionId) {
        Organisation organisation = requireOrganisation(organisationId);
        AppUser user = (email == null ? null : users.findByEmailIgnoreCase(email.trim()).orElse(null));
        if (user == null || user.getStatus() != AccountStatus.ACTIVE || !user.isEmailConfirmed()) {
            throw ApiException.validation("no active, confirmed account with this email", "email");
        }

        Instant now = clock.instant();
        OrganisationMember existing = members
                .findByOrganisationIdAndUserId(organisationId, user.getId())
                .orElse(null);
        if (existing != null) {
            if (existing.getStatus() != MembershipStatus.APPROVED) {
                // Making a pending or rejected person an admin is also the
                // approval of their membership, so it leaves the same record an
                // approval does: who, when, and [D17] the event they asked from.
                existing.setStatus(MembershipStatus.APPROVED);
                existing.setApprovedAt(now);
                existing.setApprovedBy(adminId);
                joinPendingEvent(existing, now);
            }
            existing.setRole(MembershipRole.ADMIN);
            members.saveAndFlush(existing);
        } else {
            UUID sectionId = sectionFor(organisation, rawSectionId);
            members.saveAndFlush(OrganisationMember.approvedAdmin(
                    organisationId, user.getId(), sectionId, adminId, now));
        }
        auditMember(adminId, AuditAction.ASSIGN_ORGANISATION_ADMIN, user.getId(), organisationId, now);
    }

    /** Role back to {@code member}; the membership and its status stay. */
    @Transactional
    public void removeAdmin(UUID adminId, UUID organisationId, UUID userId) {
        requireOrganisation(organisationId);
        OrganisationMember member = members.findByOrganisationIdAndUserId(organisationId, userId)
                .orElseThrow(() -> ApiException.notFound("no such membership"));
        if (member.getRole() != MembershipRole.ADMIN) {
            throw ApiException.conflict("conflict", "this member is not an admin of the organisation", null);
        }
        member.setRole(MembershipRole.MEMBER);
        members.saveAndFlush(member);
        auditMember(adminId, AuditAction.REMOVE_ORGANISATION_ADMIN, userId, organisationId, clock.instant());
    }

    /* ------------------------------------- organisation admin or super_admin */

    /**
     * [D14] The organisation's members in one status, oldest submission first —
     * the person who has waited longest is decided first, as the account queue
     * was before [D14].
     */
    @Transactional(readOnly = true)
    public List<AdminOrganisationMemberDto> members(AppPrincipal caller, UUID organisationId, MembershipStatus status) {
        requireAdminOf(caller, organisationId);
        return members.findByOrganisationIdAndStatusOrderBySubmittedAtAsc(organisationId, status).stream()
                .map(this::toMemberDto)
                .toList();
    }

    /**
     * [D14] Only from {@code pending}. Writes {@code approved_at} /
     * {@code approved_by} and an {@code approve_member} audit row, and enqueues the
     * approval push after commit.
     *
     * <p>[D17] If the request stored an event and that event still exists, the
     * person is joined to it (the same idempotent insert {@code POST /events/join}
     * uses). Either way {@code pending_event_id} is cleared. A missing event never
     * fails the approval.
     */
    @Transactional
    public AdminOrganisationMemberDto approve(AppPrincipal caller, UUID organisationId, UUID userId) {
        Organisation organisation = requireAdminOf(caller, organisationId);
        OrganisationMember member = requirePending(organisationId, userId, "only a pending member can be approved");

        Instant now = clock.instant();
        member.setStatus(MembershipStatus.APPROVED);
        member.setApprovedAt(now);
        member.setApprovedBy(caller.id());

        joinPendingEvent(member, now);
        members.saveAndFlush(member);

        auditMember(caller.id(), AuditAction.APPROVE_MEMBER, userId, organisationId, now);
        // The person has been waiting for exactly this; the push layer tells them.
        publisher.publishEvent(new AccountApproved(userId, organisation.getName()));
        return toMemberDto(member);
    }

    /**
     * [D14] Only from {@code pending}. Writes a {@code reject_member} audit row.
     * No push: the removed account rejection sent none either.
     */
    @Transactional
    public AdminOrganisationMemberDto reject(AppPrincipal caller, UUID organisationId, UUID userId) {
        requireAdminOf(caller, organisationId);
        OrganisationMember member = requirePending(organisationId, userId, "only a pending member can be rejected");

        Instant now = clock.instant();
        member.setStatus(MembershipStatus.REJECTED);
        members.saveAndFlush(member);
        auditMember(caller.id(), AuditAction.REJECT_MEMBER, userId, organisationId, now);
        return toMemberDto(member);
    }

    /* ---------------------------------------------------------- internals */

    /**
     * The organisation, if the caller is a super_admin or an approved admin of it.
     * Otherwise {@code 404} — also for an organisation that does not exist, so the
     * two cannot be told apart.
     */
    private Organisation requireAdminOf(AppPrincipal caller, UUID organisationId) {
        Organisation organisation = organisations.findById(organisationId)
                .orElseThrow(() -> ApiException.notFound("no such organisation"));
        if (caller.isSuperAdmin()) {
            return organisation;
        }
        boolean admin = members.findByOrganisationIdAndUserId(organisationId, caller.id())
                .map(OrganisationMember::isApprovedAdmin)
                .orElse(false);
        if (!admin) {
            throw ApiException.notFound("no such organisation");
        }
        return organisation;
    }

    /**
     * [D17] Joins the person to the event their request came from, if it still
     * exists, and clears the stored event either way. A missing event never fails.
     */
    private void joinPendingEvent(OrganisationMember member, Instant now) {
        UUID pendingEventId = member.getPendingEventId();
        if (pendingEventId != null && events.existsById(pendingEventId)) {
            eventMembers.joinIfAbsent(pendingEventId, member.getUserId(),
                    OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        }
        member.setPendingEventId(null);
    }

    private OrganisationMember requirePending(UUID organisationId, UUID userId, String message) {
        OrganisationMember member = members.findByOrganisationIdAndUserId(organisationId, userId)
                .orElseThrow(() -> ApiException.notFound("no such membership"));
        if (member.getStatus() != MembershipStatus.PENDING) {
            throw ApiException.conflict("conflict", message, null);
        }
        return member;
    }

    private Organisation requireOrganisation(UUID organisationId) {
        return organisations.findById(organisationId)
                .orElseThrow(() -> ApiException.notFound("no such organisation"));
    }

    /** [D15] Required and of this organisation iff it has sections; absent otherwise. */
    private UUID sectionFor(Organisation organisation, String rawSectionId) {
        boolean given = rawSectionId != null && !rawSectionId.isBlank();
        if (!organisation.hasSections()) {
            if (given) {
                throw ApiException.validation("this organisation has no sections", "sectionId");
            }
            return null;
        }
        if (!given) {
            throw ApiException.validation("a section is required in this organisation", "sectionId");
        }
        UUID sectionId;
        try {
            sectionId = UUID.fromString(rawSectionId.trim());
        } catch (IllegalArgumentException ex) {
            throw ApiException.validation("unknown section", "sectionId");
        }
        return sections.findById(sectionId)
                .filter(section -> section.getOrganisationId().equals(organisation.getId()))
                .map(Section::getId)
                .orElseThrow(() -> ApiException.validation("not a section of this organisation", "sectionId"));
    }

    private void auditOrganisation(UUID adminId, AuditAction action, UUID organisationId, Instant now) {
        auditLog.save(AuditLog.aboutContent(adminId, action, null, SUBJECT_ORGANISATION, organisationId,
                AdminUserService.SOURCE_ADMIN_API, now));
    }

    private void auditMember(UUID actorId, AuditAction action, UUID userId, UUID organisationId, Instant now) {
        auditLog.save(AuditLog.aboutContent(actorId, action, userId, SUBJECT_ORGANISATION, organisationId,
                AdminUserService.SOURCE_ADMIN_API, now));
    }

    private static AdminOrganisationDto toDto(Organisation organisation) {
        return new AdminOrganisationDto(
                organisation.getId().toString(),
                organisation.getName(),
                organisation.isApprovalRequired(),
                organisation.hasSections(),
                organisation.getEventCreation(),
                organisation.getCreatedAt());
    }

    /** P7: no email, no phone — for any caller. */
    private AdminOrganisationMemberDto toMemberDto(OrganisationMember member) {
        AppUser user = users.findById(member.getUserId()).orElseThrow();
        return new AdminOrganisationMemberDto(
                user.getId().toString(),
                user.getName(),
                meMapper.avatarUrl(user.getAvatarKey()),
                user.getBio(),
                member.getSectionId() == null
                        ? null
                        : sections.findById(member.getSectionId()).map(meMapper::toSectionRef).orElse(null),
                member.getStatus(),
                member.getSubmittedAt());
    }
}
