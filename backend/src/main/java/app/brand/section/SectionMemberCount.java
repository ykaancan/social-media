package app.brand.section;

import java.util.UUID;

/** One row of the "approved members per section" roll-up behind {@code GET /sections}. */
public record SectionMemberCount(UUID sectionId, long members) {
}
