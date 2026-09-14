-- =====================================================================
-- [BRAND] stage-1 schema.
--
-- THIS FILE IS NEVER EDITED ONCE IT HAS BEEN APPLIED. Flyway migrations
-- are only ever added to (CLAUDE.md, "Schema changes only via Flyway
-- migrations; never edit an applied migration"). A wrong column is a new
-- V-numbered migration, not a hand edit here.
--
-- It is the whole of BACKEND_PLAN.md §2 in one migration, as the brief §10
-- requires: every stage-1 table, including the ones build steps B-2..B-5
-- will use. Later steps add code, not tables.
--
-- Conventions:
--   * ids are uuid, defaulted to gen_random_uuid() (built in from PG 13) [B2]
--   * every timestamp is timestamptz
--   * every enum is a CHECK on text, so extending it is an ALTER, not a
--     type migration
--   * "anonymity columns" [B4] = sender_id, anonymity_level, hint_section,
--     hint_country, hint_letter, sender_section_id. sender_section_id is the
--     section the sender was in WHEN THEY SENT, so [D7] section changes never
--     rewrite history and [D11] country stays checkable.
--   * ON DELETE: RESTRICT by default. Real account deletion (KVKK) is done
--     explicitly and in order by the deletion service, so the database must
--     refuse a partial delete rather than cascade one. SET NULL is used only
--     where a reference is deliberately cleared and the row survives.
-- =====================================================================

-- ---------------------------------------------------------------- graph
-- [D11] Country → Section → User. Country is only ever reached through the
-- section; it is not a field on a person.

create table country (
    code text primary key check (char_length(code) = 2),
    name text not null
);

create table section (
    id           uuid primary key default gen_random_uuid(),
    name         text        not null,
    country_code text        not null references country (code) on delete restrict,
    created_at   timestamptz not null default now()
);

create index section_country_idx on section (country_code);

-- ---------------------------------------------------------------- accounts

create table app_user (
    id            uuid primary key default gen_random_uuid(),
    email         text        not null,
    password_hash text        not null,
    phone         text,
    -- [D7] `pending` means the account cannot use the app yet; there is no
    -- approved-but-read-only state.
    status        text        not null check (status in ('incomplete', 'pending', 'approved', 'rejected', 'banned')),
    -- event_moderator is NEVER stored here: it is event_member.is_moderator.
    role          text        not null default 'member' check (role in ('member', 'super_admin')),
    name          text check (char_length(name) <= 40),
    bio           text check (char_length(bio) <= 80),
    avatar_key    text,
    section_id    uuid references section (id) on delete restrict,
    -- Invite chain: stage 2 uses it, the column exists from migration 1.
    inviter_id    uuid references app_user (id) on delete set null,
    created_at    timestamptz not null default now(),
    submitted_at  timestamptz,
    approved_at   timestamptz,
    approved_by   uuid references app_user (id) on delete set null,
    banned_at     timestamptz
);

-- Case-insensitive uniqueness: register compares lower(email).
create unique index app_user_email_key on app_user (lower(email));
create index app_user_section_idx on app_user (section_id);
create index app_user_status_idx on app_user (status);

-- [B3] Opaque 256-bit refresh tokens, stored hashed, rotated on every refresh.
create table refresh_token (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id) on delete restrict,
    token_hash text        not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create index refresh_token_user_idx on refresh_token (user_id);

-- One-hour password reset tokens, also stored hashed.
create table password_reset_token (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id) on delete restrict,
    token_hash text        not null unique,
    expires_at timestamptz not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);

create index password_reset_token_user_idx on password_reset_token (user_id);

-- Created with the account, so settings reads never have to cope with a missing row.
create table user_settings (
    user_id                uuid primary key references app_user (id) on delete restrict,
    writing_policy         text    not null default 'anyone' check (writing_policy in ('anyone', 'named_only', 'nobody')),
    -- [D10] Muted words never affect delivery. Stored as entered and as the
    -- normalised form the matcher uses (TextNormalizer).
    muted_words            text[]  not null default '{}',
    muted_words_normalized text[]  not null default '{}',
    notify_inbox           boolean not null default true,
    notify_threads         boolean not null default true,
    notify_board_mentions  boolean not null default true
);

-- [D7] Section changes are logged and rate-limited to one per 30 days.
-- sectionChangeAvailableAt = max(changed_at) + 30 days.
create table section_change (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid        not null references app_user (id) on delete restrict,
    from_section_id uuid references section (id) on delete restrict,
    to_section_id   uuid        not null references section (id) on delete restrict,
    changed_at      timestamptz not null default now()
);

create index section_change_user_idx on section_change (user_id, changed_at desc);

-- [B8] Expo push tokens.
create table device (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid        not null references app_user (id) on delete restrict,
    push_token   text        not null unique,
    platform     text        not null check (platform in ('ios', 'android', 'web')),
    locale       text        not null default 'en',
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index device_user_idx on device (user_id);

-- ---------------------------------------------------------------- events
-- [D4] There is no status column. status is derived from closed_at, starts_at,
-- ends_at and now() [B5]. "Closed" is a label, not a fourth status.

create table event (
    id         uuid primary key default gen_random_uuid(),
    name       text        not null check (char_length(name) between 2 and 40),
    scope      text        not null check (scope in ('section', 'national')),
    -- Always the creator's section at creation time; the DTO exposes it only
    -- when scope = 'section', but country is always read from it [D11].
    section_id uuid        not null references section (id) on delete restrict,
    starts_at  timestamptz not null,
    ends_at    timestamptz not null,
    cover      text        not null check (cover in ('magenta', 'coral', 'tangerine', 'amber', 'lime', 'mint', 'azure', 'violet')),
    board_mode text        not null check (board_mode in ('approve_first', 'post_immediately')),
    -- 6 chars from ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0, 1).
    join_code  text        not null unique,
    -- Cleared when the creator deletes their account; the event and its posts survive.
    creator_id uuid references app_user (id) on delete set null,
    closed_at  timestamptz,
    closed_by  uuid references app_user (id) on delete set null,
    created_at timestamptz not null default now(),
    constraint event_ends_after_start check (ends_at > starts_at)
);

create index event_section_idx on event (section_id);
create index event_creator_idx on event (creator_id);

create table event_member (
    event_id     uuid        not null references event (id) on delete restrict,
    user_id      uuid        not null references app_user (id) on delete restrict,
    -- The creator's row is a moderator row; canManageModerators is
    -- event.creator_id = viewer, never this flag.
    is_moderator boolean     not null default false,
    joined_at    timestamptz not null default now(),
    primary key (event_id, user_id)
);

create index event_member_user_idx on event_member (user_id);

-- ---------------------------------------------------------------- messages
-- [D12] state is new | private | approved and moves freely in both directions.
-- The wall is exactly state = 'approved' and deleted_at is null.

create table inbox_message (
    id                uuid primary key default gen_random_uuid(),
    sender_id         uuid        not null references app_user (id) on delete restrict,
    recipient_id      uuid        not null references app_user (id) on delete restrict,
    -- The event the message was written from; required for wall access checks.
    event_id          uuid references event (id) on delete restrict,
    text              text        not null check (char_length(text) between 1 and 280),
    anonymity_level   text        not null check (anonymity_level in ('anonymous', 'hint', 'named')),
    hint_section      boolean     not null default false,
    hint_country      boolean     not null default false,
    hint_letter       boolean     not null default false,
    sender_section_id uuid references section (id) on delete restrict,
    state             text        not null default 'new' check (state in ('new', 'private', 'approved')),
    state_changed_at  timestamptz not null default now(),
    -- True when the message arrived from a board post ("approved from the board").
    from_board        boolean     not null default false,
    -- [D10] a muted word files the message to `private` and suppresses the push.
    -- The sender is never told; delivery is unaffected.
    muted_match       boolean     not null default false,
    push_suppressed   boolean     not null default false,
    -- [B9] 'soft' when delivered with an acknowledged soft screening match.
    screening_flag    text check (screening_flag in ('soft')),
    -- [D12] Soft delete: a reported message survives the recipient deleting it.
    deleted_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index inbox_message_recipient_idx on inbox_message (recipient_id, deleted_at, created_at desc);
create index inbox_message_sender_idx on inbox_message (sender_id);
create index inbox_message_event_idx on inbox_message (event_id);

-- ---------------------------------------------------------------- boards

create table board_post (
    id                   uuid primary key default gen_random_uuid(),
    event_id             uuid        not null references event (id) on delete restrict,
    sender_id            uuid        not null references app_user (id) on delete restrict,
    text                 text        not null check (char_length(text) between 1 and 280),
    anonymity_level      text        not null check (anonymity_level in ('anonymous', 'hint', 'named')),
    hint_section         boolean     not null default false,
    hint_country         boolean     not null default false,
    hint_letter          boolean     not null default false,
    sender_section_id    uuid references section (id) on delete restrict,
    state                text        not null check (state in ('pending', 'approved', 'rejected')),
    -- [D9] a moderator's own room post is 'auto_approved_by_author'.
    approval_kind        text check (approval_kind in ('auto_approved_by_author', 'immediate', 'moderator')),
    -- [D4]/[D8] rejection is final; 'board_closed' is stamped by the housekeeping job.
    rejection_reason     text check (rejection_reason in ('moderator', 'board_closed')),
    rejected_by          uuid references app_user (id) on delete set null,
    rejected_at          timestamptz,
    -- [B6] The 5-second undo is a row, not a timer.
    rejection_undo_token text,
    rejection_undo_until timestamptz,
    hidden_at            timestamptz,
    hidden_by            uuid references app_user (id) on delete set null,
    -- A post addressed to a person: published on the board iff that inbox
    -- message is approved and not deleted. Never enters the queue.
    inbox_message_id     uuid references inbox_message (id) on delete restrict,
    created_at           timestamptz not null default now()
);

create index board_post_event_idx on board_post (event_id, state, created_at desc);
create index board_post_sender_idx on board_post (sender_id);
create index board_post_inbox_message_idx on board_post (inbox_message_id);
create unique index board_post_undo_token_idx on board_post (rejection_undo_token) where rejection_undo_token is not null;

-- Emoji set is 5 characters wide and lives in application code, not in a CHECK:
-- one of them carries a variation selector, and this file can never be edited.
create table post_reaction (
    post_id    uuid        not null references board_post (id) on delete restrict,
    user_id    uuid        not null references app_user (id) on delete restrict,
    emoji      text        not null,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);

create index post_reaction_user_idx on post_reaction (user_id);

-- ---------------------------------------------------------------- threads

create table thread (
    id                      uuid primary key default gen_random_uuid(),
    origin_kind             text        not null check (origin_kind in ('inbox', 'post')),
    origin_inbox_message_id uuid references inbox_message (id) on delete restrict,
    origin_post_id          uuid references board_post (id) on delete restrict,
    -- Carries ThreadSummary.source (the event name), when there is one.
    event_id                uuid references event (id) on delete restrict,
    created_at              timestamptz not null default now(),
    last_message_at         timestamptz not null default now(),
    constraint thread_origin_present check (
        (origin_kind = 'inbox' and origin_inbox_message_id is not null and origin_post_id is null)
        or (origin_kind = 'post' and origin_post_id is not null and origin_inbox_message_id is null)
    )
);

create index thread_origin_inbox_idx on thread (origin_inbox_message_id);
create index thread_origin_post_idx on thread (origin_post_id);
create index thread_last_message_idx on thread (last_message_at desc);

-- [D5] The level NEW messages go out at. Never used to render old bubbles.
create table thread_participant (
    thread_id         uuid        not null references thread (id) on delete restrict,
    user_id           uuid        not null references app_user (id) on delete restrict,
    anonymity_level   text        not null check (anonymity_level in ('anonymous', 'hint', 'named')),
    hint_section      boolean     not null default false,
    hint_country      boolean     not null default false,
    hint_letter       boolean     not null default false,
    sender_section_id uuid references section (id) on delete restrict,
    revealed_at       timestamptz,
    -- [B2] read watermark is an integer comparison against thread_message.seq.
    read_through_seq  bigint      not null default 0,
    joined_at         timestamptz not null default now(),
    primary key (thread_id, user_id)
);

create index thread_participant_user_idx on thread_participant (user_id);

-- [D5] anonymity_level here is the level the message WAS SENT AT and is never
-- rewritten. Reveal inserts a system row; it does not unmask what was sent.
create table thread_message (
    id                uuid primary key default gen_random_uuid(),
    thread_id         uuid        not null references thread (id) on delete restrict,
    seq               bigint      not null,
    sender_id         uuid        not null references app_user (id) on delete restrict,
    text              text        not null check (char_length(text) <= 500),
    anonymity_level   text        not null check (anonymity_level in ('anonymous', 'hint', 'named')),
    hint_section      boolean     not null default false,
    hint_country      boolean     not null default false,
    hint_letter       boolean     not null default false,
    sender_section_id uuid references section (id) on delete restrict,
    -- 'revealed' marks the system row appended by POST /threads/{id}/reveal.
    system            text check (system in ('revealed')),
    created_at        timestamptz not null default now()
);

create unique index thread_message_seq_idx on thread_message (thread_id, seq);
create index thread_message_sender_idx on thread_message (sender_id);

-- [B7] Idempotency keys for POST /threads and POST /threads/{id}/messages.
-- Purged after 7 days by the housekeeping job.
create table request_key (
    user_id          uuid        not null references app_user (id) on delete restrict,
    key              text        not null check (char_length(key) <= 100),
    fingerprint_hash text        not null,
    result_id        uuid,
    created_at       timestamptz not null default now(),
    primary key (user_id, key)
);

create index request_key_created_idx on request_key (created_at);

-- ---------------------------------------------------------------- safety

-- [D6] Block never deletes another person's content. It is issued BY MESSAGE ID,
-- so the blocker never learns who an anonymous sender was: the display columns
-- freeze the identity the blocked person had already allowed.
create table block (
    id                 uuid primary key default gen_random_uuid(),
    blocker_id         uuid        not null references app_user (id) on delete restrict,
    blocked_id         uuid        not null references app_user (id) on delete restrict,
    display_level      text        not null check (display_level in ('anonymous', 'hint', 'named')),
    display_section    boolean     not null default false,
    display_country    boolean     not null default false,
    display_letter     boolean     not null default false,
    display_section_id uuid references section (id) on delete restrict,
    created_at         timestamptz not null default now(),
    constraint block_not_self check (blocker_id <> blocked_id),
    constraint block_pair_key unique (blocker_id, blocked_id)
);

create index block_blocker_idx on block (blocker_id);
create index block_blocked_idx on block (blocked_id);

create table report (
    id          uuid primary key default gen_random_uuid(),
    reporter_id uuid        not null references app_user (id) on delete restrict,
    target_kind text        not null check (target_kind in ('inbox_message', 'board_post', 'thread')),
    target_id   uuid        not null,
    reason      text        not null check (reason in ('harassment', 'hate', 'sexual', 'identity', 'spam')),
    status      text        not null default 'open' check (status in ('open', 'dismissed', 'hidden', 'warned', 'banned')),
    resolved_by uuid references app_user (id) on delete set null,
    resolved_at timestamptz,
    created_at  timestamptz not null default now(),
    constraint report_one_per_reporter unique (reporter_id, target_kind, target_id)
);

create index report_status_idx on report (status, created_at desc);
create index report_target_idx on report (target_kind, target_id);

-- Every super_admin identity view writes a row here BEFORE the response is built.
create table audit_log (
    id              uuid primary key default gen_random_uuid(),
    -- SET NULL: the log survives the actor deleting their own account.
    actor_id        uuid references app_user (id) on delete set null,
    action          text        not null check (action in ('identity_view', 'approve_user', 'reject_user', 'ban_user', 'warn_user', 'hide_content', 'promote_admin')),
    -- SET NULL for the same reason: real deletion must not be blocked by, nor
    -- destroy, the record that an admin acted.
    subject_user_id uuid references app_user (id) on delete set null,
    subject_kind    text,
    subject_id      uuid,
    details         jsonb,
    created_at      timestamptz not null default now()
);

create index audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index audit_log_subject_idx on audit_log (subject_user_id, created_at desc);

-- [B9] Keyword screening as data. `normalized` uses the same TextNormalizer as
-- muted words, section search and people search.
create table screening_term (
    id         uuid primary key default gen_random_uuid(),
    term       text        not null,
    normalized text        not null,
    severity   text        not null check (severity in ('hard', 'soft')),
    created_by uuid references app_user (id) on delete set null,
    created_at timestamptz not null default now(),
    constraint screening_term_unique unique (normalized, severity)
);

create index screening_term_normalized_idx on screening_term (normalized);

-- ---------------------------------------------------------------- money (off)
-- Brief §3: the entitlement layer exists from migration 1 and is switched off.
-- Nothing reads these counters while the config flags are false.
create table entitlement_usage (
    user_id      uuid    not null references app_user (id) on delete restrict,
    period_start date    not null,
    inbox_reads  integer not null default 0,
    cold_opens   integer not null default 0,
    primary key (user_id, period_start)
);

-- ---------------------------------------------------------------- push
-- [B8] Durable outbox drained by the housekeeping job.
create table push_outbox (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id) on delete restrict,
    kind       text        not null,
    locale     text        not null default 'en',
    payload    jsonb       not null,
    created_at timestamptz not null default now(),
    sent_at    timestamptz,
    attempts   integer     not null default 0,
    last_error text
);

create index push_outbox_pending_idx on push_outbox (created_at) where sent_at is null;
create index push_outbox_user_idx on push_outbox (user_id);
