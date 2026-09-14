package app.brand.admin;

import app.brand.admin.AdminReportDtos.FlaggedDetailDto;
import app.brand.admin.AdminReportDtos.FlaggedRowDto;
import app.brand.admin.AdminReportDtos.ReportDetailDto;
import app.brand.admin.AdminReportDtos.ReportRowDto;
import app.brand.safety.Report;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Brief §4.9 — the reports queue and the flagged list [B9], behind the admin page.
 *
 * <p>The access rule is {@link AdminUserController}'s, stated the same way and for
 * the same reason: {@code super_admin} and {@code approved}, as method security on
 * the class, so a promotion, a demotion or a ban takes effect on the next request
 * without a change in {@code SecurityConfig}.
 *
 * <p>The split between {@link #list} and {@link #detail} is the privacy contract of
 * the whole product: the list is triage and carries no identity; the detail names
 * the sender and writes an {@code identity_view} audit row first. They are two
 * endpoints rather than one with a flag exactly so nothing can accidentally opt
 * into the audited read.
 */
@RestController
@RequestMapping("/admin/api")
@PreAuthorize("hasRole('SUPER_ADMIN') and authentication.principal.approved")
public class AdminReportController {

    private final AdminReportService service;

    public AdminReportController(AdminReportService service) {
        this.service = service;
    }

    /** Defaults to the queue an admin opens the page for. {@code all} lists every status. */
    @GetMapping("/reports")
    public List<ReportRowDto> list(@RequestParam(name = "status", defaultValue = Report.OPEN) String status) {
        return service.list(status);
    }

    /** The audited identity view. Every call writes a row; there is no dedupe. */
    @GetMapping("/reports/{id}")
    public ReportDetailDto detail(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.detail(admin.id(), id);
    }

    @PostMapping("/reports/{id}/dismiss")
    public ReportRowDto dismiss(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.dismiss(admin.id(), id);
    }

    @PostMapping("/reports/{id}/hide")
    public ReportRowDto hide(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.hide(admin.id(), id);
    }

    @PostMapping("/reports/{id}/warn")
    public ReportRowDto warn(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.warn(admin.id(), id);
    }

    @PostMapping("/reports/{id}/ban")
    public ReportRowDto ban(@CurrentUser AppPrincipal admin, @PathVariable UUID id) {
        return service.ban(admin.id(), id);
    }

    /** [B9] Delivered with an acknowledged soft match — a list to read, not a queue. */
    @GetMapping("/flagged")
    public List<FlaggedRowDto> flagged() {
        return service.flagged();
    }

    @GetMapping("/flagged/{messageId}")
    public FlaggedDetailDto flaggedDetail(@CurrentUser AppPrincipal admin, @PathVariable UUID messageId) {
        return service.flaggedDetail(admin.id(), messageId);
    }
}
