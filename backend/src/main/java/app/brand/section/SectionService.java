package app.brand.section;

import app.brand.common.ApiException;
import app.brand.common.TextNormalizer;
import app.brand.section.SectionDtos.SectionDetailDto;
import app.brand.section.SectionDtos.SectionSummaryDto;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
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
 * Sections are membership tags, not tenants: every signed-in account may read
 * every section and every roster, at any status. The profile-setup screen needs
 * the picker before there is any approval at all, and hints and event people need
 * cross-section rosters.
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
    private final AppUserRepository users;
    private final SharedEventLookup sharedEvents;
    private final MeMapper meMapper;

    public SectionService(SectionRepository sections,
                          AppUserRepository users,
                          SharedEventLookup sharedEvents,
                          MeMapper meMapper) {
        this.sections = sections;
        this.users = users;
        this.sharedEvents = sharedEvents;
        this.meMapper = meMapper;
    }

    /** Every section, with its real approved-member count, ordered by normalised name. */
    @Transactional(readOnly = true)
    public List<SectionSummaryDto> list() {
        Map<UUID, Long> counts = sections.countMembersByStatus(AccountStatus.APPROVED).stream()
                .collect(Collectors.toMap(SectionMemberCount::sectionId, SectionMemberCount::members));

        return sections.findAll().stream()
                .sorted(Comparator.comparing(section -> TextNormalizer.normalizeForSearch(section.getName())))
                .map(section -> new SectionSummaryDto(
                        section.getId().toString(),
                        section.getName(),
                        section.getCountry().getName(),
                        counts.getOrDefault(section.getId(), 0L)))
                .toList();
    }

    /**
     * The section page. The viewer comes first in their own section whatever their
     * status — someone waiting for approval still sees themselves in the section
     * they picked — and everyone after them is an approved member.
     */
    @Transactional(readOnly = true)
    public SectionDetailDto detail(UUID viewerId, UUID sectionId) {
        Section section = sections.findById(sectionId)
                .orElseThrow(() -> ApiException.notFound("no such section"));
        SectionRefDto ref = meMapper.toSectionRef(section);

        AppUser viewer = users.findById(viewerId).orElse(null);
        List<AppUser> members = users.findBySection_IdAndStatus(sectionId, AccountStatus.APPROVED).stream()
                .filter(member -> member.getName() != null && !member.getName().isBlank())
                .sorted(BY_NAME)
                .toList();
        long memberCount = members.size();

        boolean viewerListed = viewer != null
                && viewer.getSection() != null
                && viewer.getSection().getId().equals(sectionId)
                && viewer.getName() != null
                && !viewer.getName().isBlank();

        List<AppUser> page = new ArrayList<>();
        if (viewerListed) {
            page.add(viewer);
        }
        for (AppUser member : members) {
            if (page.size() >= ROSTER_PAGE) {
                break;
            }
            if (!viewerListed || !member.getId().equals(viewer.getId())) {
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

        // The viewer is in the roster but not in the approved count while they are
        // still pending, so they are added once here — "and N more" is never
        // negative and nobody is counted twice.
        long rosterTotal = memberCount
                + (viewerListed && viewer.getStatus() != AccountStatus.APPROVED ? 1 : 0);

        return new SectionDetailDto(
                section.getId().toString(),
                section.getName(),
                section.getCountry().getName(),
                memberCount,
                roster,
                rosterTotal);
    }
}
