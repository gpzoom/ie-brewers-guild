-- "Move back to draft" (plan Decision 13): takes a published member's page
-- offline. Owner, full editor or Guild admin only -- the same people who
-- can make a never-published member live (publish_member_draft). A Photos
-- & events editor can't.
--
-- This is the only member path that sets status = 'draft'. Phase 2 makes
-- status function-only for everyone but a Guild admin
-- (20260925210100_lock_live_profile_writes.sql), so the old direct
-- `update members set status = 'draft'` from the /admin top bar is gone.
--
-- SECURITY DEFINER, same shape as the phase-1 draft functions
-- (20260925200800_member_draft_functions.sql): auth.uid() is still the real
-- signed-in caller inside it, which is what the role check and the audit
-- row use. The draft is left alone -- unpublishing changes whether the page
-- is visible, not what's on it.
--
-- Idempotent for an already-draft member (returns 'draft'). Refuses the
-- Guild's own roster statuses (applied, declined, suspended): those belong
-- to the roster actions.
create or replace function public.unpublish_member(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members;
begin
  perform public._draft_require_uid();
  if not public.is_member_full_editor(p_member_id) then
    raise exception 'Only the owner or a full editor can take this profile offline.' using errcode = '42501';
  end if;

  select * into v_member from public.members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_member.status = 'draft' then
    return v_member.status;
  end if;
  if v_member.status <> 'published' then
    raise exception 'This profile can''t be moved back to draft while its status is %.', v_member.status using errcode = '42501';
  end if;

  update public.members m
  set status = 'draft'
  where m.id = p_member_id;

  perform public._draft_audit_if_guild_admin(p_member_id, 'members');
  return 'draft';
end;
$$;

revoke execute on function public.unpublish_member(uuid) from public, anon;
grant execute on function public.unpublish_member(uuid) to authenticated;
