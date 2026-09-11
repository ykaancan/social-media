package app.brand.board;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostReactionRepository extends JpaRepository<PostReaction, PostReactionId> {

    /** One read for the whole board; counting per card in a loop is a few hundred queries at an event. */
    @Query("select r from PostReaction r where r.postId in :postIds")
    List<PostReaction> forPosts(@Param("postIds") Collection<UUID> postIds);

    Optional<PostReaction> findByPostIdAndUserId(UUID postId, UUID userId);

    void deleteByPostIdAndUserId(UUID postId, UUID userId);
}
