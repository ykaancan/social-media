package app.brand.thread;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** The two sides of a thread, and the batch read the thread list needs. */
public interface ThreadParticipantRepository
        extends JpaRepository<ThreadParticipant, ThreadParticipantId> {

    List<ThreadParticipant> findByIdThreadId(UUID threadId);

    List<ThreadParticipant> findByIdThreadIdIn(Collection<UUID> threadIds);

    Optional<ThreadParticipant> findByIdThreadIdAndIdUserId(UUID threadId, UUID userId);
}
