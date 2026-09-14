package app.brand.section;

import app.brand.user.PersonDto;
import java.util.List;

/** The two section DTOs from {@code types.ts}. */
public final class SectionDtos {

    private SectionDtos() {
    }

    /**
     * {@code SectionSummary}. {@code memberCount} is the real number of approved
     * members and may be 0 — the section page renders it verbatim and nothing in
     * this product ever invents a count (principle 4).
     */
    public record SectionSummaryDto(String id, String name, String country, long memberCount) {
    }

    /**
     * {@code SectionDetail}. {@code roster} is the page the server chose (the viewer
     * first in their own section); {@code rosterTotal} is what that page is drawn
     * from, so "and N more" is {@code rosterTotal - roster.length} and never a guess.
     */
    public record SectionDetailDto(
            String id,
            String name,
            String country,
            long memberCount,
            List<PersonDto> roster,
            long rosterTotal) {
    }
}
