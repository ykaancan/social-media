package app.brand.section;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.organisation.MembershipStatus;
import app.brand.organisation.OrganisationMemberRepository;
import app.brand.organisation.OrganisationRepository;
import app.brand.section.SectionDtos.SectionDetailDto;
import app.brand.section.SectionDtos.SectionSummaryDto;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.MeMapper;
import app.brand.user.PersonDto;
import app.brand.user.SectionRefDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sections are membership tags, not tenants, and [D15] each belongs to one
 * organisation (TENANT_PLAN.md §3 rule 5):
 *
 * <ul>
 *   <li>An organisation's section list is readable by any active account,
 *       because the section picker of {@code POST /organisations/join} runs
 *       before a membership exists.</li>
 *   <li>A section's page and roster are readable only by an approved member of
 *       the section's organisation; anyone else gets {@code 404}, so "exists but
 *       not yours" looks like "does not exist" [B14].</li>
 * </ul>
 *
 * <p>A person is a member of a section when their membership in its organisation
 * is {@code approved} and has that section, and their account is {@code active}.
 *
 * <p>Nothing here is an administrative surface — a section has no powers to
 * expose.
 */
@Service
public class SectionService {

    /** One page of a roster; "and N more" is {@code rosterTotal - roster.size()}. */
    public static final int ROSTER_PAGE = 50;

    /** Fold through the one normaliser, then break ties on the id so paging is stable. */
    private static final Comparator<AppUser> BY_NAME =
            Comparator.<AppUser, String>comparing(user -> TextNormalizer.normalizeForSearch(user.getName()))
                    .thenComparing(user -> user.getId().toString());

    private final SectionRepository sections;
    private final OrganisationRepository organisations;
    private final OrganisationMemberRepository memberships;
    private final SharedEventLookup sharedEvents;
    private final MeMapper meMapper;

    public SectionService(SectionRepository sections,
                          OrganisationRepository organisations,
                          OrganisationMemberRepository memberships,
                          SharedEventLookup sharedEvents,
                          MeMapper meMapper) {
        this.sections = sections;
        this.organisations = organisations;
        this.memberships = memberships;
        this.sharedEvents = sharedEvents;
        this.meMapper = meMapper;
    }

    /**
     * {@code GET /organisations/{id}/sections}: the organisation's sections with
     * their real member counts, ordered by normalised name. Unknown organisation →
     * 404; an organisation without sections → an empty list.
     */
    @Transactional(readOnly = true)
    public List<SectionSummaryDto> listOf(UUID organisationId) {
        if (!organisations.existsById(organisationId)) {
            throw ApiException.notFound("no such organisation");
        }
        Map<UUID, Long> counts = sections
                .countMembers(organisationId, MembershipStatus.APPROVED, AccountStatus.ACTIVE).stream()
                .collect(Collectors.toMap(SectionMemberCount::sectionId, SectionMemberCount::members));

        return sections.findByOrganisationId(organisationId).stream()
                .sorted(Comparator.comparing(section -> TextNormalizer.normalizeForSearch(section.getName())))
                .map(section -> new SectionSummaryDto(
                        section.getId().toString(),
                        section.getName(),
                        section.getCountry().getName(),
                        counts.getOrDefault(section.getId(), 0L)))
                .toList();
    }

    /**
     * {@code GET /sections/{id}}, for an approved member of the section's
     * organisation only (404 otherwise). The viewer comes first when the section
     * is their own; everyone after them is a member of it, by normalised name.
     *
     * <p>The viewer is always an approved member of an active account here (the
     * access filter and the check below see to that), so when they are listed they
     * are also in the count: {@code rosterTotal} is the member count and nobody is
     * counted twice.
     */
    @Transactional(readOnly = true)
    public SectionDetailDto detail(UUID viewerId, UUID sectionId) {
        Section section = sections.findById(sectionId)
                .orElseThrow(() -> ApiException.notFound("no such section"));
        boolean approvedMember = memberships
                .findByOrganisationIdAndUserId(section.getOrganisationId(), viewerId)
                .map(membership -> membership.getStatus() == MembershipStatus.APPROVED)
                .orElse(false);
        if (!approvedMember) {
            throw ApiException.notFound("no such section");
        }
        SectionRefDto ref = meMapper.toSectionRef(section);

        List<AppUser> members = sections
                .findMembers(sectionId, MembershipStatus.APPROVED, AccountStatus.ACTIVE).stream()
                .filter(member -> member.getName() != null && !member.getName().isBlank())
                .sorted(BY_NAME)
                .toList();
        long memberCount = members.size();

        AppUser viewer = members.stream()
                .filter(member -> member.getId().equals(viewerId))
                .findFirst()
                .orElse(null);

        List<AppUser> page = new ArrayList<>();
        if (viewer != null) {
            page.add(viewer);
        }
        for (AppUser member : members) {
            if (page.size() >= ROSTER_PAGE) {
                break;
            }
            if (viewer == null || !member.getId().equals(viewerId)) {
                page.add(member);
            }
        }

        Map<UUID, UUID> wallEvents = sharedEvents.sharedEventsWith(viewerId, page.stream()
                .map(AppUser::getId)
                .filter(id -> !id.equals(viewerId))
                .toList());

        List<PersonDto> roster = new ArrayList<>(page.size());
        for (AppUser member : page) {
            UUID wallEvent = wallEvents.get(member.getId());
            roster.add(new PersonDto(
                    member.getId().toString(),
                    member.getName(),
                    meMapper.avatarUrl(member.getAvatarKey()),
                    ref,
                    wallEvent == null ? null : wallEvent.toString()));
        }

        return new SectionDetailDto(
                section.getId().toString(),
                section.getName(),
                section.getCountry().getName(),
                memberCount,
                roster,
                memberCount);
    }
}
