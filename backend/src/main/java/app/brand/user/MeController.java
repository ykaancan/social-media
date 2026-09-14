package app.brand.user;

import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import app.brand.user.ProfileDtos.AvatarUploadedDto;
import app.brand.user.ProfileDtos.ProfileEditRequest;
import app.brand.user.ProfileDtos.ProfileSubmitRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The owner's own account. These are the routes the onboarding shell runs on, so
 * they are reachable at every status — {@code ApprovedMemberFilter} exempts them
 * and each rule about who may do what lives in {@link ProfileService}.
 */
@RestController
public class MeController {

    private final ProfileService profiles;

    public MeController(ProfileService profiles) {
        this.profiles = profiles;
    }

    /** Any signed-in status, including {@code banned}: the app has to be able to show it. */
    @GetMapping("/me")
    public MeDto me(@CurrentUser AppPrincipal principal) {
        return profiles.me(principal.id());
    }

    /** Sends the profile for review; the returned {@code Me} is {@code pending}. */
    @PutMapping("/me/profile")
    public MeDto submitProfile(@CurrentUser AppPrincipal principal,
                               @RequestBody(required = false) ProfileSubmitRequest request) {
        return profiles.submit(principal.id(), request);
    }

    /** Approved accounts only; name and bio, nothing else. */
    @PatchMapping("/me/profile")
    public MeDto editProfile(@CurrentUser AppPrincipal principal,
                             @RequestBody(required = false) ProfileEditRequest request) {
        return profiles.edit(principal.id(), request);
    }

    /**
     * Multipart field {@code photo}, as {@code http.ts} sends it. The 5 MB cap is
     * the container's ({@code spring.servlet.multipart.max-file-size}) and comes
     * back as 422 on {@code photo} through the exception handler.
     */
    @PostMapping(value = "/me/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AvatarUploadedDto uploadPhoto(@CurrentUser AppPrincipal principal,
                                         @RequestPart(value = "photo", required = false) MultipartFile photo) {
        return profiles.uploadPhoto(principal.id(), photo);
    }
}
