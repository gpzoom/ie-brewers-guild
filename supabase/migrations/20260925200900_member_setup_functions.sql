-- The two setup-wizard gates (spec, "Wizard or portal: one rule" and
-- "Member type: confirm once, then locked"). A member is in setup until
-- both have run; after that /portal never shows the wizard again.
--
-- These are the only non-Guild-admin writers of type_confirmed_at,
-- type_confirmed_by_user_id and setup_completed_at. The write-limits
-- trigger (20260925201100_member_role_write_limits.sql) lets those columns
-- through only while the transaction-local 'app.member_fn' flag is on and
-- the update runs as the function owner, so each function turns it on just
-- around its own update and off again.
--
-- Both require status 'draft' or 'published': an applied, declined or
-- suspended member isn't a working member yet (or any more), and shouldn't
-- be able to lock its type or leave setup.

-- Wizard step 2. Allowed once (type_confirmed_at is null), owner / full
-- editor / Guild admin. Always writes an audit_log row against the real
-- signed-in actor, even for a member: a type chosen in setup is a change
-- the Guild wants on record. audit_log's insert policy is Guild-admin-only,
-- but that policy governs direct client inserts; this function runs as
-- the table owner and bypasses it, which is the point -- the actor is still
-- auth.uid(), never a value the client passes in.
--
-- Returns {old_type, new_type, changed} so the app can send the "changed
-- their type during setup" email to the Guild when changed is true.
create or replace function public.confirm_member_type(p_member_id uuid, p_new_type text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public._draft_require_uid();
  v_member public.members;
begin
  if not public.is_member_full_editor(p_member_id) then
    raise exception 'Only the owner or a full editor can confirm the member type.' using errcode = '42501';
  end if;
  if p_new_type is null or p_new_type not in ('producer', 'mobile', 'allied') then
    raise exception 'Unknown member type: %', coalesce(p_new_type, 'null') using errcode = '22023';
  end if;

  select * into v_member from public.members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_member.status not in ('draft', 'published') then
    raise exception 'The member type can''t be confirmed while the member''s status is %.', v_member.status using errcode = '42501';
  end if;
  if v_member.type_confirmed_at is not null then
    raise exception 'The member type is already confirmed. Ask the Guild to change it.' using errcode = '42501';
  end if;

  perform set_config('app.member_fn', 'on', true);
  update public.members m
  set member_type = p_new_type,
      type_confirmed_at = now(),
      type_confirmed_by_user_id = v_uid
  where m.id = p_member_id;
  perform set_config('app.member_fn', '', true);

  insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
  values (v_uid, p_member_id, 'members', p_member_id, 'update');

  return jsonb_build_object(
    'old_type', v_member.member_type,
    'new_type', p_new_type,
    'changed', v_member.member_type <> p_new_type
  );
end;
$$;

-- Wizard step 3's Continue. Requires the type to be confirmed and a
-- non-empty business name and city in the draft's basics (live's, if no
-- draft exists yet). Idempotent: once set, setup_completed_at never moves,
-- and calling again just returns it.
create or replace function public.complete_member_setup(p_member_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members;
  v_basics jsonb;
begin
  perform public._draft_require_uid();
  if not public.is_member_full_editor(p_member_id) then
    raise exception 'Only the owner or a full editor can finish setup.' using errcode = '42501';
  end if;

  select * into v_member from public.members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_member.status not in ('draft', 'published') then
    raise exception 'Setup can''t be completed while the member''s status is %.', v_member.status using errcode = '42501';
  end if;
  if v_member.setup_completed_at is not null then
    return v_member.setup_completed_at;
  end if;
  if v_member.type_confirmed_at is null then
    raise exception 'Confirm the member type first.' using errcode = '22023';
  end if;

  select d.data -> 'basics' into v_basics from public.member_drafts d where d.member_id = p_member_id;
  if v_basics is null then
    v_basics := public._draft_section_from_live(p_member_id, 'basics');
  end if;
  if coalesce(btrim(v_basics ->> 'business_name'), '') = '' then
    raise exception 'Add your business name to continue.' using errcode = '22023';
  end if;
  if coalesce(btrim(v_basics ->> 'city'), '') = '' then
    raise exception 'Add your city to continue.' using errcode = '22023';
  end if;

  perform set_config('app.member_fn', 'on', true);
  update public.members m
  set setup_completed_at = now()
  where m.id = p_member_id
  returning * into v_member;
  perform set_config('app.member_fn', '', true);

  perform public._draft_audit_if_guild_admin(p_member_id, 'members');
  return v_member.setup_completed_at;
end;
$$;

revoke execute on function public.confirm_member_type(uuid, text) from public, anon;
revoke execute on function public.complete_member_setup(uuid) from public, anon;
grant execute on function public.confirm_member_type(uuid, text) to authenticated;
grant execute on function public.complete_member_setup(uuid) to authenticated;
