package app.brand.admin;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    List<AuditLog> findBySubjectUserIdOrderByCreatedAtDesc(UUID subjectUserId);

    List<AuditLog> findBySubjectUserIdAndActionOrderByCreatedAtDesc(UUID subjectUserId, String action);

    /**
     * By what was looked at rather than by whose it was: every {@code identity_view}
     * of one report, in order. This is the query a KVKK question is answered with
     * — "who saw who was behind this, and when".
     */
    List<AuditLog> findBySubjectIdAndActionOrderByCreatedAtDesc(UUID subjectId, String action);
}
