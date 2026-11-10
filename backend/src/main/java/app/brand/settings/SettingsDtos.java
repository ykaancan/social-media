package app.brand.settings;

import app.brand.content.MessageSenderDto;
import app.brand.safety.WritingPolicy;
import java.util.List;

/** The settings DTOs from {@code app/src/api/settings.ts}. */
public final class SettingsDtos {

    private SettingsDtos() {
    }

    /**
     * {@code AccountSettings}.
     *
     * <p>[D7]/[D15] There is no {@code sectionChangeAvailableAt} here: the 30 days
     * are counted per organisation, so the date lives on each membership in
     * {@code Me.memberships}.
     */
    public record AccountSettingsDto(
            WritingPolicy writingPolicy,
            List<String> mutedWords,
            NotificationsDto notifications) {
    }

    /** {@code NotificationPreferences}: three booleans, all three always present. */
    public record NotificationsDto(boolean inbox, boolean threads, boolean boardMentions) {
    }

    /**
     * {@code BlockedEntry}. {@code id} is the block row's own id — the opaque
     * handle {@code DELETE /me/blocks/{id}} takes — and never a user id, so a
     * blocker cannot learn who an anonymous sender was by reading their own
     * blocked list [D6].
     */
    public record BlockedEntryDto(String id, MessageSenderDto sender) {
    }
}
