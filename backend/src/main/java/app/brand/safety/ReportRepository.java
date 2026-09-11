package app.brand.safety;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReportRepository extends JpaRepository<Report, UUID> {

    /** The "one per (reporter, target)" rule the unique index also enforces. */
    Optional<Report> findByReporterIdAndTargetKindAndTargetId(UUID reporterId, String targetKind, UUID targetId);

    /** Every report against one piece of content — the admin queue (B-5) reads this. */
    List<Report> findByTargetKindAndTargetId(String targetKind, UUID targetId);

    /**
     * File a report, once, whatever else is happening.
     *
     * <p>Native and {@code do nothing} because the alternative is worse than a
     * duplicate row: a unique-index violation raised through JPA marks the whole
     * transaction rollback-only, so a second tap would take the caller's own writes
     * down with it and answer 500 instead of the no-op a second tap deserves.
     *
     * @return 1 when this reporter's report was written, 0 when it was already there
     */
    @Modifying
    @Query(value = """
            insert into report (id, reporter_id, target_kind, target_id, reason, status, created_at)
            values (gen_random_uuid(), :reporterId, :targetKind, :targetId, :reason, 'open', :now)
            on conflict (reporter_id, target_kind, target_id) do nothing
            """, nativeQuery = true)
    int fileIfAbsent(@Param("reporterId") UUID reporterId,
                     @Param("targetKind") String targetKind,
                     @Param("targetId") UUID targetId,
                     @Param("reason") String reason,
                     @Param("now") OffsetDateTime now);
}
