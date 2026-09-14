package app.brand.event;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<Event, UUID> {

    /** Join codes are compared exactly; the caller normalises before it gets here. */
    Optional<Event> findByJoinCode(String joinCode);

    boolean existsByJoinCode(String joinCode);

    /**
     * {@code GET /events} — the events this account has joined, at every status.
     * Never discovery: a board you are not a member of does not appear, and there
     * is no endpoint that lists one.
     *
     * <p>Ordering is [B5]'s one expression: live, then upcoming soonest first, then
     * archived most recent end first, with {@code now} bound from the application
     * clock rather than the database's.
     */
    @Query(value = "select e.* from event e "
            + "join event_member em on em.event_id = e.id and em.user_id = :viewer "
            + "order by " + EventStatus.JOINED_ORDER_SQL,
            nativeQuery = true)
    List<Event> findJoined(@Param("viewer") UUID viewerId, @Param("now") OffsetDateTime now);

    /**
     * Published board posts per event — the real {@code postCount}, never an
     * estimate (principle 4).
     *
     * <p>"Published" is the mock's rule: a room post is approved and not hidden; a
     * post addressed to a person is published only while that person's inbox
     * message is {@code approved} and not deleted [D12], because the recipient, not
     * the board, decides what is public.
     */
    @Query(value = """
            select bp.event_id, count(*)
            from board_post bp
            left join inbox_message im on im.id = bp.inbox_message_id
            where bp.event_id in (:eventIds)
              and ((bp.inbox_message_id is null
                        and bp.state = 'approved'
                        and bp.hidden_at is null)
                or (bp.inbox_message_id is not null
                        and im.state = 'approved'
                        and im.deleted_at is null))
            group by bp.event_id
            """, nativeQuery = true)
    List<Object[]> countPublishedPosts(@Param("eventIds") Collection<UUID> eventIds);
}
