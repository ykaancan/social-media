package app.brand.common;

import java.util.UUID;

/**
 * Path variables and body fields are opaque strings to the app [B2], so every
 * surface has to turn one back into a {@link UUID} — and every surface had its own
 * two-line {@code try/catch} for it.
 *
 * <p>There is only one rule to get right, and it is a privacy rule rather than a
 * parsing one: <b>a string that was never a UUID is not a parse error, it is
 * simply not anything the caller has</b>. A 400 would tell a probe that the id
 * space is worth guessing at; a 404 (or, where the client is filling in a form,
 * the same 422 that an unknown-but-well-formed id gets) tells them nothing.
 */
public final class Ids {

    private Ids() {
    }

    /** The id, or null when the string is not one. The caller decides what that means. */
    public static UUID orNull(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException notAnId) {
            return null;
        }
    }

    /**
     * The id, or 404 with the caller's own wording — "no such event", "no such
     * wall", "no such block". The message is for logs; the app never shows it [B14].
     */
    public static UUID orNotFound(String raw, String message) {
        UUID id = orNull(raw);
        if (id == null) {
            throw ApiException.notFound(message);
        }
        return id;
    }
}
