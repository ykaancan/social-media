package app.brand.thread;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The bubbles. Two of these queries exist only so the thread list is a fixed
 * number of round trips rather than one per thread: {@link #lastMessagesOf} and
 * {@link #unreadCountsFor}.
 */
public interface ThreadMessageRepository extends JpaRepository<ThreadMessage, UUID> {

    /** A whole conversation, oldest first — the order the screen renders in. */
    List<ThreadMessage> findByThreadIdOrderBySeqAsc(UUID threadId);

    /** One message of one thread; a message of another thread is simply not found. */
    Optional<ThreadMessage> findByIdAndThreadId(UUID id, UUID threadId);

    /** The first message not written by the viewer — the thread's {@code blockMessageId}. */
    Optional<ThreadMessage> findFirstByThreadIdAndSenderIdNotOrderBySeqAsc(UUID threadId, UUID senderId);

    /** The next {@code seq}. Read under the thread row's write lock, never on its own. */
    @Query("select coalesce(max(m.seq), 0) from ThreadMessage m where m.threadId = :threadId")
    long maxSeq(@Param("threadId") UUID threadId);

    /** The last row of each of several threads: what the list shows as a preview. */
    @Query("select m from ThreadMessage m where m.threadId in :threadIds "
            + "and m.seq = (select max(x.seq) from ThreadMessage x where x.threadId = m.threadId)")
    List<ThreadMessage> lastMessagesOf(@Param("threadIds") Collection<UUID> threadIds);

    /**
     * Unread per thread: rows past this reader's watermark that they did not write.
     *
     * <p>A system row (a reveal) counts exactly like any other row the other person
     * caused, which is what the mock does and what the badge should say — something
     * happened in that thread that this person has not seen.
     *
     * @return {@code [threadId, count]} pairs; a thread with nothing unread is absent
     */
    @Query("select m.threadId, count(m) from ThreadMessage m, ThreadParticipant p "
            + "where p.id.threadId = m.threadId and p.id.userId = :viewer "
            + "and m.threadId in :threadIds and m.seq > p.readThroughSeq and m.senderId <> :viewer "
            + "group by m.threadId")
    List<Object[]> unreadCountsFor(@Param("viewer") UUID viewerId,
                                   @Param("threadIds") Collection<UUID> threadIds);
}
