package app.brand.media;

import app.brand.common.ApiException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;

/**
 * [B10] Turns whatever the phone sent into the one thing this product stores: a
 * square-boxed JPEG, no bigger than 512×512, quality 85, with no metadata.
 *
 * <p>The file type is decided by the first bytes, never by the declared content
 * type: a client can call a text file {@code image/jpeg}, and the multipart part's
 * own header is not evidence of anything. Re-encoding is also what strips EXIF —
 * location and camera data never survive into a file the whole event can fetch.
 */
@Component
public class AvatarImageProcessor {

    /** The long edge of the stored avatar. Smaller pictures are never enlarged. */
    public static final int MAX_EDGE = 512;

    private static final float QUALITY = 0.85f;

    /** A decode bomb guard: no real profile photo is anywhere near this. */
    private static final int MAX_SOURCE_EDGE = 10_000;

    private static final String FIELD = "photo";

    /**
     * @return JPEG bytes ready to store
     * @throws ApiException 422 on {@code photo} when the bytes are not a supported
     *                      image, or are one this JVM cannot decode
     */
    public byte[] toAvatarJpeg(byte[] source) {
        if (!isSupportedImage(source)) {
            throw ApiException.validation("photo must be a JPEG, PNG or WebP image", FIELD);
        }
        BufferedImage decoded = decode(source);
        BufferedImage flattened = flatten(decoded);

        double scale = scaleFor(flattened.getWidth(), flattened.getHeight());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            Thumbnails.of(flattened)
                    .scale(scale)
                    .outputFormat("jpg")
                    .outputQuality(QUALITY)
                    .toOutputStream(out);
        } catch (IOException ex) {
            throw ApiException.validation("photo could not be processed", FIELD);
        }
        return out.toByteArray();
    }

    /** Magic numbers only: JPEG, PNG, WebP. */
    static boolean isSupportedImage(byte[] bytes) {
        if (bytes == null || bytes.length < 12) {
            return false;
        }
        boolean jpeg = (bytes[0] & 0xff) == 0xFF && (bytes[1] & 0xff) == 0xD8 && (bytes[2] & 0xff) == 0xFF;
        boolean png = (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
                && (bytes[4] & 0xff) == 0x0D && (bytes[5] & 0xff) == 0x0A
                && (bytes[6] & 0xff) == 0x1A && (bytes[7] & 0xff) == 0x0A;
        boolean webp = bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
        return jpeg || png || webp;
    }

    private BufferedImage decode(byte[] source) {
        try (ImageInputStream stream = ImageIO.createImageInputStream(new ByteArrayInputStream(source))) {
            if (stream == null) {
                throw ApiException.validation("photo could not be read", FIELD);
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                // Sniffing said it is an image this product accepts, but no reader
                // on this JVM can open it (a WebP with no WebP plugin, say).
                throw ApiException.validation("photo format is not supported", FIELD);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                if (reader.getWidth(0) > MAX_SOURCE_EDGE || reader.getHeight(0) > MAX_SOURCE_EDGE) {
                    throw ApiException.validation("photo dimensions are too large", FIELD);
                }
                BufferedImage image = reader.read(0);
                if (image == null) {
                    throw ApiException.validation("photo could not be read", FIELD);
                }
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | ArrayIndexOutOfBoundsException | IllegalArgumentException ex) {
            // A truncated or malformed file: the person's problem to fix, not a 500.
            throw ApiException.validation("photo could not be read", FIELD);
        }
    }

    /**
     * JPEG has no alpha. Compositing on white first keeps a transparent PNG from
     * turning into a black square.
     */
    private BufferedImage flatten(BufferedImage image) {
        if (image.getType() == BufferedImage.TYPE_INT_RGB) {
            return image;
        }
        BufferedImage flat = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = flat.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, flat.getWidth(), flat.getHeight());
            graphics.drawImage(image, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        return flat;
    }

    private static double scaleFor(int width, int height) {
        int longEdge = Math.max(width, height);
        return longEdge <= MAX_EDGE ? 1.0d : (double) MAX_EDGE / longEdge;
    }
}
