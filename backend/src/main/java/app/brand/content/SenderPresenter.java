package app.brand.content;

import app.brand.section.Section;
import app.brand.user.AppUser;
import app.brand.user.MeMapper;
import org.springframework.stereotype.Component;

/**
 * The one place anonymity columns become something a member may see.
 *
 * <p>The split is [B4]'s: <em>chips come from the snapshot</em>
 * ({@code sender_section_id} — the section the sender was in when they sent, so
 * a later change [D7] does not rewrite history and the country hint stays
 * checkable against a real section [D11]); <em>name, avatar and first letter
 * come from the live user row</em>, because {@code named} means "this person"
 * and a renamed person is still that person.
 *
 * <p>Nothing here can emit an id. A caller that wants to leak one has to go
 * around this class, and no member endpoint does.
 */
@Component
public class SenderPresenter {

    private final MeMapper meMapper;

    public SenderPresenter(MeMapper meMapper) {
        this.meMapper = meMapper;
    }

    /**
     * @param anonymity       the content row's anonymity columns
     * @param sender          the live {@code app_user} row behind the content
     * @param snapshotSection the section {@code anonymity.senderSectionId} points at,
     *                        already loaded; null only if the sender had no section
     */
    public MessageSenderDto present(Anonymity anonymity, AppUser sender, Section snapshotSection) {
        if (anonymity == null || anonymity.level() == null) {
            return MessageSenderDto.anonymous();
        }
        return switch (anonymity.level()) {
            case ANONYMOUS -> MessageSenderDto.anonymous();
            case NAMED -> MessageSenderDto.named(
                    sender == null ? null : sender.getName(),
                    sender == null ? null : meMapper.avatarUrl(sender.getAvatarKey()));
            case HINT -> MessageSenderDto.hint(new MessageSenderDto.Hints(
                    anonymity.hintSection() && snapshotSection != null ? snapshotSection.getName() : null,
                    anonymity.hintCountry() && snapshotSection != null
                            ? snapshotSection.getCountry().getName() : null,
                    anonymity.hintLetter() ? firstLetter(sender) : null));
        };
    }

    /**
     * The first <em>code point</em>, not the first char: a name that starts with a
     * character outside the basic plane must not be cut in half, and the app
     * derives the same letter with {@code Array.from(name)[0]}.
     */
    private static String firstLetter(AppUser sender) {
        String name = sender == null ? null : sender.getName();
        if (name == null || name.isEmpty()) {
            return null;
        }
        return new String(Character.toChars(name.codePointAt(0)));
    }
}
