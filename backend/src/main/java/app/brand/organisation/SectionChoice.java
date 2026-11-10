package app.brand.organisation;

import app.brand.common.ApiException;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * [D15] The one rule for a section sent with a membership: required, and a
 * section of <em>that</em> organisation, iff the organisation has sections;
 * absent otherwise. Every miss is {@code 422} on {@code sectionId}.
 *
 * <p>Used by {@code POST /organisations/join} and by assigning an organisation
 * admin who has no membership yet, so the two cannot drift apart.
 */
@Component
public class SectionChoice {

    private final SectionRepository sections;

    public SectionChoice(SectionRepository sections) {
        this.sections = sections;
    }

    /** The section id to store, or null for an organisation without sections. */
    public UUID sectionFor(Organisation organisation, String rawSectionId) {
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
}
