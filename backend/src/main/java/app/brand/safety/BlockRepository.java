package app.brand.safety;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BlockRepository extends JpaRepository<Block, UUID> {

    Optional<Block> findByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);

    boolean existsByBlockerIdAndBlockedId(UUID blockerId, UUID blockedId);

    /** The Blocked list, newest first. */
    List<Block> findByBlockerIdOrderByCreatedAtDesc(UUID blockerId);

    @Query("select b.blockedId from Block b where b.blockerId = :blockerId")
    List<UUID> blockedIdsOf(@Param("blockerId") UUID blockerId);

    /** Who has blocked this person — the filter every send has to pass. */
    @Query("select b.blockerId from Block b where b.blockedId = :blockedId")
    List<UUID> blockersOf(@Param("blockedId") UUID blockedId);
}
