package app.brand.section;

import java.util.UUID;

/** One row of the "members per section" roll-up behind {@code GET /organisations/{id}/sections}. */
public record SectionMemberCount(UUID sectionId, long members) {
}
