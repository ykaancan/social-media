package app.brand.organisation;

import app.brand.section.Section;
import app.brand.section.SectionRepository;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * [D15] "Which section is this person in, here?" — the one place that question is
 * answered, now that the section lives on the membership and not on the account.
 *
 * <p>The rule: a person's section in an organisation is the {@code section_id} of
 * their <b>approved</b> membership in that organisation. A pending or rejected
 * membership, no membership at all, or an organisation without sections all
 * answer "no section" (null / absent). Another organisation's membership is
 * never read, and neither is the unused {@code app_user.section_id} column.
 *
 * <p>Used for the {@code sender_section_id} hint snapshot of every content row
 * (the organisation of the event the content belongs to) and for the
 * {@code section} of a person listed inside an event.
 */
@Component
public class MembershipSections {

    private final OrganisationMemberRepository members;
    private final SectionRepository sections;

    public MembershipSections(OrganisationMemberRepository members, SectionRepository sections) {
        this.members = members;
        this.sections = sections;
    }

    /**
     * The section id of {@code userId}'s approved membership in
     * {@code organisationId}, or null. Null for a null organisation too (a content
     * row with no event, which stage 1 never writes).
     */
    public UUID sectionIdIn(UUID organisationId, UUID userId) {
        if (organisationId == null || userId == null) {
            return null;
        }
        return members.findByOrganisationIdAndUserId(organisationId, userId)
                .filter(member -> member.getStatus() == MembershipStatus.APPROVED)
                .map(OrganisationMember::getSectionId)
                .orElse(null);
    }

    /** {@link #sectionIdIn}, loaded as the section row; null when there is none. */
    public Section sectionIn(UUID organisationId, UUID userId) {
        UUID sectionId = sectionIdIn(organisationId, userId);
        return sectionId == null ? null : sections.findById(sectionId).orElse(null);
    }

    /**
     * The same rule for a whole list in two queries: the memberships, then their
     * sections. People without a section in that organisation are not in the map.
     */
    public Map<UUID, Section> sectionsIn(UUID organisationId, Collection<UUID> userIds) {
        if (organisationId == null || userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        List<OrganisationMember> rows = members.findByOrganisationIdAndStatusAndUserIdIn(
                organisationId, MembershipStatus.APPROVED, Set.copyOf(userIds));
        Set<UUID> sectionIds = new HashSet<>();
        for (OrganisationMember row : rows) {
            if (row.getSectionId() != null) {
                sectionIds.add(row.getSectionId());
            }
        }
        if (sectionIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Section> byId = new HashMap<>();
        sections.findAllById(sectionIds).forEach(section -> byId.put(section.getId(), section));
        Map<UUID, Section> out = new HashMap<>();
        for (OrganisationMember row : rows) {
            Section section = row.getSectionId() == null ? null : byId.get(row.getSectionId());
            if (section != null) {
                out.put(row.getUserId(), section);
            }
        }
        return out;
    }
}
