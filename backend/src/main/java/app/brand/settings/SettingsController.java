package app.brand.settings;

import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import app.brand.settings.SettingsDtos.AccountSettingsDto;
import app.brand.settings.SettingsDtos.BlockedEntryDto;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Settings and the blocked list (brief §4.8). Approved accounts only — these are
 * not onboarding routes, so {@code ApprovedMemberFilter} answers a pending caller
 * with {@code 403 approval_required} before anything here runs.
 *
 * <p>{@code PUT /me/section}, the export and account deletion are step B-5.
 */
@RestController
public class SettingsController {

    private final SettingsService settings;

    public SettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping("/me/settings")
    public AccountSettingsDto settings(@CurrentUser AppPrincipal principal) {
        return settings.read(principal.id());
    }

    /** Partial and atomic; the full {@code AccountSettings} comes back either way. */
    @PatchMapping("/me/settings")
    public AccountSettingsDto update(@CurrentUser AppPrincipal principal,
                                     @RequestBody(required = false) JsonNode body) {
        return settings.update(principal.id(), body);
    }

    @GetMapping("/me/blocks")
    public List<BlockedEntryDto> blocked(@CurrentUser AppPrincipal principal) {
        return settings.blocked(principal.id());
    }

    /** The id is the opaque block row id, never a user id [D6]. */
    @DeleteMapping("/me/blocks/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unblock(@CurrentUser AppPrincipal principal, @PathVariable String id) {
        settings.unblock(principal.id(), id);
    }
}
