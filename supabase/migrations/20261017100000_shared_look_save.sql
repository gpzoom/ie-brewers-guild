-- Multi-location businesses, part 4 (spec 2026-10-15): the shared look.
-- In a one-manager business the logo, cover, link-preview image and theme
-- are the business's: a save on any location reaches every location's
-- draft in the same transaction, and only the business manager or a Guild
-- admin may change them. Members outside a one-manager business behave
-- exactly as before.

create or replace function public._shared_look_keys(p_section text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_section
    when 'basics' then array['logo_asset_id', 'logo_background', 'cover_asset_id', 'cover_crop', 'og_image_asset_id']
    when 'theme' then array['theme']
    else array[]::text[]
  end;
$$;

create or replace function public._one_manager_business_id(p_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.members m
  join public.businesses b on b.id = m.business_id
  where m.id = p_member_id and b.management_mode = 'one_manager';
$$;

create or replace function public._can_change_shared_look(p_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business uuid := public._one_manager_business_id(p_member_id);
begin
  if v_business is null then
    return true;
  end if;
  return public.is_guild_admin()
    or exists (select 1 from public.businesses where id = v_business and manager_user_id = auth.uid());
end;
$$;

create or replace function public._shared_look_refusal(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format(
    'The logo, cover and theme are shared by all %s locations. %s manages them.',
    b.name,
    coalesce((select u.email from auth.users u where u.id = b.manager_user_id), 'The Guild')
  )
  from public.businesses b
  where b.id = public._one_manager_business_id(p_member_id);
$$;

revoke all on function public._shared_look_keys(text) from public, anon, authenticated;
revoke all on function public._one_manager_business_id(uuid) from public, anon, authenticated;
revoke all on function public._can_change_shared_look(uuid) from public, anon, authenticated;
revoke all on function public._shared_look_refusal(uuid) from public, anon, authenticated;

-- An asset reference must point at this member's own gallery -- otherwise a
-- draft could show another member's photo in its preview. Approval is
-- checked again, strictly, at publish (an asset can be rejected after it
-- was put in a draft). In a one-manager business, a look photo (logo,
-- cover, link preview) owned by any location of the business counts (the
-- shared logo lives in one gallery); carousel slides keep the own-gallery
-- rule.
create or replace function public._draft_assert_own_asset(p_member_id uuid, p_val jsonb, p_what text, p_required boolean default false)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  perform public._draft_assert_castable(p_val, 'uuid', p_what, p_required);
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return;
  end if;
  if not exists (
    select 1 from public.media_assets ma
    where ma.id = (p_val #>> '{}')::uuid
      and (
        ma.member_id = p_member_id
        or (
          p_what in ('logo_asset_id', 'cover_asset_id', 'og_image_asset_id')
          and public._one_manager_business_id(p_member_id) is not null
          and ma.member_id in (
            select m.id from public.members m
            where m.business_id = public._one_manager_business_id(p_member_id)
          )
        )
      )
  ) then
    raise exception '% isn''t in this member''s gallery.', p_what using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public._draft_assert_own_asset(uuid, jsonb, text, boolean) from public, anon, authenticated;

-- Saves one section of the draft. p_data is merged over the section's
-- current contents (a key sent as null clears it; a key left out keeps its
-- value), then the whole merged section is validated, so a stored section
-- is always well-formed. Clients normally send the whole section.
-- Part 4: in a one-manager business the shared-look keys of the save are
-- refused unless the caller is the business manager or a Guild admin, and
-- are copied onto every other location's draft.
create or replace function public.save_member_draft_section(p_member_id uuid, p_section text, p_data jsonb)
returns public.member_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public._draft_require_uid();
  v_row public.member_drafts;
  v_merged jsonb;
  v_look jsonb;
  v_business uuid;
  v_sibling uuid;
begin
  if p_section is null or p_section <> all (public._draft_all_sections()) then
    raise exception 'Unknown draft section: %', coalesce(p_section, 'null') using errcode = '22023';
  end if;
  if not public.can_edit_section(p_member_id, p_section) then
    raise exception 'You can''t edit the % section of this profile.', p_section using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Section data must be an object.' using errcode = '22023';
  end if;

  -- Shared look: the look keys in this save (none outside basics/theme).
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_look
  from jsonb_each(p_data)
  where key = any (public._shared_look_keys(p_section));
  v_business := public._one_manager_business_id(p_member_id);
  if v_business is not null and v_look <> '{}'::jsonb and not public._can_change_shared_look(p_member_id) then
    raise exception '%', public._shared_look_refusal(p_member_id) using errcode = '42501';
  end if;

  perform public._draft_ensure(p_member_id);
  -- Lock the row so two saves of different sections can't overwrite each
  -- other's merge.
  select * into v_row from public.member_drafts d where d.member_id = p_member_id for update;

  v_merged := coalesce(v_row.data -> p_section, '{}'::jsonb) || p_data;
  perform public._validate_draft_section(p_member_id, p_section, v_merged);

  update public.member_drafts d
  set data = d.data || jsonb_build_object(p_section, v_merged),
      dirty_sections = array(
        select s from unnest(public._draft_all_sections()) s
        where s = any (d.dirty_sections) or s = p_section
      ),
      updated_by_user_id = v_uid,
      media_updated_by_user_id = case when p_section = 'media' then v_uid else d.media_updated_by_user_id end
  where d.member_id = p_member_id
  returning * into v_row;

  -- ...and every other location of the business gets the same look.
  if v_business is not null and v_look <> '{}'::jsonb then
    for v_sibling in
      select id from public.members where business_id = v_business and id <> p_member_id
    loop
      perform public._draft_ensure(v_sibling);
      update public.member_drafts d
      set data = d.data || jsonb_build_object(p_section, coalesce(d.data -> p_section, '{}'::jsonb) || v_look),
          dirty_sections = array(
            select s from unnest(public._draft_all_sections()) s
            where s = any (d.dirty_sections) or s = p_section
          ),
          updated_by_user_id = v_uid
      where d.member_id = v_sibling;
      perform public._draft_audit_if_guild_admin(v_sibling, 'member_drafts');
    end loop;
  end if;

  perform public._draft_audit_if_guild_admin(p_member_id, 'member_drafts');
  return v_row;
end;
$$;

revoke execute on function public.save_member_draft_section(uuid, text, jsonb) from public, anon;
grant execute on function public.save_member_draft_section(uuid, text, jsonb) to authenticated;
