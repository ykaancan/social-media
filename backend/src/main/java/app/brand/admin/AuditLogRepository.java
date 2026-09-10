package app.brand.admin;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    List<AuditLog> findBySubjectUserIdOrderByCreatedAtDesc(UUID subjectUserId);

    List<AuditLog> findBySubjectUserIdAndActionOrderByCreatedAtDesc(UUID subjectUserId, String action);
}
