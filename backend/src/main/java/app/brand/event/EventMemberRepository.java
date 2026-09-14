package app.brand.event;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    /**
     * Join, once. Two taps on the code screen — or a tap and a QR scan — race on the
     * {@code (event_id, user_id)} primary key, and the loser must be told
     * "already joined", never a 500.
     *
     * <p>Native and {@code do nothing} on purpose. The entity's id is assigned, so
     * {@code save} is a {@code merge}: a racing row that is already visible would be
     * <b>updated</b>, and that would reset {@code is_moderator} — a creator or a
     * co-moderator rejoining their own board would quietly lose the queue. This
     * insert can only ever add a row.
     *
     * @return 1 when the row was written, 0 when it was already there
     */
    @Modifying
    @Query(value = """
            insert into event_member (event_id, user_id, is_moderator, joined_at)
            values (:eventId, :userId, false, :joinedAt)
            on conflict (event_id, user_id) do nothing
            """, nativeQuery = true)
    int joinIfAbsent(@Param("eventId") UUID eventId,
                     @Param("userId") UUID userId,
                     @Param("joinedAt") OffsetDateTime joinedAt);
}
