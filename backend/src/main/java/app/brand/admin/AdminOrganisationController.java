package app.brand.admin;

import app.brand.admin.AdminOrganisationDtos.AdminOrganisationDto;
import app.brand.common.ApiException;
import app.brand.organisation.EventCreation;
import app.brand.security.AppPrincipal;
import app.brand.security.CurrentUser;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * [D13] The super admin's organisation routes, exactly the {@code super_admin only}
 * block of {@code app/src/api/tenant.ts}. Same method-security rule as
 * {@link AdminUserController}: an organisation admin is role {@code member} on the
 * account and so gets {@code 403} here [D19].
 *
 * <p>Bodies are read as JSON trees so the controller can tell an absent key from
 * a null one: P10 refuses a {@code PATCH} that <em>carries</em> {@code hasSections},
 * whatever its value.
 */
@RestController
@RequestMapping("/admin/api/organisations")
@PreAuthorize("hasRole('SUPER_ADMIN') and authentication.principal.active")
public class AdminOrganisationController {

    /** Same bounds as {@code organisation.name} in V4 (and {@code event.name}). */
    static final int NAME_MIN = 2;
    static final int NAME_MAX = 40;

    private final AdminOrganisationService service;

    public AdminOrganisationController(AdminOrganisationService service) {
        this.service = service;
    }

    @GetMapping
    public List<AdminOrganisationDto> list() {
        return service.list();
    }

    /** {@code {name, approvalRequired, hasSections, eventCreation}}, all four required. */
    @PostMapping
    public AdminOrganisationDto create(@CurrentUser AppPrincipal admin, @RequestBody JsonNode body) {
        JsonNode request = object(body);
        return service.create(admin.id(),
                name(request.get("name")),
                bool(request.get("approvalRequired"), "approvalRequired"),
                bool(request.get("hasSections"), "hasSections"),
                eventCreation(request.get("eventCreation")));
    }

    /** {@code {name?, approvalRequired?, eventCreation?}}. P10: {@code hasSections} is refused. */
    @PatchMapping("/{id}")
    public AdminOrganisationDto update(@CurrentUser AppPrincipal admin,
                                       @PathVariable UUID id,
                                       @RequestBody JsonNode body) {
        JsonNode request = object(body);
        if (request.has("hasSections")) {
            throw ApiException.validation("hasSections cannot be changed after creation", "hasSections");
        }
        return service.update(admin.id(), id,
                request.has("name") ? name(request.get("name")) : null,
                request.has("approvalRequired") ? bool(request.get("approvalRequired"), "approvalRequired") : null,
                request.has("eventCreation") ? eventCreation(request.get("eventCreation")) : null);
    }

    /** {@code {email, sectionId?}} — TENANT_PLAN.md P6. */
    @PostMapping("/{id}/admins")
    public ResponseEntity<Void> assignAdmin(@CurrentUser AppPrincipal admin,
                                            @PathVariable UUID id,
                                            @RequestBody JsonNode body) {
        JsonNode request = object(body);
        service.assignAdmin(admin.id(), id,
                text(request.get("email"), "email"),
                optionalText(request.get("sectionId"), "sectionId"));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/admins/{userId}")
    public ResponseEntity<Void> removeAdmin(@CurrentUser AppPrincipal admin,
                                            @PathVariable UUID id,
                                            @PathVariable UUID userId) {
        service.removeAdmin(admin.id(), id, userId);
        return ResponseEntity.noContent().build();
    }

    /* ------------------------------------------------------------ parsing */

    private static JsonNode object(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw ApiException.validation("a JSON object is required", null);
        }
        return body;
    }

    /** 2–40 characters after trim. */
    private static String name(JsonNode node) {
        if (node == null || !node.isTextual()) {
            throw ApiException.validation("name is required", "name");
        }
        String name = node.asText().trim();
        if (name.length() < NAME_MIN || name.length() > NAME_MAX) {
            throw ApiException.validation("name must be 2 to 40 characters", "name");
        }
        return name;
    }

    private static boolean bool(JsonNode node, String field) {
        if (node == null || !node.isBoolean()) {
            throw ApiException.validation(field + " must be true or false", field);
        }
        return node.asBoolean();
    }

    private static EventCreation eventCreation(JsonNode node) {
        String value = node == null || !node.isTextual() ? "" : node.asText().trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "admins" -> EventCreation.ADMINS;
            case "members" -> EventCreation.MEMBERS;
            default -> throw ApiException.validation("eventCreation must be admins or members", "eventCreation");
        };
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.isTextual() || node.asText().isBlank()) {
            throw ApiException.validation(field + " is required", field);
        }
        return node.asText();
    }

    /** Absent or null means absent; anything but a string is a validation error. */
    private static String optionalText(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isTextual()) {
            throw ApiException.validation(field + " must be a string", field);
        }
        return node.asText();
    }
}
