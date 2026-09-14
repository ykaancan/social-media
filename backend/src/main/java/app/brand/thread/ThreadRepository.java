package app.brand.thread;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Every read here carries the same access rule, written once: <b>a thread is
 * yours while you are one of its two participants and you have not blocked the
 * other one</b> [D6]. Anything else is 404 — someone else's thread, a thread with
 * a person this account blocked, an id that never existed — so the id space
 * cannot be probed and "exists but not yours" is indistinguishable from "gone".
 *
 * <p>The rule lives in the query rather than in a filter each caller remembers,
 * which is why {@link #visibleTo} exists alongside {@link #listFor} instead of a
 * plain {@code findById}.
 */
public interface ThreadRepository extends JpaRepository<Thread, UUID> {

    String PARTICIPANT =
            "exists (select 1 from ThreadParticipant p "
                    + "where p.id.threadId = t.id and p.id.userId = :viewer)";

    /** [D6] The blocker's own list loses the thread; the blocked side keeps theirs. */
    String NOT_BLOCKED =
            "not exists (select 1 from ThreadParticipant o, Block b "
                    + "where o.id.threadId = t.id and o.id.userId <> :viewer "
                    + "and b.blockerId = :viewer and b.blockedId = o.id.userId)";

    /** The thread list: newest last message first [B2]. */
    @Query("select t from Thread t where " + PARTICIPANT + " and " + NOT_BLOCKED + " "
            + "order by t.lastMessageAt desc, t.id desc")
    List<Thread> listFor(@Param("viewer") UUID viewerId);

    /** One thread the caller may see, or nothing at all. */
    @Query("select t from Thread t where t.id = :id and " + PARTICIPANT + " and " + NOT_BLOCKED)
    Optional<Thread> visibleTo(@Param("id") UUID id, @Param("viewer") UUID viewerId);

    /**
     * The thread row, locked for the append that follows.
     *
     * <p>{@code seq} is unique per thread, so two sends racing on one thread would
     * otherwise both read the same maximum and one would lose on the index —
     * a 500 for someone who did nothing wrong. Taking this row's write lock first
     * makes the numbering a queue instead of a race, and it is the only lock the
     * whole step needs because every append is to exactly one thread.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Thread t where t.id = :id")
    Optional<Thread> lockForAppend(@Param("id") UUID id);

    /**
     * CLAUDE.md §5, "per-sender rate limits on thread openings": how many threads
     * this account has opened since {@code since}.
     *
     * <p>The opener is derived rather than stored — they are whoever sent seq 1,
     * which is the only message a thread can be created with — so this needs no
     * column the schema does not already have.
     */
    @Query("select count(t) from Thread t where t.createdAt >= :since "
            + "and exists (select 1 from ThreadMessage m "
            + "  where m.threadId = t.id and m.seq = 1 and m.senderId = :viewer)")
    long countOpenedSince(@Param("viewer") UUID viewerId, @Param("since") Instant since);
}
