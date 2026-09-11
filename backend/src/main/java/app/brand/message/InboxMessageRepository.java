package app.brand.message;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Every query here carries the same visibility rule: a message is hidden from a
 * viewer when it is soft-deleted [D12] <b>or</b> the viewer has blocked its sender
 * [D6].
 *
 * <p>The block half is a {@code not exists} against the {@code block} table rather
 * than an id list passed in by the caller, so there is no way to read the inbox
 * without it and an empty block list needs no special case.
 *
 * <p>Ordering is [B2]'s newest-first, {@code created_at desc, id desc}: two
 * messages written in the same millisecond still have one stable order.
 */
public interface InboxMessageRepository extends JpaRepository<InboxMessage, UUID> {

    String NOT_BLOCKED =
            "not exists (select 1 from Block b where b.blockerId = :viewer and b.blockedId = m.senderId)";

    /** {@code GET /me/inbox} — everything the caller received and can still see. */
    @Query("select m from InboxMessage m "
            + "where m.recipientId = :viewer and m.deletedAt is null and " + NOT_BLOCKED + " "
            + "order by m.createdAt desc, m.id desc")
    List<InboxMessage> inboxOf(@Param("viewer") UUID viewerId);

    /**
     * The wall: {@code target}'s approved messages, hidden from <em>the viewer</em>
     * by the viewer's own blocks. Two people looking at the same wall can honestly
     * see different numbers of cards — [D6] block hides content from the blocker,
     * it does not remove it for everyone.
     */
    @Query("select m from InboxMessage m "
            + "where m.recipientId = :target and m.state = :approved and m.deletedAt is null and " + NOT_BLOCKED + " "
            + "order by m.createdAt desc, m.id desc")
    List<InboxMessage> wallOf(@Param("target") UUID targetId,
                              @Param("viewer") UUID viewerId,
                              @Param("approved") MessageState approved);

    /**
     * One message the caller received and can still see. Anything else — someone
     * else's message, a deleted one, one from a sender they blocked, an id that
     * never existed — gives the same empty answer, so every caller can only
     * produce a 404 and the id space cannot be probed.
     */
    @Query("select m from InboxMessage m "
            + "where m.id = :id and m.recipientId = :viewer and m.deletedAt is null and " + NOT_BLOCKED)
    Optional<InboxMessage> visibleTo(@Param("id") UUID id, @Param("viewer") UUID viewerId);
}
