package app.brand.event;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventMemberRepository extends JpaRepository<EventMember, EventMemberId> {

    Optional<EventMember> findByEventIdAndUserId(UUID eventId, UUID userId);

    boolean existsByEventIdAndUserId(UUID eventId, UUID userId);

    /**
     * The full roster of one board — stage 1 sends all of it, so the People tab is
     * the guest list and not a page of it. The people themselves are loaded by id;
     * see {@link EventMember} for why the association is not mapped here.
     */
    List<EventMember> findByEventId(UUID eventId);

    @Query("select m.eventId, count(m) from EventMember m where m.eventId in :eventIds group by m.eventId")
    List<Object[]> countMembers(@Param("eventIds") Collection<UUID> eventIds);
}
