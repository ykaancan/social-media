package app.brand.user;

import app.brand.content.MessageSenderDto;
import app.brand.message.MessageDtos.InboxMessageDto;
import app.brand.settings.SettingsDtos.AccountSettingsDto;
import app.brand.settings.SettingsDtos.BlockedEntryDto;
import app.brand.thread.ThreadDtos.ThreadMessageDto;
import java.time.Instant;
import java.util.List;

/**
 * {@code GET /me/export} — the KVKK data export (brief §5), shaped exactly as
 * {@code mock.ts}'s {@code exportAccount}.
 *
 * <p>Every section here is rendered by the same code that renders the live
 * surfaces, which is the whole privacy argument: the export cannot show more than
 * the app does, because it is not a second rendering of the data. There is no
 * {@code senderId} anywhere, no user id of anyone but the owner, no email but the
 * owner's, no token, and no hint <em>boolean</em> — a hint is exported as the
 * value the reader was already allowed to see, never as the flags behind it.
 *
 * <p>What the owner does get that no screen shows is their own <b>sent</b> content
 * (messages and posts), rendered at the anonymity each row was written at, so they
 * can see what they said and how it appeared.
 */
public final class AccountExportDtos {

    private AccountExportDtos() {
    }

    /** The whole export. */
    public record AccountExportDto(
            MeDto profile,
            AccountSettingsDto settings,
            List<BlockedEntryDto> blocks,
            List<InboxMessageDto> inbox,
            List<SentContentDto> sentMessages,
            List<SentContentDto> posts,
            List<ExportedThreadDto> threads,
            List<SectionChangeDto> sectionChanges) {
    }

    /**
     * One thing the owner wrote — a wall message or a board post. {@code sender} is
     * rendered from that row's own anonymity [D5]/[B4]: it is how the card looked
     * to whoever read it, not how this account presents itself today.
     */
    public record SentContentDto(String text, MessageSenderDto sender, Instant createdAt) {
    }

    /** A conversation the owner is in: the card it started from, then every bubble. */
    public record ExportedThreadDto(ThreadOriginDto origin, List<ThreadMessageDto> messages) {
    }

    /** The origin card, text and sender only — the id is a handle the export has no use for. */
    public record ThreadOriginDto(String text, MessageSenderDto sender) {
    }

    /**
     * [D7] One logged section move, by <b>name</b>: an export is read by a person,
     * and a section id is not something they can resolve. {@code from} is null for
     * an account that had no section before the move.
     */
    public record SectionChangeDto(String from, String to, Instant at) {
    }
}
