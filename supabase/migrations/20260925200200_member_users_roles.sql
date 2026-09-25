-- Three roles per member (spec, "People and permissions"): owner, full
-- editor ('editor', the existing value -- kept so no existing row changes
-- meaning) and the Photos & events editor ('media_events').
alter table public.member_users
  drop constraint member_users_role_check,
  add constraint member_users_role_check check (role in ('owner', 'editor', 'media_events'));

-- One owner per member: the owner is the one who connects the calendar and
-- manages People, and changing owner is a Guild admin job from the roster.
--
-- inviteMember (src/lib/guild/invite-member.server.ts) always inserts
-- role = 'owner', so a member invited twice under two addresses could
-- already have two owners. Checked on the linked project on 2026-09-25: none
-- did. Should one appear before this runs, the oldest owner row stays owner
-- and any later ones become full editors -- same access to the profile,
-- minus the owner-only calendar and People actions -- instead of this
-- migration failing on the unique index below.
update public.member_users mu
set role = 'editor'
where mu.role = 'owner'
  and exists (
    select 1 from public.member_users older
    where older.member_id = mu.member_id
      and older.role = 'owner'
      and (older.created_at, older.id) < (mu.created_at, mu.id)
  );

create unique index member_users_one_owner_per_member
  on public.member_users (member_id)
  where role = 'owner';
