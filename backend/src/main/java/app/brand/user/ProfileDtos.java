package app.brand.user;

/**
 * The bodies of the three profile routes. Deliberately plain records with no bean
 * validation annotations: every rule here has a {@code field} the app points an
 * input at, and {@link ProfileService} owns them in one readable order — the same
 * order {@code mock.ts} uses, so client and server fail on the same thing first.
 */
public final class ProfileDtos {

    private ProfileDtos() {
    }

    /**
     * {@code ProfileRequest} in {@code types.ts} minus {@code photoUri}: the app
     * uploads the picture to {@code POST /me/photo} first, so this is always JSON.
     *
     * <p>[D15] No section: a section belongs to a membership, picked when the
     * person enters an organisation that has sections. A {@code sectionId} key in
     * the body is ignored like any other unknown key.
     */
    public record ProfileSubmitRequest(String name, String bio) {
    }

    /** {@code PATCH /me/profile}: name and bio only — never the section, never the status. */
    public record ProfileEditRequest(String name, String bio) {
    }

    /** {@code POST /me/photo} → {@code { avatarUrl }}. */
    public record AvatarUploadedDto(String avatarUrl) {
    }
}
