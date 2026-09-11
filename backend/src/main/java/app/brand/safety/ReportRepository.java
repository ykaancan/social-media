package app.brand.safety;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportRepository extends JpaRepository<Report, UUID> {

    /** The "one per (reporter, target)" rule the unique index also enforces. */
    Optional<Report> findByReporterIdAndTargetKindAndTargetId(UUID reporterId, String targetKind, UUID targetId);

    /** Every report against one piece of content — the admin queue (B-5) reads this. */
    List<Report> findByTargetKindAndTargetId(String targetKind, UUID targetId);
}
