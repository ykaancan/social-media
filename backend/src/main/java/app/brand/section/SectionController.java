package app.brand.section;

import app.brand.common.Ids;
import app.brand.section.SectionDtos.SectionDetailDto;
import app.brand.section.SectionDtos.SectionSummaryDto;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /sections} — readable at any signed-in status, because the profile-setup
 * screen has to show the picker before an account is approved.
 */
@RestController
@RequestMapping("/sections")
public class SectionController {

    private final SectionService sections;

    public SectionController(SectionService sections) {
        this.sections = sections;
    }

    @GetMapping
    public List<SectionSummaryDto> list() {
        return sections.list();
    }

    @GetMapping("/{id}")
    public SectionDetailDto detail(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        // A malformed id is simply not a section anyone has: 404, not a parse error.
        return sections.detail(principal.id(), Ids.orNotFound(id, "no such section"));
    }
}
