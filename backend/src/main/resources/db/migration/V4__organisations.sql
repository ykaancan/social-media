-- =====================================================================
-- Organisations [D13]–[D18]. Plan and reasoning: /TENANT_PLAN.md, /DECISIONS.md.
--
-- NEVER EDITED ONCE APPLIED.
--
-- What this migration does, in order:
--   1. organisation                      [D13] owns events and, optionally, sections
--   2. section.organisation_id           [D15] a section belongs to one organisation
--   3. organisation_member               [D14] approval and [D15] section live here
--   4. app_user: email confirmation      [D18]
--      app_user.status                   [D14] incomplete | active | banned
--   5. email_confirmation_token          [D18]
--   6. event.organisation_id             [D13]; section_id and scope become optional
--   7. section_change.organisation_id    [D7]/[D15] the 30-day limit is per organisation
--   8. audit_log actions for the new admin operations
--
-- Existing rows all move into ONE organisation, 'ESN Türkiye', because every
-- section seeded by V2 is a section of that network.
--
-- app_user.section_id is deliberately LEFT IN PLACE. Step T-1 still reads it;
-- step T-2 moves every read to organisation_member.section_id. Dropping the
-- column is a later migration, after nothing reads it.
-- =====================================================================

-- ---------------------------------------------------------------- 1. organisation

create table organisation (
    id                uuid primary key default gen_random_uuid(),
    -- Same bounds as event.name.
    name              text        not null check (char_length(name) between 2 and 40),
    -- [D14] true: a new membership starts 'pending' and an organisation admin
    -- decides. false: a new membership is 'approved' at once.
    approval_required boolean     not null,
    -- [D15] false for an organisation with no sections (a bar, a club). Never
    -- changed after creation (TENANT_PLAN.md P10); the application refuses it.
    has_sections      boolean     not null,
    -- [D16] who may create an event here.
    event_creation    text        not null check (event_creation in ('admins', 'members')),
    created_by        uuid references app_user (id) on delete set null,
    created_at        timestamptz not null default now()
);

-- 'members' is what the product did before this migration: any approved
-- account could create an event.
insert into organisation (name, approval_required, has_sections, event_creation)
values ('ESN Türkiye', true, true, 'members');

-- ---------------------------------------------------------------- 2. sections

alter table section
    add column organisation_id uuid references organisation (id) on delete restrict;

update section
set organisation_id = (select id from organisation where name = 'ESN Türkiye');

alter table section
    alter column organisation_id set not null;

create index section_organisation_idx on section (organisation_id);

-- Target of the composite foreign key on organisation_member: it is what makes
-- "a membership's section belongs to the membership's organisation" a database
-- guarantee and not only an application check.
alter table section
    add constraint section_id_organisation_key unique (id, organisation_id);

-- ---------------------------------------------------------------- 3. memberships

create table organisation_member (
    organisation_id  uuid        not null references organisation (id) on delete restrict,
    user_id          uuid        not null references app_user (id) on delete restrict,
    -- [D14] 'pending' and 'rejected' only ever occur where approval_required is true.
    status           text        not null check (status in ('pending', 'approved', 'rejected')),
    -- [D14]/[D19] 'admin' approves and rejects members of this organisation and
    -- nothing else.
    role             text        not null default 'member' check (role in ('member', 'admin')),
    -- [D15] Required by the application iff the organisation has sections.
    section_id       uuid,
    -- [D17] The event the request came from; approval joins it automatically.
    -- SET NULL: an event that no longer exists must not block the approval.
    pending_event_id uuid references event (id) on delete set null,
    submitted_at     timestamptz not null default now(),
    approved_at      timestamptz,
    approved_by      uuid references app_user (id) on delete set null,
    created_at       timestamptz not null default now(),
    primary key (organisation_id, user_id),
    -- Not checked while section_id is null (MATCH SIMPLE).
    constraint organisation_member_section_fk
        foreign key (section_id, organisation_id)
            references section (id, organisation_id) on delete restrict
);

create index organisation_member_user_idx on organisation_member (user_id);
create index organisation_member_queue_idx on organisation_member (organisation_id, status, submitted_at);
create index organisation_member_section_idx on organisation_member (section_id);

-- Every account that had sent a profile had a section, and so gets a membership
-- in 'ESN Türkiye' with that section. The status mapping:
--   approved                          -> approved
--   rejected                          -> rejected
--   banned, and was approved before   -> approved  (the ban is on the account)
--   pending, or banned never approved -> pending
insert into organisation_member
    (organisation_id, user_id, status, role, section_id, submitted_at, approved_at, approved_by, created_at)
select s.organisation_id,
       u.id,
       case
           when u.status = 'approved' then 'approved'
           when u.status = 'rejected' then 'rejected'
           when u.status = 'banned' and u.approved_at is not null then 'approved'
           else 'pending'
       end,
       'member',
       u.section_id,
       coalesce(u.submitted_at, u.created_at),
       u.approved_at,
       u.approved_by,
       u.created_at
from app_user u
         join section s on s.id = u.section_id
where u.status <> 'incomplete';

-- ---------------------------------------------------------------- 4. accounts

-- [D18] Null until the confirmation link is opened.
alter table app_user
    add column email_confirmed_at timestamptz;

-- TENANT_PLAN.md P4: accounts that exist before this migration are treated as
-- confirmed, otherwise every existing account is locked out.
update app_user
set email_confirmed_at = now();

-- [D14] Approval is no longer an account state.
alter table app_user
    drop constraint app_user_status_check;

update app_user
set status = 'active'
where status in ('pending', 'approved', 'rejected');

alter table app_user
    add constraint app_user_status_check check (status in ('incomplete', 'active', 'banned'));

-- ---------------------------------------------------------------- 5. confirmation tokens

-- [D18] Same shape as password_reset_token: stored hashed, single use.
-- Lifetime (24 h, P2) and resend spacing (60 s, P3, read from max(created_at))
-- are application configuration, not schema.
create table email_confirmation_token (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id) on delete restrict,
    token_hash text        not null unique,
    expires_at timestamptz not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);

create index email_confirmation_token_user_idx on email_confirmation_token (user_id, created_at desc);

-- ---------------------------------------------------------------- 6. events

alter table event
    add column organisation_id uuid references organisation (id) on delete restrict;

update event e
set organisation_id = s.organisation_id
from section s
where s.id = e.section_id;

alter table event
    alter column organisation_id set not null;

create index event_organisation_idx on event (organisation_id);

-- An organisation without sections has events with neither (TENANT_PLAN.md P9).
-- The existing CHECK on scope already accepts null.
alter table event
    alter column section_id drop not null;

alter table event
    alter column scope drop not null;

-- ---------------------------------------------------------------- 7. section changes

alter table section_change
    add column organisation_id uuid references organisation (id) on delete restrict;

update section_change c
set organisation_id = s.organisation_id
from section s
where s.id = c.to_section_id;

alter table section_change
    alter column organisation_id set not null;

drop index section_change_user_idx;
create index section_change_user_idx on section_change (user_id, organisation_id, changed_at desc);

-- ---------------------------------------------------------------- 8. audit actions

-- 'approve_user' and 'reject_user' stay in the list: rows written before this
-- migration keep their action.
alter table audit_log
    drop constraint audit_log_action_check;

alter table audit_log
    add constraint audit_log_action_check check (action in (
        'identity_view', 'approve_user', 'reject_user', 'ban_user', 'warn_user', 'hide_content', 'promote_admin',
        'create_organisation', 'update_organisation', 'assign_organisation_admin', 'remove_organisation_admin',
        'approve_member', 'reject_member'));
