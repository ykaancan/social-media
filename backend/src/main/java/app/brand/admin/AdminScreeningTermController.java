package app.brand.admin;

import app.brand.admin.AdminReportDtos.AddScreeningTermRequest;
import app.brand.admin.AdminReportDtos.ScreeningTermDto;
import app.brand.safety.ScreeningTerm;
import app.brand.safety.ScreeningTermService;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * [B9] The screening list, managed from the admin page — the lists are data, never
 * a constant in the source.
 *
 * <p>{@code normalized} is deliberately not on the wire in either direction: the
 * admin types a word, the server folds it through the one normaliser, and showing
 * the folded form back would only invite someone to "fix" it.
 */
@RestController
@RequestMapping("/admin/api/screening-terms")
@PreAuthorize("hasRole('SUPER_ADMIN') and authentication.principal.approved")
public class AdminScreeningTermController {

    private final ScreeningTermService service;

    public AdminScreeningTermController(ScreeningTermService service) {
        this.service = service;
    }

    @GetMapping
    public List<ScreeningTermDto> list() {
        return service.list().stream().map(AdminScreeningTermController::toDto).toList();
    }

    @PostMapping
    public ScreeningTermDto add(@CurrentUser AppPrincipal admin,
                                @RequestBody AddScreeningTermRequest request) {
        return toDto(service.add(admin.id(),
                request == null ? null : request.term(),
                request == null ? null : request.severity()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private static ScreeningTermDto toDto(ScreeningTerm term) {
        return new ScreeningTermDto(term.getId().toString(), term.getTerm(),
                term.getSeverity(), term.getCreatedAt());
    }
}
