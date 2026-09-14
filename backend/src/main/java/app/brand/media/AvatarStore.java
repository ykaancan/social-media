package app.brand.media;

import java.util.Optional;

/**
 * [B10] Where a resized avatar lives. Filesystem now; the same interface is what
 * an S3-compatible store would implement when there is more than one instance or
 * a CDN in front.
 *
 * <p>The key is the file name the public URL ends in ({@code {uuid}.jpg}), never a
 * path the caller composed: nothing outside this package decides where a byte
 * array lands on disk.
 */
public interface AvatarStore {

    /** Writes the JPEG under a fresh key and returns it. */
    String store(byte[] jpeg);

    /** Best effort: a key that is already gone is not an error. */
    void delete(String key);

    /** The stored bytes, or empty when the key is unknown or malformed. */
    Optional<byte[]> read(String key);
}
