package app.brand.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.config.BrandProperties;
import app.brand.security.JwtService;
import app.brand.support.AbstractIntegrationTest;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/**
 * [B10] {@code POST /me/photo} — the one image endpoint stage 1 allows.
 *
 * <p>What is proved here is that the server does not store what it was sent: it
 * decodes, resizes and re-encodes, so a 900x600 PNG becomes a boxed JPEG and a
 * text file calling itself {@code image/jpeg} is refused on the bytes, not on the
 * header it declared.
 */
class AvatarUploadIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private BrandProperties properties;

    @Test
    @DisplayName("a PNG is resized into a stored JPEG and appears on /me")
    void uploadResizesAndStores() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);

        String avatarUrl = upload(user, png(900, 600), "avatar.png", MediaType.IMAGE_PNG_VALUE);
        assertThat(avatarUrl).startsWith(properties.publicBaseUrl() + "/media/avatars/").endsWith(".jpg");

        Path stored = avatarFile(avatarUrl);
        assertThat(stored).exists();
        BufferedImage image = ImageIO.read(stored.toFile());
        // Fits inside 512x512, aspect ratio kept: 900x600 -> 512x341.
        assertThat(image.getWidth()).isEqualTo(512);
        assertThat(image.getHeight()).isEqualTo(341);
        // Re-encoded as JPEG whatever came in.
        assertThat(Files.readAllBytes(stored)[0] & 0xff).isEqualTo(0xFF);

        assertThat(users.findById(user.getId()).orElseThrow().getAvatarKey())
                .isEqualTo(keyOf(avatarUrl));

        mockMvc.perform(get("/me").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(avatarUrl));
    }

    @Test
    @DisplayName("a picture smaller than the box is stored as it is, never enlarged")
    void smallPictureIsNotUpscaled() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);

        BufferedImage image = ImageIO.read(avatarFile(upload(user, png(120, 90), "small.png",
                MediaType.IMAGE_PNG_VALUE)).toFile());
        assertThat(image.getWidth()).isEqualTo(120);
        assertThat(image.getHeight()).isEqualTo(90);
    }

    @Test
    @DisplayName("the stored avatar is served publicly as image/jpeg")
    void avatarIsServedWithoutAToken() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);
        String avatarUrl = upload(user, png(300, 300), "avatar.png", MediaType.IMAGE_PNG_VALUE);

        MvcResult result = mockMvc.perform(get("/media/avatars/" + keyOf(avatarUrl)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, MediaType.IMAGE_JPEG_VALUE))
                .andReturn();

        BufferedImage served = ImageIO.read(new ByteArrayInputStream(result.getResponse().getContentAsByteArray()));
        assertThat(served.getWidth()).isEqualTo(300);

        mockMvc.perform(get("/media/avatars/" + UUID.randomUUID() + ".jpg"))
                .andExpect(status().isNotFound());
        // A name that is not a key at all never reaches the filesystem.
        mockMvc.perform(get("/media/avatars/application.yml"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a text file calling itself image/jpeg is refused on its bytes")
    void disguisedFileIsRejected() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);

        mockMvc.perform(multipart("/me/photo")
                        .file(new MockMultipartFile("photo", "avatar.jpg", MediaType.IMAGE_JPEG_VALUE,
                                "this is not an image, whatever the header says".getBytes(StandardCharsets.UTF_8)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.field").value("photo"));

        assertThat(users.findById(user.getId()).orElseThrow().getAvatarKey()).isNull();
    }

    @Test
    @DisplayName("an empty or missing part is a validation failure on photo")
    void emptyUploadIsRejected() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);

        mockMvc.perform(multipart("/me/photo")
                        .file(new MockMultipartFile("photo", "avatar.png", MediaType.IMAGE_PNG_VALUE, new byte[0]))
                        .header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("photo"));

        mockMvc.perform(multipart("/me/photo").header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("photo"));
    }

    @Test
    @DisplayName("replacing a photo deletes the file it replaced")
    void replacingDeletesThePreviousFile() throws Exception {
        AppUser user = account(AccountStatus.INCOMPLETE);

        Path first = avatarFile(upload(user, png(400, 400), "first.png", MediaType.IMAGE_PNG_VALUE));
        assertThat(first).exists();

        Path second = avatarFile(upload(user, png(400, 400), "second.png", MediaType.IMAGE_PNG_VALUE));
        assertThat(second).exists();
        assertThat(second).isNotEqualTo(first);
        // Nothing is left behind under a URL nobody points at any more.
        assertThat(first).doesNotExist();
    }

    @Test
    @DisplayName("a banned account cannot upload a photo")
    void bannedAccountCannotUpload() throws Exception {
        AppUser user = account(AccountStatus.BANNED);

        mockMvc.perform(multipart("/me/photo")
                        .file(new MockMultipartFile("photo", "avatar.png", MediaType.IMAGE_PNG_VALUE, png(300, 300)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("account_restricted"));
    }

    @Test
    @DisplayName("this JVM can decode all three accepted formats")
    void allAcceptedFormatsHaveAReader() {
        // The JDK reads JPEG and PNG; WebP comes from the imageio-webp plugin in
        // build.gradle.kts. If that dependency ever goes, WebP uploads would start
        // failing as "format not supported" and only this assertion would say why.
        assertThat(ImageIO.getImageReadersByFormatName("jpeg").hasNext()).isTrue();
        assertThat(ImageIO.getImageReadersByFormatName("png").hasNext()).isTrue();
        assertThat(ImageIO.getImageReadersByFormatName("webp").hasNext()).isTrue();
    }

    @Test
    @DisplayName("an anonymous upload is 401, never a stored file")
    void anonymousUploadIsRejected() throws Exception {
        mockMvc.perform(multipart("/me/photo")
                        .file(new MockMultipartFile("photo", "avatar.png", MediaType.IMAGE_PNG_VALUE, png(300, 300))))
                .andExpect(status().isUnauthorized());
    }

    /* -------------------------------------------------------------- helpers */

    private String upload(AppUser user, byte[] bytes, String filename, String contentType) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/me/photo")
                        .file(new MockMultipartFile("photo", filename, contentType, bytes))
                        .header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").isNotEmpty())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("avatarUrl").asText();
    }

    /** The media directory is configuration, so the test reads it rather than guessing. */
    private Path avatarFile(String avatarUrl) {
        return Path.of(properties.media().dir()).resolve("avatars").resolve(keyOf(avatarUrl));
    }

    private static String keyOf(String avatarUrl) {
        return avatarUrl.substring(avatarUrl.lastIndexOf('/') + 1);
    }

    /** A real image, generated here, so nothing about this test depends on a fixture file. */
    private static byte[] png(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(new Color(0x00FF00FF, true));
            graphics.fillRect(0, 0, width, height);
            graphics.setColor(Color.WHITE);
            graphics.fillOval(width / 4, height / 4, width / 2, height / 2);
        } finally {
            graphics.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private AppUser account(AccountStatus status) {
        AppUser user = AppUser.register(
                "avatar-" + UUID.randomUUID() + "@example.com", "$2a$12$notarealhash", null, Instant.now());
        user.setStatus(status);
        return users.saveAndFlush(user);
    }

    private String bearer(AppUser user) {
        return "Bearer " + jwtService.issue(user);
    }
}
