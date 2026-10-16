-- Multi-location businesses, part 4: a short setup for the next location.
-- When a location of a one-manager business has not been set up yet and
-- another location has, copy the parts that are usually the same (tagline,
-- phone, member-since year, links, and for mobile brewers the supplies)
-- into this location's draft -- once, and only onto empty fields. A
-- published source location gives its live values, else its draft's.
-- Returns true when it copied, false when it did nothing.

create or replace function public.prefill_location_setup(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public._draft_require_uid();
  v_business uuid;
  v_source uuid;
  v_type text;
  v_draft public.member_drafts;
  v_src_draft public.member_drafts;
  v_src_live boolean;
  v_src_basics jsonb;
  v_src_links jsonb;
  v_src_discount jsonb;
  v_basics jsonb;
  v_links jsonb;
  v_discount jsonb;
  v_copy_discount boolean;
begin
  if not public.is_member_full_editor(p_member_id) then
    raise exception 'You can''t edit this profile.' using errcode = '42501';
  end if;

  v_business := public._one_manager_business_id(p_member_id);
  if v_business is null then
    return false;
  end if;

  select m.id into v_source
  from public.members m
  where m.business_id = v_business and m.id <> p_member_id and m.setup_completed_at is not null
  order by m.setup_completed_at, m.id
  limit 1;
  if v_source is null then
    return false;
  end if;

  select member_type into v_type from public.members where id = p_member_id;
  v_copy_discount := v_type = 'mobile';

  perform public._draft_ensure(p_member_id);
  select * into v_draft from public.member_drafts d where d.member_id = p_member_id for update;

  -- Only a location that has none of these yet.
  if nullif(v_draft.data #>> '{basics,tagline}', '') is not null
     or nullif(v_draft.data #>> '{basics,phone}', '') is not null
     or nullif(v_draft.data #>> '{basics,member_since_year}', '') is not null
     or jsonb_array_length(coalesce(nullif(v_draft.data #> '{links,links}', 'null'::jsonb), '[]'::jsonb)) > 0 then
    return false;
  end if;

  -- A published source gives its live values (its draft may hold
  -- unpublished half-edits); one not yet published, its draft.
  select status = 'published' into v_src_live from public.members where id = v_source;
  if not v_src_live then
    select * into v_src_draft from public.member_drafts d where d.member_id = v_source;
  end if;
  v_src_basics := coalesce(v_src_draft.data -> 'basics', public._draft_section_from_live(v_source, 'basics'));
  v_src_links := coalesce(v_src_draft.data -> 'links', public._draft_section_from_live(v_source, 'links'));

  v_basics := coalesce(v_draft.data -> 'basics', '{}'::jsonb)
    || jsonb_build_object(
      'tagline', v_src_basics -> 'tagline',
      'phone', v_src_basics -> 'phone',
      'member_since_year', v_src_basics -> 'member_since_year'
    );
  v_links := jsonb_build_object('links', coalesce(v_src_links -> 'links', '[]'::jsonb));
  perform public._validate_draft_section(p_member_id, 'basics', v_basics);
  perform public._validate_draft_section(p_member_id, 'links', v_links);

  if v_copy_discount then
    v_src_discount := coalesce(v_src_draft.data -> 'discount', public._draft_section_from_live(v_source, 'discount'));
    v_discount := coalesce(v_draft.data -> 'discount', '{}'::jsonb)
      || jsonb_build_object('category_ids', coalesce(v_src_discount -> 'category_ids', '[]'::jsonb));
    perform public._validate_draft_section(p_member_id, 'discount', v_discount);
  end if;

  update public.member_drafts d
  set data = d.data
        || jsonb_build_object('basics', v_basics, 'links', v_links)
        || case when v_copy_discount then jsonb_build_object('discount', v_discount) else '{}'::jsonb end,
      dirty_sections = array(
        select s from unnest(public._draft_all_sections()) s
        where s = any (d.dirty_sections)
          or s in ('basics', 'links')
          or (v_copy_discount and s = 'discount')
      ),
      updated_by_user_id = v_uid
  where d.member_id = p_member_id;

  perform public._draft_audit_if_guild_admin(p_member_id, 'member_drafts');
  return true;
end;
$$;

revoke execute on function public.prefill_location_setup(uuid) from public, anon;
grant execute on function public.prefill_location_setup(uuid) to authenticated;
