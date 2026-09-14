package app.brand.push;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PushOutboxRepository extends JpaRepository<PushOutbox, UUID> {

    /**
     * The drain, oldest first: a notification that has waited is more urgent than
     * one just written, and the partial index on
     * {@code (created_at) where sent_at is null} is exactly this query.
     */
    @Query("""
            select row from PushOutbox row
            where row.sentAt is null and row.attempts < :maxAttempts
            order by row.createdAt asc, row.id asc
            """)
    List<PushOutbox> pending(@Param("maxAttempts") int maxAttempts, Limit limit);

    long deleteBySentAtNotNullAndSentAtBefore(Instant cutoff);

    List<PushOutbox> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
