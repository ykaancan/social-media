package app.brand.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * CLAUDE.md: every user-facing string exists with the same key in English and in
 * Turkish, from day one. A push body is user-facing — it is the only copy the
 * server writes on somebody's lock screen — so the two bundles are checked against
 * each other, and against the kinds that actually exist.
 *
 * <p>It reads the property files rather than the {@code MessageSource}, because a
 * missing Turkish key does not fail a lookup (it falls back to English); it just
 * quietly ships English to a Turkish phone, which is exactly the bug worth failing
 * the build over.
 */
class PushCopyTest {

    @Test
    @DisplayName("every kind has a title and a body, in both languages, with the same keys")
    void bothBundlesCoverEveryKind() throws IOException {
        Properties english = bundle("messages_en.properties");
        Properties turkish = bundle("messages_tr.properties");

        for (PushKind kind : PushKind.values()) {
            assertThat(english.getProperty(kind.titleKey()))
                    .as("English title for %s", kind.wire()).isNotBlank();
            assertThat(english.getProperty(kind.bodyKey()))
                    .as("English body for %s", kind.wire()).isNotBlank();
        }

        assertThat(pushKeys(turkish))
                .as("the Turkish bundle has exactly the English push keys")
                .isEqualTo(pushKeys(english));
    }

    @Test
    @DisplayName("no push body names a person, and none of them carries message text")
    void copyStaysAnonymous() throws IOException {
        // {0} is the event name and the only argument any body takes. A second
        // placeholder would mean something else was passed in — a name, a hint, a
        // sender — which is exactly what a notification must never carry.
        for (Properties bundle : List.of(bundle("messages_en.properties"),
                bundle("messages_tr.properties"))) {
            for (String key : pushKeys(bundle)) {
                String value = bundle.getProperty(key);
                assertThat(value).as(key).doesNotContain("{1}");
            }
        }
    }

    private static Set<String> pushKeys(Properties bundle) {
        Set<String> keys = new TreeSet<>();
        for (String key : bundle.stringPropertyNames()) {
            if (key.startsWith("push.")) {
                keys.add(key);
            }
        }
        return keys;
    }

    private static Properties bundle(String name) throws IOException {
        Properties properties = new Properties();
        try (InputStream stream = PushCopyTest.class.getClassLoader().getResourceAsStream(name)) {
            assertThat(stream).as(name).isNotNull();
            properties.load(new InputStreamReader(stream, StandardCharsets.UTF_8));
        }
        return properties;
    }
}
