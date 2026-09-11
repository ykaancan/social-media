package app.brand.safety;

import app.brand.common.ApiException;
import app.brand.content.Anonymity;
import app.brand.realtime.ThreadsChanged;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [D6] Block, in the one shape the whole product uses.
 *
 * <p>Absolute means <em>refused server-side</em>, not deleted: nothing in here
 * removes a row, hides a board post or tells the blocked person anything. Callers
 * ask {@link #isBlocked} before every write and filter reads with
 * {@link #blockedIdsOf}; the content itself is left exactly where it is, so a
 * report filed before the block still shows the admin everything.
 */
@Service
public class BlockService {

    private final BlockRepository blocks;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public BlockService(BlockRepository blocks, ApplicationEventPublisher publisher, Clock clock) {
        this.blocks = blocks;
        this.publisher = publisher;
        this.clock = clock;
    }

    /** Has {@code blocker} blocked {@code blocked}? The question every send asks. */
    @Transactional(readOnly = true)
    public boolean isBlocked(UUID blockerId, UUID blockedId) {
        if (blockerId == null || blockedId == null) {
            return false;
        }
        return blocks.existsByBlockerIdAndBlockedId(blockerId, blockedId);
    }

    /**
     * Block, by the identity the blocked person had already allowed.
     *
     * <p>Idempotent: an existing pair is left exactly as it was, display columns
     * and all. Re-blocking from a later, more revealing message must not upgrade
     * the frozen row — the blocker chose to block something anonymous, and the
     * Blocked list is not a way to find out who it was.
     */
    @Transactional
    public Block block(UUID blockerId, UUID blockedId, Anonymity displayAllowed) {
        if (blockerId == null || blockedId == null) {
            throw ApiException.validation("invalid block", "id");
        }
        if (blockerId.equals(blockedId)) {
            // The CHECK constraint would refuse it anyway; a 422 is the honest answer.
            throw ApiException.validation("cannot block yourself", "id");
        }
        Block row = blocks.findByBlockerIdAndBlockedId(blockerId, blockedId)
                .orElseGet(() -> blocks.saveAndFlush(
                        Block.of(blockerId, blockedId, displayAllowed, Instant.now(clock))));
        // The blocker's own thread list changes shape [D6]: threads with this
        // person drop out of it. Only the blocker is told — the blocked user is
        // not notified, here or anywhere else.
        publisher.publishEvent(new ThreadsChanged(Set.of(blockerId)));
        return row;
    }

    /** The ids this account has blocked — the filter for their inbox, wall and threads. */
    @Transactional(readOnly = true)
    public Set<UUID> blockedIdsOf(UUID blockerId) {
        return blockerId == null ? Set.of() : Set.copyOf(blocks.blockedIdsOf(blockerId));
    }

    /** Who has blocked this account. A write to any of them is refused. */
    @Transactional(readOnly = true)
    public Set<UUID> blockersOf(UUID blockedId) {
        return blockedId == null ? Set.of() : Set.copyOf(blocks.blockersOf(blockedId));
    }

    /** The Blocked list, as rows; the caller renders each through {@code SenderPresenter}. */
    @Transactional(readOnly = true)
    public List<Block> listFor(UUID blockerId) {
        return blocks.findByBlockerIdOrderByCreatedAtDesc(blockerId);
    }

    /**
     * Unblock by the opaque row id. Someone else's row is 404, never 403: the id
     * space must not be probeable.
     */
    @Transactional
    public void unblock(UUID blockerId, UUID blockRowId) {
        Block block = blockRowId == null ? null : blocks.findById(blockRowId).orElse(null);
        if (block == null || !block.getBlockerId().equals(blockerId)) {
            throw ApiException.notFound("no such block");
        }
        blocks.delete(block);
        // The threads that were filtered out come back. There is no message
        // context to republish here, and an unblock is nobody else's business.
        publisher.publishEvent(new ThreadsChanged(Set.of(blockerId)));
    }
}
