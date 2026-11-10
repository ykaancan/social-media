package app.brand.user;

import app.brand.config.BrandProperties;
import app.brand.organisation.MembershipReader;
import app.brand.section.Section;
import org.springframework.stereotype.Component;

/**
 * The one place an {@link AppUser} becomes something a client may see.
 *
 * <p>It never copies {@code passwordHash}, {@code inviterId}, {@code approvedBy}
 * or any other internal column: no member DTO in this product exposes an identity
 * the viewer was not meant to have.
 */
@Component
public class MeMapper {

    /** [B10] Avatars are served from here by the backend. */
    public static final String AVATAR_PATH = "/media/avatars/";

    private final String publicBaseUrl;
    private final MembershipReader memberships;

    public MeMapper(BrandProperties properties, MembershipReader memberships) {
        this.publicBaseUrl = properties.publicBaseUrl();
        this.memberships = memberships;
    }

    public MeDto toMe(AppUser user) {
        return new MeDto(
                user.getId().toString(),
                user.getEmail(),
                user.isEmailConfirmed(),
                user.getStatus(),
                user.getRole(),
                user.getName(),
                user.getBio(),
                avatarUrl(user.getAvatarKey()),
                // [D14] the caller's own memberships, read by the caller's own id.
                memberships.of(user.getId()));
    }

    public SectionRefDto toSectionRef(Section section) {
        if (section == null) {
            return null;
        }
        return new SectionRefDto(
                section.getId().toString(),
                section.getName(),
                section.getCountry().getName());
    }

    /** Absolute, because the app renders it straight into an {@code <Image>}. */
    public String avatarUrl(String avatarKey) {
        return avatarKey == null ? null : publicBaseUrl + AVATAR_PATH + avatarKey;
    }
}
