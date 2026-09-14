package app.brand.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.brand.support.AbstractIntegrationTest;
import app.brand.user.AccountStatus;
import app.brand.user.AppUser;
import app.brand.user.AppUserRepository;
import app.brand.user.Role;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * [B11] The first super_admin comes from configuration, and the runner is safe to
 * run on every start.
 *
 * <p>The runner's own method is driven directly rather than through a restarted
 * context: what matters is that promoting is idempotent and that an address with
 * no account changes nothing, not that Spring calls {@code run}.
 */
class AdminBootstrapTest extends AbstractIntegrationTest {

    @Autowired
    private AdminBootstrap bootstrap;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private AuditLogRepository auditLog;

    @Test
    @DisplayName("the configured address is promoted to super_admin and approved, once")
    void promotesExistingUserIdempotently() throws Exception {
        String email = uniqueEmail();
        UUID id = registerAndGetId(email);

        assertThat(bootstrap.promote(email)).isTrue();

        AppUser promoted = users.findById(id).orElseThrow();
        assertThat(promoted.getRole()).isEqualTo(Role.SUPER_ADMIN);
        assertThat(promoted.getStatus()).isEqualTo(AccountStatus.APPROVED);
        assertThat(promoted.getApprovedAt()).isNotNull();
        // No person made this decision, so no person is recorded as having made it.
        assertThat(promoted.getApprovedBy()).isNull();

        var rows = auditLog.findBySubjectUserIdOrderByCreatedAtDesc(id);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAction()).isEqualTo("promote_admin");
        assertThat(rows.get(0).getActorId()).isNull();
        assertThat(rows.get(0).getDetails()).contains("bootstrap");

        // A second start must not write a second row, nor restamp approved_at.
        assertThat(bootstrap.promote(email)).isFalse();
        assertThat(auditLog.findBySubjectUserIdOrderByCreatedAtDesc(id)).hasSize(1);
        assertThat(users.findById(id).orElseThrow().getApprovedAt())
                .isEqualTo(promoted.getApprovedAt());
    }

    @Test
    @DisplayName("the address is matched case-insensitively, like login")
    void matchesEmailCaseInsensitively() throws Exception {
        String email = uniqueEmail();
        UUID id = registerAndGetId(email);

        assertThat(bootstrap.promote(email.toUpperCase(java.util.Locale.ROOT))).isTrue();
        assertThat(users.findById(id).orElseThrow().getRole()).isEqualTo(Role.SUPER_ADMIN);
    }

    @Test
    @DisplayName("an address with no account yet changes nothing and is not an error")
    void unknownAddressChangesNothing() {
        long before = auditLog.count();

        assertThat(bootstrap.promote("nobody-" + UUID.randomUUID() + "@example.com")).isFalse();
        assertThat(bootstrap.promote(null)).isFalse();
        assertThat(bootstrap.promote("   ")).isFalse();

        assertThat(auditLog.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("no bootstrap address configured: the startup run is a no-op")
    void runWithNoConfiguredAddressIsANoOp() {
        long before = auditLog.count();
        // application-test.yml sets no brand.bootstrap-admin-email.
        bootstrap.run(null);
        assertThat(auditLog.count()).isEqualTo(before);
    }

    private UUID registerAndGetId(String email) throws Exception {
        String body = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("email", email, "password", "correct horse"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode me = objectMapper.readTree(body).get("me");
        return UUID.fromString(me.get("id").asText());
    }

    private static String uniqueEmail() {
        return "bootstrap-" + UUID.randomUUID() + "@example.com";
    }
}
