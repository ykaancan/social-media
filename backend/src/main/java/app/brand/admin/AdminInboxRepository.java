package app.brand.admin;

import app.brand.message.InboxMessage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The admin's view of {@code inbox_message}, kept away from
 * {@code InboxMessageRepository} on purpose: every query there carries the
 * recipient's visibility rule (not deleted, not blocked [D6]/[D12]), and the
 * admin's two reads are exactly the ones that must <em>not</em> — a report is
 * still answerable after the recipient deleted the message, and the flagged list
 * [B9] is about what was delivered, not about what anybody can still see.
 *
 * <p>Nothing here is reachable from a member route: the only callers are
 * {@code /admin/api/*}, which is {@code super_admin} and approved.
 */
public interface AdminInboxRepository extends JpaRepository<InboxMessage, UUID> {

    /**
     * [B9] The flagged list: messages delivered with an acknowledged soft match,
     * newest first. Soft-deleted rows stay in it — the flag is about the sender's
     * behaviour, and the recipient tidying their inbox does not answer it.
     */
    @Query("select m from InboxMessage m where m.screeningFlag = :flag "
            + "order by m.createdAt desc, m.id desc")
    List<InboxMessage> flagged(@Param("flag") String flag);
}
