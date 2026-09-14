package app.brand.event;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * Six characters from {@code ABCDEFGHJKLMNPQRSTUVWXYZ23456789} — no I, O, 0 or 1,
 * because the code is read off a projector and typed on a phone.
 *
 * <p>{@link SecureRandom}, not a sequence: a guessable code is a way into a board
 * you were not invited to, and the mock's deterministic generator is explicitly an
 * in-memory convenience, never a production one.
 */
@Component
public class JoinCodeGenerator {

    public static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public static final int LENGTH = 6;

    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    /** Uppercase, and without the spaces or dashes people add when they read a code aloud. */
    public static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replaceAll("[\\s-]", "").toUpperCase(java.util.Locale.ROOT);
    }
}
