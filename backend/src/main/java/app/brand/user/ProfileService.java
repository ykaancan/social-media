package app.brand.user;

import app.brand.common.ApiException;
import app.brand.media.AvatarImageProcessor;
import app.brand.media.AvatarStore;
import app.brand.section.Section;
import app.brand.section.SectionRepository;
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
 * The owner's own account: read it, send it for review, edit it once approved,
 * replace the photo.
 *
 * <p>The rules are {@code mock.ts}'s, unchanged: a {@code banned} account is
 * refused outright, an {@code approved} one is told to use the edit and
 * section-change routes instead of resubmitting, and everything else — including a
 * {@code rejected} account resubmitting [D7] — lands back in {@code pending}.
 * There is no approved-but-read-only state to represent.
 */
@Service
public class ProfileService {

    /** {@code LIMITS} in {@code types.ts}; the client mirrors them, the server owns them. */
    public static final int NAME_MAX = 40;
    public static final int BIO_MAX = 80;

    private final AppUserRepository users;
    private final SectionRepository sections;
    private final MeMapper meMapper;
    private final AvatarStore avatars;
    private final AvatarImageProcessor imageProcessor;
    private final Clock clock;

    public ProfileService(AppUserRepository users,
                          SectionRepository sections,
                          MeMapper meMapper,
                          AvatarStore avatars,
                          AvatarImageProcessor imageProcessor,
                          Clock clock) {
        this.users = users;
        this.sections = sections;
        this.meMapper = meMapper;
        this.avatars = avatars;
        this.imageProcessor = imageProcessor;
        this.clock = clock;
    }

    /** Any signed-in status: this is what the Pending screen polls. */
    @Transactional(readOnly = true)
    public MeDto me(UUID userId) {
        return meMapper.toMe(load(userId));
    }

    /** Sends the profile for review. The returned {@code Me} is always {@code pending}. */
    @Transactional
    public MeDto submit(UUID userId, ProfileSubmitRequest request) {
        AppUser user = load(userId);
        if (user.getStatus() == AccountStatus.BANNED) {
            throw ApiException.forbidden("account_restricted", "account is restricted");
        }
        if (user.getStatus() == AccountStatus.APPROVED) {
            // Changing an approved profile is PATCH /me/profile, and changing the
            // section is PUT /me/section [D7] — neither re-enters the queue.
            throw ApiException.validation("use profile editing and section change", null);
        }

        String name = requireName(request == null ? null : request.name());
        String bio = optionalBio(request == null ? null : request.bio());
        Section section = requireSection(request == null ? null : request.sectionId());

        user.setName(name);
        user.setBio(bio);
        user.setSection(section);
        // [D7] A rejected account resubmitting returns to pending, exactly like a
        // first send: rejection is not a dead end.
        user.setStatus(AccountStatus.PENDING);
        user.setSubmittedAt(clock.instant());
        // Whatever photo the account already has is kept: the app uploads a new one
        // to POST /me/photo before this call, or sends none at all.
        return meMapper.toMe(users.save(user));
    }

    /** Approved accounts only, and never the section or the status. */
    @Transactional
    public MeDto edit(UUID userId, ProfileEditRequest request) {
        AppUser user = load(userId);
        requireApproved(user);

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

    private static void requireApproved(AppUser user) {
        if (user.getStatus() != AccountStatus.APPROVED) {
            throw ApiException.forbidden("approval_required", "account is not approved");
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

    private Section requireSection(String rawId) {
        UUID id;
        try {
            id = UUID.fromString(rawId == null ? "" : rawId.trim());
        } catch (IllegalArgumentException ex) {
            throw ApiException.validation("unknown section", "sectionId");
        }
        return sections.findById(id)
                .orElseThrow(() -> ApiException.validation("unknown section", "sectionId"));
    }
}
