package app.brand.media;

import app.brand.config.BrandProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * [B10] Avatars are files on disk under {@code brand.media.dir}/avatars, one JPEG
 * per key, and the directory is configuration so a test can point at a temporary
 * folder and production at a mounted volume.
 *
 * <p>A key is always a UUID plus {@code .jpg} — checked on the way in and on the
 * way out, so a crafted name can never walk out of the directory.
 */
@Component
public class FilesystemAvatarStore implements AvatarStore {

    /** The only shape a key ever has; anything else is not ours. */
    private static final Pattern KEY = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg");

    private static final Logger log = LoggerFactory.getLogger(FilesystemAvatarStore.class);

    private final Path directory;

    public FilesystemAvatarStore(BrandProperties properties) {
        this.directory = Path.of(properties.media().dir()).toAbsolutePath().normalize().resolve("avatars");
    }

    @Override
    public String store(byte[] jpeg) {
        String key = UUID.randomUUID() + ".jpg";
        try {
            Files.createDirectories(directory);
            // Written beside the target and moved, so a reader never sees a
            // half-written file under a URL that is already on someone's profile.
            Path temp = Files.createTempFile(directory, "upload-", ".tmp");
            Files.write(temp, jpeg);
            Files.move(temp, directory.resolve(key), StandardCopyOption.REPLACE_EXISTING);
            return key;
        } catch (IOException ex) {
            throw new UncheckedIOException("could not store avatar", ex);
        }
    }

    @Override
    public void delete(String key) {
        resolve(key).ifPresent(path -> {
            try {
                Files.deleteIfExists(path);
            } catch (IOException ex) {
                // The new avatar is already stored and the row already points at it;
                // a leftover file is a housekeeping matter, not a failed request.
                log.warn("could not delete avatar {}", key, ex);
            }
        });
    }

    @Override
    public Optional<byte[]> read(String key) {
        return resolve(key).filter(Files::isRegularFile).map(path -> {
            try {
                return Files.readAllBytes(path);
            } catch (IOException ex) {
                log.warn("could not read avatar {}", key, ex);
                return null;
            }
        });
    }

    private Optional<Path> resolve(String key) {
        if (key == null || !KEY.matcher(key).matches()) {
            return Optional.empty();
        }
        return Optional.of(directory.resolve(key));
    }
}
