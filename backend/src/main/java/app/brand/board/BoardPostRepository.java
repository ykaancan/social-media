package app.brand.board;

import app.brand.message.MessageState;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The board's queries. Two of them carry rules the rest of the server must not
 * re-derive:
 *
 * <ul>
 *   <li>{@link #published} is <b>the</b> definition of a card being on the board.
 *       A room post is published when it is approved and not hidden; a post
 *       addressed to a person is published only while that person's inbox message
 *       is {@code approved} and not deleted [D12] — the recipient curates. The
 *       same rule backs {@code EventRepository.countPublishedPosts}, so
 *       {@code postCount} and the list it counts can never disagree.</li>
 *   <li>{@link #pendingRoomPosts} is the set the lazy transitions and the
 *       housekeeping job [B5] walk. A post addressed to a person is not in it,
 *       because it never entered a queue in the first place.</li>
 * </ul>
 *
 * <p>Ordering is [B2]'s: {@code created_at desc, id desc} for newest-first,
 * ascending for the queue, which a moderator works through oldest first.
 */
public interface BoardPostRepository extends JpaRepository<BoardPost, UUID> {

    /**
     * The published rule, written once. Every list, every by-id lookup and
     * {@code postCount} read it, so no two surfaces can disagree about whether a
     * card is on the board.
     */
    String PUBLISHED = "p.hiddenAt is null and ("
            + "  (p.inboxMessageId is null and p.state = :approved)"
            + "  or (p.inboxMessageId is not null and exists ("
            + "        select 1 from InboxMessage m where m.id = p.inboxMessageId"
            + "          and m.state = :messageApproved and m.deletedAt is null)))";

    /** Every card on the board right now, newest first. */
    @Query("select p from BoardPost p where p.eventId = :eventId and " + PUBLISHED + " "
            + "order by p.createdAt desc, p.id desc")
    List<BoardPost> published(@Param("eventId") UUID eventId,
                              @Param("approved") BoardPostState approved,
                              @Param("messageApproved") MessageState messageApproved);

    /**
     * One published card of one board — what react, hide and report act on. A post
     * that exists but is not published gives the same empty answer as one that
     * never existed, so the id space cannot be probed.
     */
    @Query("select p from BoardPost p where p.id = :postId and p.eventId = :eventId and " + PUBLISHED)
    Optional<BoardPost> publishedById(@Param("eventId") UUID eventId,
                                      @Param("postId") UUID postId,
                                      @Param("approved") BoardPostState approved,
                                      @Param("messageApproved") MessageState messageApproved);

    /**
     * Every room post of one board, newest first — the one read behind
     * {@code ownUnpublished}, {@code queue}, {@code pendingCount} and
     * {@code reviewed}, so the four lists are always four views of one truth.
     */
    @Query("select p from BoardPost p "
            + "where p.eventId = :eventId and p.inboxMessageId is null "
            + "order by p.createdAt desc, p.id desc")
    List<BoardPost> roomPosts(@Param("eventId") UUID eventId);

    /** The transition set: pending room posts of one board, oldest first. */
    @Query("select p from BoardPost p "
            + "where p.eventId = :eventId and p.inboxMessageId is null and p.state = :pending "
            + "order by p.createdAt asc, p.id asc")
    List<BoardPost> pendingRoomPosts(@Param("eventId") UUID eventId,
                                     @Param("pending") BoardPostState pending);

    /** [B6] The token is unique across the table; the event is checked by the caller. */
    Optional<BoardPost> findByRejectionUndoToken(String rejectionUndoToken);

    boolean existsByInboxMessageId(UUID inboxMessageId);

    /**
     * [B5] Housekeeping, half one: boards holding a rejection whose five seconds
     * have run out. Returns event ids, because the finalising itself is the same
     * per-event pass the board read runs — written once, not twice.
     */
    @Query("select distinct p.eventId from BoardPost p "
            + "where p.inboxMessageId is null and p.state = :pending "
            + "and p.rejectionUndoUntil is not null and p.rejectionUndoUntil <= :now")
    List<UUID> eventsWithExpiredUndo(@Param("pending") BoardPostState pending,
                                     @Param("now") Instant now);

    /**
     * [B5] Housekeeping, half two: boards that are closed or past their end and
     * still hold pending posts. [D4] never leave a post pending forever.
     */
    @Query("select distinct p.eventId from BoardPost p, Event e "
            + "where e.id = p.eventId and p.inboxMessageId is null and p.state = :pending "
            + "and (e.closedAt is not null or e.endsAt <= :now)")
    List<UUID> eventsWithPendingPostsPastEnd(@Param("pending") BoardPostState pending,
                                             @Param("now") Instant now);
}
