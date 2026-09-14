package app.brand.settings;

import app.brand.content.MessageSenderDto;
import app.brand.safety.WritingPolicy;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** The settings DTOs from {@code app/src/api/settings.ts}. */
public final class SettingsDtos {

    private SettingsDtos() {
    }

    /**
     * {@code AccountSettings}.
     *
     * <p>{@code sectionChangeAvailableAt} is {@code string | null} in the app — not
     * an optional key — so it is the one field here that is emitted even when it
     * is null, against the global {@code non_null} inclusion. Null means "no
     * section change has ever been made"; a value in the past means the cooldown
     * [D7] has already run out.
     */
    public record AccountSettingsDto(
            WritingPolicy writingPolicy,
            List<String> mutedWords,
            NotificationsDto notifications,
            @JsonInclude(JsonInclude.Include.ALWAYS) String sectionChangeAvailableAt) {
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
