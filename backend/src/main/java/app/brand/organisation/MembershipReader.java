package app.brand.organisation;

import app.brand.organisation.MembershipDtos.MembershipDto;
import app.brand.organisation.MembershipDtos.OrganisationRefDto;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import app.brand.settings.SectionChangeLog;
import app.brand.user.SectionRefDto;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * [D14] {@code Me.memberships}: every membership of the caller, in every status,
 * oldest first. It takes the caller's own id and nothing else, so it cannot be
 * asked about anyone else's memberships.
 *
 * <ul>
 *   <li>{@code canCreateEvents} [D16] = the membership is {@code approved} AND
 *       (the organisation's {@code event_creation} is {@code members} OR the role is
 *       {@code admin}).</li>
 *   <li>{@code sectionChangeAvailableAt} [D7] = the newest {@code section_change}
 *       of this user in this organisation + 30 days when that is still in the
 *       future, else null.</li>
 *   <li>{@code pendingEventName} [D17] = the name of {@code pending_event_id}'s
 *       event, only while the membership is {@code pending} and the event still
 *       exists.</li>
 * </ul>
 */
@Component
public class MembershipReader {

    /** [D7] One section change per 30 days, the same figure SettingsService uses. */
    private static final int SECTION_CHANGE_COOLDOWN_DAYS = 30;

    private final OrganisationMemberRepository members;
    private final OrganisationRepository organisations;
    private final SectionRepository sections;
    private final EntityManager entityManager;
    private final SectionChangeLog sectionChanges;
    private final Clock clock;

    public MembershipReader(OrganisationMemberRepository members,
                            OrganisationRepository organisations,
                            SectionRepository sections,
                            EntityManager entityManager,
                            SectionChangeLog sectionChanges,
                            Clock clock) {
        this.members = members;
        this.organisations = organisations;
        this.sections = sections;
        this.entityManager = entityManager;
        this.sectionChanges = sectionChanges;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<MembershipDto> of(UUID userId) {
        Instant now = clock.instant();
        List<MembershipDto> out = new ArrayList<>();
        for (OrganisationMember member : members.findByUserIdOrderByCreatedAtAsc(userId)) {
            Organisation organisation = organisations.findById(member.getOrganisationId()).orElseThrow();
            out.add(new MembershipDto(
                    new OrganisationRefDto(organisation.getId().toString(), organisation.getName(),
                            organisation.hasSections()),
                    member.getStatus(),
                    member.getRole(),
                    sectionRef(member.getSectionId()),
                    canCreateEvents(organisation, member),
                    sectionChangeAvailableAt(userId, organisation.getId(), now),
                    pendingEventName(member)));
        }
        return out;
    }

    /** [D16] */
    static boolean canCreateEvents(Organisation organisation, OrganisationMember member) {
        return member.getStatus() == MembershipStatus.APPROVED
                && (organisation.getEventCreation() == EventCreation.MEMBERS
                || member.getRole() == MembershipRole.ADMIN);
    }

    private SectionRefDto sectionRef(UUID sectionId) {
        if (sectionId == null) {
            return null;
        }
        return sections.findById(sectionId)
                .map(MembershipReader::toRef)
                .orElse(null);
    }

    /** [D11] The country rides on the section. Same shape as {@code MeMapper.toSectionRef}. */
    private static SectionRefDto toRef(Section section) {
        return new SectionRefDto(section.getId().toString(), section.getName(), section.getCountry().getName());
    }

    private String sectionChangeAvailableAt(UUID userId, UUID organisationId, Instant now) {
        return sectionChanges.lastChangedAt(userId, organisationId)
                .map(last -> last.plus(SECTION_CHANGE_COOLDOWN_DAYS, ChronoUnit.DAYS))
                .filter(availableAt -> availableAt.isAfter(now))
                .map(Instant::toString)
                .orElse(null);
    }

    /**
     * The name alone, not the entity: an event of an organisation without sections
     * has no section row for the entity's section association to load [P9].
     */
    private String pendingEventName(OrganisationMember member) {
        if (member.getStatus() != MembershipStatus.PENDING || member.getPendingEventId() == null) {
            return null;
        }
        return entityManager.createQuery("select e.name from Event e where e.id = :id", String.class)
                .setParameter("id", member.getPendingEventId())
                .getResultStream()
                .findFirst()
                .orElse(null);
    }
}
