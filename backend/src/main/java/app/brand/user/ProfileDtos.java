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
     * <p>INTERIM, step T-1 only: {@code sectionId} is optional and still stored on
     * the account. {@code tenant.ts} has no section here [D15]; step T-2 removes it.
     */
    public record ProfileSubmitRequest(String name, String sectionId, String bio) {
    }

    /** {@code PATCH /me/profile}: name and bio only — never the section, never the status. */
    public record ProfileEditRequest(String name, String bio) {
    }

    /** {@code POST /me/photo} → {@code { avatarUrl }}. */
    public record AvatarUploadedDto(String avatarUrl) {
    }
}
