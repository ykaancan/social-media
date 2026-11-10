package app.brand.user;

import app.brand.common.ApiException;
import app.brand.media.AvatarImageProcessor;
import app.brand.media.AvatarStore;
import app.brand.user.ProfileDtos.AvatarUploadedDto;
import app.brand.user.ProfileDtos.ProfileEditRequest;
import app.brand.user.ProfileDtos.ProfileSubmitRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * The owner's own account: read it, send it, edit it once active, replace the
 * photo.
 *
 * <p>[D14] Sending the profile makes the account {@code active}: nobody approves
 * an account any more, approval belongs to an organisation's membership. A
 * {@code banned} account is refused outright, and an {@code active} one is told to
 * use the edit and section-change routes instead of sending again.
 */
@Service
public class ProfileService {

    /** {@code LIMITS} in {@code types.ts}; the client mirrors them, the server owns them. */
    public static final int NAME_MAX = 40;
    public static final int BIO_MAX = 80;

    private final AppUserRepository users;
    private final MeMapper meMapper;
    private final AvatarStore avatars;
    private final AvatarImageProcessor imageProcessor;
    private final Clock clock;

    public ProfileService(AppUserRepository users,
                          MeMapper meMapper,
                          AvatarStore avatars,
                          AvatarImageProcessor imageProcessor,
                          Clock clock) {
        this.users = users;
        this.meMapper = meMapper;
        this.avatars = avatars;
        this.imageProcessor = imageProcessor;
        this.clock = clock;
    }

    /** Any signed-in status, confirmed or not. */
    @Transactional(readOnly = true)
    public MeDto me(UUID userId) {
        return meMapper.toMe(load(userId));
    }

    /** Sends the profile. The returned {@code Me} is always {@code active} [D14]. */
    @Transactional
    public MeDto submit(UUID userId, ProfileSubmitRequest request) {
        AppUser user = load(userId);
        if (user.getStatus() == AccountStatus.BANNED) {
            throw ApiException.forbidden("account_restricted", "account is restricted");
        }
        if (user.getStatus() == AccountStatus.ACTIVE) {
            // Changing an active profile is PATCH /me/profile, and changing a
            // section is PUT /me/memberships/{organisationId}/section [D7]/[D15].
            throw ApiException.validation("use profile editing and section change", null);
        }

        String name = requireName(request == null ? null : request.name());
        String bio = optionalBio(request == null ? null : request.bio());
        user.setName(name);
        user.setBio(bio);
        user.setStatus(AccountStatus.ACTIVE);
        user.setSubmittedAt(clock.instant());
        // Whatever photo the account already has is kept: the app uploads a new one
        // to POST /me/photo before this call, or sends none at all.
        return meMapper.toMe(users.save(user));
    }

    /** Active accounts only, and never the section or the status. */
    @Transactional
    public MeDto edit(UUID userId, ProfileEditRequest request) {
        AppUser user = load(userId);
        requireActive(user);

        user.setName(requireName(request == null ? null : request.name()));
        user.setBio(optionalBio(request == null ? null : request.bio()));
        return meMapper.toMe(users.save(user));
    }

    /**
     * [B10] The one image endpoint stage 1 allows. The bytes are re-encoded before
     * anything is stored, so what lands on disk is a plain JPEG with no metadata,
     * whatever the phone sent.
     */
    @Transactional
    public AvatarUploadedDto uploadPhoto(UUID userId, MultipartFile photo) {
        AppUser user = load(userId);
        if (user.getStatus() == AccountStatus.BANNED) {
            throw ApiException.forbidden("account_restricted", "account is restricted");
        }
        if (photo == null || photo.isEmpty()) {
            throw ApiException.validation("photo is required", "photo");
        }

        byte[] source;
        try {
            source = photo.getBytes();
        } catch (IOException ex) {
            throw ApiException.validation("photo could not be read", "photo");
        }

        String key = avatars.store(imageProcessor.toAvatarJpeg(source));
        String previous = user.getAvatarKey();
        user.setAvatarKey(key);
        users.save(user);
        if (previous != null && !previous.equals(key)) {
            // Only after the row points at the new file: a crash between the two
            // leaves an orphan, never a profile pointing at a file that is gone.
            avatars.delete(previous);
        }
        return new AvatarUploadedDto(meMapper.avatarUrl(key));
    }

    private AppUser load(UUID userId) {
        // The token verified, so the row existed a moment ago; a miss means the
        // account was deleted mid-request and the session is over.
        return users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("unauthorized", "account no longer exists"));
    }

    /** Same code as {@code ActiveAccountFilter} answers on member routes. */
    private static void requireActive(AppUser user) {
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw ApiException.forbidden("account_not_active", "account is not active");
        }
    }

    private static String requireName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty()) {
            throw ApiException.validation("name is required", "name");
        }
        if (name.length() > NAME_MAX) {
            throw ApiException.validation("name too long", "name");
        }
        return name;
    }

    /** An empty bio is absent, never an empty string: {@code Me.bio} is optional. */
    private static String optionalBio(String raw) {
        String bio = raw == null ? "" : raw.trim();
        if (bio.length() > BIO_MAX) {
            throw ApiException.validation("bio too long", "bio");
        }
        return bio.isEmpty() ? null : bio;
    }
}
