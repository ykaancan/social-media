package app.brand.media;

import app.brand.common.ApiException;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * [B10] Serves the stored avatars. Public by design — an avatar URL is rendered
 * straight into an {@code <Image>} by the app, which sends no Authorization
 * header for images.
 *
 * <p>The file name is a fresh UUID on every upload, so the bytes behind a URL
 * never change and the response can be cached for a year. Replacing a photo
 * yields a new URL; the old file is deleted.
 */
@RestController
public class MediaController {

    private final AvatarStore avatars;

    public MediaController(AvatarStore avatars) {
        this.avatars = avatars;
    }

    @GetMapping("/media/avatars/{key}")
    public ResponseEntity<byte[]> avatar(@PathVariable String key) {
        return avatars.read(key)
                .map(bytes -> ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .body(bytes))
                // [B14] even here the not-found body is {code, message}: there is one
                // error shape in this product and no endpoint invents a second.
                .orElseThrow(() -> ApiException.notFound("no such avatar"));
    }
}
