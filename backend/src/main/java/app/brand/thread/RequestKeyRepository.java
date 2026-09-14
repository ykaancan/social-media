package app.brand.thread;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** [B7] The idempotency table: read before the work, written after it, purged weekly. */
public interface RequestKeyRepository extends JpaRepository<RequestKey, RequestKeyId> {

    Optional<RequestKey> findByIdUserIdAndIdKey(UUID userId, String key);

    /**
     * Store the key, unless the same account already has it.
     *
     * <p>A native {@code on conflict do nothing} rather than a {@code persist},
     * for the reason {@code ReportService} gives: losing a race with the client's
     * own retry must be an ordinary answer, and recovering from a unique-index
     * violation inside the caller's transaction is not possible — by then
     * everything the caller wrote is going with it.
     *
     * @return 1 when this call stored the row, 0 when it was already there
     */
    @Modifying
    @Query(value = "insert into request_key (user_id, key, fingerprint_hash, result_id, created_at) "
            + "values (:userId, :key, :fingerprint, :resultId, :now) "
            + "on conflict (user_id, key) do nothing", nativeQuery = true)
    int storeIfAbsent(@Param("userId") UUID userId,
                      @Param("key") String key,
                      @Param("fingerprint") String fingerprintHash,
                      @Param("resultId") UUID resultId,
                      @Param("now") OffsetDateTime now);

    /** [B7] Keys older than seven days; a retry that late is a new request. */
    @Modifying
    @Query("delete from RequestKey r where r.createdAt < :cutoff")
    int purgeOlderThan(@Param("cutoff") Instant cutoff);
}
