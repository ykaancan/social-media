package app.brand.user;

import app.brand.config.BrandProperties;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import app.brand.user.AccountExportDtos.AccountExportDto;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The account itself, rather than the profile on it: the KVKK export, real
 * deletion, and the entitlement flags the app reads before it decides what a
 * locked card looks like.
 *
 * <p>Two different status rules, both enforced by {@code ApprovedMemberFilter}
 * from its path list and neither re-checked here:
 *
 * <ul>
 *   <li>{@code DELETE /me} is on the any-status path {@code /me}, so a
 *       {@code pending}, {@code rejected} or {@code banned} person can delete
 *       their account. Someone who never got in still owns their data.</li>
 *   <li>{@code GET /me/export} and {@code GET /me/entitlements} are ordinary
 *       member routes: {@code 403 approval_required} until the account is
 *       approved.</li>
 * </ul>
 */
@RestController
public class AccountController {

    private final AccountExportService exports;
    private final AccountDeletionService deletions;
    private final BrandProperties properties;

    public AccountController(AccountExportService exports,
                             AccountDeletionService deletions,
                             BrandProperties properties) {
        this.exports = exports;
        this.deletions = deletions;
        this.properties = properties;
    }

    /** Everything this account owns. Rate-limited to one per minute. */
    @GetMapping("/me/export")
    public AccountExportDto export(@CurrentUser AppPrincipal principal) {
        return exports.export(principal.id());
    }

    /** Real deletion [KVKK]. 204, and the next request with this token is 401. */
    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser AppPrincipal principal) {
        deletions.delete(principal.id());
    }

    /**
     * Brief §3: the entitlement layer, present and switched off. The app asks once
     * and renders accordingly [D3]; stage 1 always answers with every gate off, and
     * nothing on the server gates on these values yet.
     */
    @GetMapping("/me/entitlements")
    public BrandProperties.Entitlements entitlements(@CurrentUser AppPrincipal principal) {
        return properties.entitlements();
    }
}
