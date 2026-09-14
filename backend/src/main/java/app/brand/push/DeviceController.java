package app.brand.push;

import app.brand.push.PushDtos.RegisterDeviceRequest;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * [B8] Device registration. Approved accounts only — {@code ApprovedMemberFilter}
 * answers a pending caller with {@code 403 approval_required} before anything here
 * runs, and a pending account has nothing to be notified about except its own
 * approval, which the app is already polling {@code GET /me} for.
 *
 * <p>Both routes answer 204 and return nothing. There is no {@code GET}: the list
 * of phones an account has is not a product surface, and the app already knows its
 * own token.
 */
@RestController
public class DeviceController {

    private final DeviceService devices;

    public DeviceController(DeviceService devices) {
        this.devices = devices;
    }

    /** Upsert by token; a token that moves between accounts re-binds to the caller. */
    @PutMapping("/me/devices")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void register(@CurrentUser AppPrincipal principal,
                         @RequestBody(required = false) RegisterDeviceRequest body) {
        devices.register(principal.id(), body);
    }

    /** Sign-out. Best effort by design: the app does not wait for it. */
    @DeleteMapping("/me/devices/{token}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unregister(@CurrentUser AppPrincipal principal, @PathVariable String token) {
        devices.unregister(principal.id(), token);
    }
}
