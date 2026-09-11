-- V3: the housekeeping job's index [B5].
--
-- Every 5 seconds, and again at the start of every board read and write, the
-- server asks two questions of the whole table:
--
--   * which boards hold a rejection whose 5-second undo window has run out [B6]
--     (BoardPostRepository.eventsWithExpiredUndo), and
--   * which boards are closed or past their end and still hold pending posts [D4]
--     (BoardPostRepository.eventsWithPendingPostsPastEnd),
--
-- plus BoardService's per-event pass (pendingRoomPosts). All three filter on
-- exactly the same two constants — a room post (no inbox_message_id) that is
-- still pending — and then on event_id and rejection_undo_until.
--
-- board_post_event_idx (event_id, state, created_at desc) cannot answer the two
-- housekeeping queries: they have no event id to start from, so they scan every
-- post ever written at every event, twelve times a minute, forever.
--
-- Partial, because the interesting rows are a vanishing fraction of the table:
-- a post is pending for seconds and published for the life of the event. The
-- index therefore stays roughly the size of one board's queue no matter how
-- large board_post grows, and a post leaving the queue leaves the index too.
create index board_post_pending_room_idx
    on board_post (event_id, rejection_undo_until)
    where state = 'pending' and inbox_message_id is null;
