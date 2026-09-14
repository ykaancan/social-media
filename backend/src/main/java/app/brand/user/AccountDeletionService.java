package app.brand.user;

import app.brand.media.AvatarStore;
import app.brand.realtime.BoardChanged;
import app.brand.realtime.ThreadsChanged;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code DELETE /me} — real deletion (CLAUDE.md: "Account deletion is real
 * deletion (KVKK)"). This is not block [D6] and it is not inbox delete [D12],
 * both of which hide rather than destroy; when this returns, the row is gone and
 * the JWT filter answers the next request with 401 because there is no account
 * left to load.
 *
 * <p>It is one transaction of plain SQL, in the order {@code mock.ts}'s
 * {@code deleteAccount} uses. Two reasons for SQL rather than repositories:
 *
 * <ul>
 *   <li><b>The order is the specification.</b> Every foreign key in
 *       {@code V1__schema.sql} is {@code ON DELETE RESTRICT} except the handful
 *       that are deliberately {@code SET NULL} ({@code event.creator_id},
 *       {@code event.closed_by}, {@code board_post.rejected_by/hidden_by},
 *       {@code report.resolved_by}, {@code audit_log.actor_id/subject_user_id},
 *       {@code app_user.approved_by/inviter_id},
 *       {@code screening_term.created_by}). That is on purpose: the database
 *       refuses a deletion that forgot a table, so a missed one is a failed test
 *       rather than a person who is still half in the product. Statements written
 *       out in order say what survives and what does not.</li>
 *   <li><b>It owns no other package's entities.</b> Eleven tables here belong to
 *       {@code thread/}, {@code board/}, {@code message/}, {@code safety/},
 *       {@code push/} and {@code admin/}; reaching for their repositories would
 *       make deletion a dependency of everything.</li>
 * </ul>
 *
 * <p><b>What survives.</b> Other people's content: their posts stay on the board,
 * their messages stay in their own inboxes, and a board this account created keeps
 * every post on it — it only loses its creator [see {@code event.creator_id}
 * {@code ON DELETE SET NULL}] and, if it was still open, is closed on the way out
 * so nobody is left posting to a room with no moderator [D4]. Pending posts on
 * that board become {@code rejected / board_closed}, the same transition closing a
 * board makes, so their senders see the ordinary "Not published" card instead of
 * waiting forever. The audit log survives with its actor nulled: what an admin did
 * is not the deleted person's data to take away.
 */
@Service
public class AccountDeletionService {

    private final JdbcTemplate jdbc;
    private final AvatarStore avatars;
    private final AccountExportService exports;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public AccountDeletionService(JdbcTemplate jdbc,
                                  AvatarStore avatars,
                                  AccountExportService exports,
                                  ApplicationEventPublisher publisher,
                                  Clock clock) {
        this.jdbc = jdbc;
        this.avatars = avatars;
        this.exports = exports;
        this.publisher = publisher;
        this.clock = clock;
    }

    /**
     * Deletes the account. Reachable at <em>any</em> signed-in status: a person who
     * was never approved, or who was rejected or banned, still owns their data and
     * still gets to take it out of the product.
     */
    @Transactional
    public void delete(UUID userId) {
        Instant now = Instant.now(clock);

        // ---------------------------------------------------------------- what
        // Everything that has to be known before the first delete, because after
        // it the rows that answer it are gone.

        // Not queryForObject: an account with no photo answers with a null column,
        // and an account that is already gone answers with no row at all.
        String avatarKey = jdbc.query("select avatar_key from app_user where id = ?",
                        (rs, row) -> rs.getString(1), userId)
                .stream().filter(Objects::nonNull).findFirst().orElse(null);

        List<UUID> messageIds = jdbc.queryForList(
                "select id from inbox_message where sender_id = ? or recipient_id = ?",
                UUID.class, userId, userId);

        // A post of this account's, plus any post — whoever wrote it — that is the
        // board's copy of a message being deleted: a person-post is published on
        // the board only through its inbox message, so it cannot outlive it.
        Set<UUID> postIds = new LinkedHashSet<>(jdbc.queryForList(
                "select id from board_post where sender_id = ?", UUID.class, userId));
        postIds.addAll(query("select id from board_post where inbox_message_id in (:ids)", messageIds));

        // Threads this account is in — and, defensively, any thread whose origin
        // card is about to be deleted. In stage 1 the second set is always inside
        // the first (the author of an origin is always a participant), but the
        // restrict on thread.origin_* is not something to leave to an argument.
        Set<UUID> threadIds = new LinkedHashSet<>(jdbc.queryForList(
                "select thread_id from thread_participant where user_id = ?", UUID.class, userId));
        threadIds.addAll(query(
                "select id from thread where origin_inbox_message_id in (:ids)", messageIds));
        threadIds.addAll(query(
                "select id from thread where origin_post_id in (:ids)", List.copyOf(postIds)));

        // The people whose thread list is about to lose a conversation, and the
        // boards whose membership is about to change. Both are needed for the
        // invalidations at the end, and neither is readable once the rows are gone.
        List<UUID> otherParticipants = query(
                        "select distinct user_id from thread_participant where thread_id in (:ids)",
                        List.copyOf(threadIds)).stream()
                .filter(id -> !id.equals(userId))
                .toList();
        List<UUID> memberEventIds = jdbc.queryForList(
                "select event_id from event_member where user_id = ?", UUID.class, userId);

        // ------------------------------------------------------------- threads
        // [D5] A thread is a conversation between two people; there is no such
        // thing as half of one. Both sides go, with every message.

        update("delete from report where target_kind = 'thread' and target_id in (:ids)",
                List.copyOf(threadIds));
        update("delete from thread_message where thread_id in (:ids)", List.copyOf(threadIds));
        update("delete from thread_participant where thread_id in (:ids)", List.copyOf(threadIds));
        update("delete from thread where id in (:ids)", List.copyOf(threadIds));

        // [B7] Idempotency keys point at results that no longer exist.
        jdbc.update("delete from request_key where user_id = ?", userId);

        // --------------------------------------------------------- board posts
        // Reactions this account left on other people's posts go; the posts do not.

        jdbc.update("delete from post_reaction where user_id = ?", userId);
        update("delete from post_reaction where post_id in (:ids)", List.copyOf(postIds));
        update("delete from report where target_kind = 'board_post' and target_id in (:ids)",
                List.copyOf(postIds));
        update("delete from board_post where id in (:ids)", List.copyOf(postIds));

        // ------------------------------------------------------------ messages
        // Reports this account filed, and reports filed against content that is
        // about to stop existing. A report about someone else's surviving content
        // stays open for the admin queue.

        jdbc.update("delete from report where reporter_id = ?", userId);
        update("delete from report where target_kind = 'inbox_message' and target_id in (:ids)",
                messageIds);
        update("delete from inbox_message where id in (:ids)", messageIds);

        // -------------------------------------------------------------- person
        // [D6] Blocks in both directions: a block protects a person from someone,
        // and there is no longer a someone on one side of these.

        jdbc.update("delete from block where blocker_id = ? or blocked_id = ?", userId, userId);
        jdbc.update("delete from user_settings where user_id = ?", userId);
        jdbc.update("delete from device where user_id = ?", userId);
        jdbc.update("delete from push_outbox where user_id = ?", userId);
        jdbc.update("delete from entitlement_usage where user_id = ?", userId);
        jdbc.update("delete from section_change where user_id = ?", userId);
        jdbc.update("delete from refresh_token where user_id = ?", userId);
        jdbc.update("delete from password_reset_token where user_id = ?", userId);
        jdbc.update("delete from event_member where user_id = ?", userId);

        // -------------------------------------------------------------- events
        // [D4] A board whose creator leaves is closed, not deleted: the posts on it
        // are other people's and stay readable. Order matters — the pending posts
        // are found through `closed_at is null`, so they must be rejected before
        // the event is stamped closed.

        jdbc.update("""
                update board_post
                   set state = 'rejected',
                       rejection_reason = 'board_closed',
                       rejected_by = null,
                       rejected_at = ?,
                       rejection_undo_token = null,
                       rejection_undo_until = null
                 where state = 'pending'
                   and inbox_message_id is null
                   and event_id in (select id from event where creator_id = ? and closed_at is null)
                """, Timestamp.from(now), userId);
        jdbc.update("""
                update event set closed_at = ?, closed_by = null
                 where creator_id = ? and closed_at is null
                """, Timestamp.from(now), userId);
        // The remaining creator_id and closed_by references would be nulled by the
        // schema's ON DELETE SET NULL anyway; doing it here keeps the statement
        // that matters visible rather than implied.
        jdbc.update("update event set creator_id = null where creator_id = ?", userId);
        jdbc.update("update event set closed_by = null where closed_by = ?", userId);

        // --------------------------------------------------------------- files
        // [B10] The avatar is a file on disk and nothing cascades to it.

        if (avatarKey != null) {
            avatars.delete(avatarKey);
        }
        exports.forget(userId);

        // --------------------------------------------------------------- the row
        // audit_log.actor_id / subject_user_id, screening_term.created_by and
        // app_user.approved_by / inviter_id are ON DELETE SET NULL: an admin's
        // actions and the invite chain's shape survive the person.

        jdbc.update("delete from app_user where id = ?", userId);

        // Nothing is revoked explicitly: the refresh rows are gone and the access
        // token's next request cannot load a user, so it is 401 either way.

        if (!otherParticipants.isEmpty()) {
            publisher.publishEvent(new ThreadsChanged(Set.copyOf(otherParticipants)));
        }
        for (UUID eventId : memberEventIds) {
            // Public only: there is no longer a private view to invalidate, and the
            // room has to refetch — a member left, and posts may have gone with them.
            publisher.publishEvent(BoardChanged.publicOnly(eventId));
        }
    }

    /* ---------------------------------------------------------------- helpers */

    /** {@code in (:ids)} over a list that may be empty; an empty one runs nothing. */
    private void update(String sql, List<UUID> ids) {
        if (!ids.isEmpty()) {
            jdbc.update(expand(sql, ids.size()), ids.toArray());
        }
    }

    private List<UUID> query(String sql, List<UUID> ids) {
        return ids.isEmpty()
                ? List.of()
                : jdbc.queryForList(expand(sql, ids.size()), UUID.class, ids.toArray());
    }

    private static String expand(String sql, int count) {
        return sql.replace(":ids", String.join(", ", Collections.nCopies(count, "?")));
    }
}
