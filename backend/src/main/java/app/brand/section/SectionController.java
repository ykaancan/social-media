package app.brand.section;

import app.brand.common.Ids;
import app.brand.section.SectionDtos.SectionDetailDto;
import app.brand.section.SectionDtos.SectionSummaryDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * [D15] Sections per organisation. Both routes need a confirmed, active account
 * ({@code ActiveAccountFilter}); the section is no longer part of profile setup,
 * so neither is open to an {@code incomplete} one.
 *
 * <ul>
 *   <li>{@code GET /organisations/{id}/sections} — any active account: the
 *       section picker runs before a membership exists.</li>
 *   <li>{@code GET /sections/{id}} — approved members of the section's
 *       organisation only; anyone else 404.</li>
 * </ul>
 *
 * <p>{@code GET /sections} (every section of every organisation) is gone.
 */
@RestController
public class SectionController {

    private final SectionService sections;

    public SectionController(SectionService sections) {
        this.sections = sections;
    }

    @GetMapping("/organisations/{id}/sections")
    public List<SectionSummaryDto> listOf(@PathVariable String id) {
        // A malformed id is simply not an organisation: 404, not a parse error.
        return sections.listOf(Ids.orNotFound(id, "no such organisation"));
    }

    @GetMapping("/sections/{id}")
    public SectionDetailDto detail(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        // A malformed id is simply not a section anyone has: 404, not a parse error.
        return sections.detail(principal.id(), Ids.orNotFound(id, "no such section"));
    }
}
