package app.brand.content;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * {@code MessageSender} in {@code app/src/api/messages.ts} — the only shape in
 * which a sender ever reaches a member.
 *
 * <p>Absent is meaningful: {@code anonymous} carries nothing but the level, and
 * {@code hint} carries only the keys the sender allowed. Jackson's {@code non_null}
 * inclusion drops the rest, so the client sees exactly what the optional
 * properties declare.
 */
public record MessageSenderDto(AnonymityLevel level, String name, String avatar, Hints hints) {

    /** Only the chips the sender allowed; each value is derived, never client-supplied. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Hints(String section, String country, String letter) {
    }

    public static MessageSenderDto anonymous() {
        return new MessageSenderDto(AnonymityLevel.ANONYMOUS, null, null, null);
    }

    public static MessageSenderDto named(String name, String avatar) {
        return new MessageSenderDto(AnonymityLevel.NAMED, name, avatar, null);
    }

    public static MessageSenderDto hint(Hints hints) {
        return new MessageSenderDto(AnonymityLevel.HINT, null, null, hints);
    }
}
