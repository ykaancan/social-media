package app.brand.board;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostReactionRepository extends JpaRepository<PostReaction, PostReactionId> {

    /** One read for the whole board; counting per card in a loop is a few hundred queries at an event. */
    @Query("select r from PostReaction r where r.postId in :postIds")
    List<PostReaction> forPosts(@Param("postIds") Collection<UUID> postIds);

    Optional<PostReaction> findByPostIdAndUserId(UUID postId, UUID userId);

    void deleteByPostIdAndUserId(UUID postId, UUID userId);

    /**
     * One reaction per person per card, written in one statement.
     *
     * <p>Tapping two emoji quickly — or the same card from two devices — used to
     * race between the read and the insert and break the primary key. Here the
     * second tap simply wins: {@code do update} replaces the emoji, and
     * {@code created_at} is deliberately <b>not</b> touched, so a reaction keeps the
     * moment the person first reacted rather than the moment they changed their
     * mind.
     */
    @Modifying
    @Query(value = """
            insert into post_reaction (post_id, user_id, emoji, created_at)
            values (:postId, :userId, :emoji, :now)
            on conflict (post_id, user_id) do update set emoji = excluded.emoji
            """, nativeQuery = true)
    void react(@Param("postId") UUID postId,
               @Param("userId") UUID userId,
               @Param("emoji") String emoji,
               @Param("now") OffsetDateTime now);
}
