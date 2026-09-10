package app.brand.admin;

import java.io.IOException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * [B11] The admin page is one static file: the build copies {@code /admin/index.html}
 * into {@code static/admin/}, and Spring Boot's resource handler serves it at
 * {@code /admin/index.html} without any help.
 *
 * <p>This exists only so the URL an admin actually types — {@code /admin/} — works
 * too, which the static handler does not do for a directory. It is public in
 * {@code SecurityConfig}: the page itself carries nothing, and everything it shows
 * comes from {@code /admin/api/*} with a bearer token.
 */
@RestController
public class AdminPageController {

    private static final String PAGE = "static/admin/index.html";

    @GetMapping(value = {"/admin", "/admin/"}, produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<Resource> page() throws IOException {
        Resource page = new ClassPathResource(PAGE);
        if (!page.exists()) {
            // Only reachable if the processResources copy step was removed.
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .contentLength(page.contentLength())
                .body(page);
    }
}
