-- Role helpers for the draft functions and role-aware RLS (spec, "People
-- and permissions" -> "Enforcement"). is_member_editor() (in
-- 20260922034939_member_users_table.sql) answers "is the caller linked at
-- all?" and ignores role; these answer "what may the caller do?".
--
-- SECURITY DEFINER for the same reason as is_guild_admin(): member_users'
-- own RLS would otherwise get in the way when these run inside another
-- table's policy. auth.uid() is still the real caller inside them.
--
-- A Guild admin counts as a full editor of every member. That is what "Edit
-- as them" needs (spec: "A Guild admin impersonating acts with owner
-- rights"), and every draft function audits the Guild admin's writes so the
-- real actor is still on record.

-- The caller's role on this member, or null when they aren't linked. A
-- Guild admin who isn't linked gets null here -- use the two helpers below
-- for permission checks, not this.
create or replace function public.member_role(target_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mu.role
  from public.member_users mu
  where mu.member_id = target_member_id and mu.user_id = auth.uid();
$$;

-- Owner, full editor or Guild admin: everyone who may edit every section,
-- run the setup wizard, and make a never-published member live.
create or replace function public.is_member_full_editor(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_guild_admin()
    or coalesce(public.member_role(target_member_id) in ('owner', 'editor'), false);
$$;

-- May the caller save, publish or discard this draft section? Unknown
-- section names are always false, so a typo can't fall through to "allowed".
-- media_events may touch only 'media' -- cover and logo live in 'basics'
-- precisely so they stay with the owner and full editors.
create or replace function public.can_edit_section(target_member_id uuid, section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when section is null
      or section not in ('basics', 'media', 'links', 'discount', 'theme') then false
    when public.is_member_full_editor(target_member_id) then true
    else section = 'media'
      and coalesce(public.member_role(target_member_id) = 'media_events', false)
  end;
$$;

-- Supabase's default privileges hand every new public function to anon;
-- these are only ever meaningful for a signed-in caller.
revoke execute on function public.member_role(uuid) from public, anon;
revoke execute on function public.is_member_full_editor(uuid) from public, anon;
revoke execute on function public.can_edit_section(uuid, text) from public, anon;
grant execute on function public.member_role(uuid) to authenticated;
grant execute on function public.is_member_full_editor(uuid) to authenticated;
grant execute on function public.can_edit_section(uuid, text) to authenticated;
