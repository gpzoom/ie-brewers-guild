-- The only way to write a draft, and the only member path (after phase 2)
-- that changes the live profile tables (spec, "Drafts", "Publishing by
-- section" and "Enforcement"; plan phase 1, item 7).
--
-- All four are SECURITY DEFINER: member_drafts has no client write policies
-- or privileges at all, so the role checks in here are the whole
-- permission model for drafts -- the UI hiding a section is not. Inside
-- them auth.uid() is still the real signed-in caller (the Guild admin's own
-- id while impersonating), which is what every check and audit row uses.
--
-- Each runs as one statement, so it's atomic: any raise -- a role check, a
-- bad section shape, an unapproved photo, a constraint -- undoes every
-- write it made. A publish either puts all of the named sections live or
-- none of them.
--
-- Section keys and validation: see _validate_draft_section() in
-- 20260925200700_member_draft_internals.sql.

-- Returns the member's draft, creating it from live if it doesn't exist.
-- Anyone linked to the member (any role) or a Guild admin.
create or replace function public.ensure_member_draft(p_member_id uuid)
returns public.member_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._draft_require_uid();
  if not (public.is_member_editor(p_member_id) or public.is_guild_admin()) then
    raise exception 'You don''t have access to this member.' using errcode = '42501';
  end if;
  return public._draft_ensure(p_member_id);
end;
$$;

-- Saves one section of the draft. p_data is merged over the section's
-- current contents (a key sent as null clears it; a key left out keeps its
-- value), then the whole merged section is validated, so a stored section
-- is always well-formed. Clients normally send the whole section.
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

  perform public._draft_audit_if_guild_admin(p_member_id, 'member_drafts');
  return v_row;
end;
$$;

-- Copies the named sections from the draft onto the live profile.
--
-- * Every named section must be one the caller may edit, or nothing is
--   published (a Photos & events editor's call must be exactly ['media']).
-- * Publishing 'basics' for a non-mobile member needs p_confirm_hours: the
--   hours read-back tick (spec, "Hours and the publish gate"). Mobile
--   members have no weekly hours; their past-dates warning is UI only.
-- * A member that isn't live yet (status 'draft') can only be made live by
--   an owner, full editor or Guild admin, and only by publishing every
--   section -- which always includes 'basics', so always the hours check
--   (plan Decision 10). A Photos & events editor's publish never changes
--   status. Members still 'applied', 'declined' or 'suspended' can't be
--   published from a draft at all: those statuses belong to the Guild's
--   roster actions.
-- * Every photo the published sections point at (logo, cover, social
--   image, slides) must be in this member's gallery and approved.
-- * Each section is re-validated first (_validate_draft_section), so link
--   and slide URLs are http(s) only at publish as well as at save.
create or replace function public.publish_member_draft(p_member_id uuid, p_sections text[], p_confirm_hours boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sections text[];
  v_section text;
  v_member public.members;
  v_draft public.member_drafts;
  v_full boolean;
  v_data jsonb := '{}'::jsonb;
  v_basics jsonb;
  v_bad text;
begin
  perform public._draft_require_uid();
  v_sections := public._draft_normalize_sections(p_sections);

  foreach v_section in array v_sections loop
    if not public.can_edit_section(p_member_id, v_section) then
      raise exception 'You can''t publish the % section of this profile.', v_section using errcode = '42501';
    end if;
  end loop;

  select * into v_member from public.members m where m.id = p_member_id for update;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_member.status not in ('draft', 'published') then
    raise exception 'This profile can''t be published while its status is %.', v_member.status using errcode = '42501';
  end if;

  v_full := public.is_member_full_editor(p_member_id);
  if v_member.status <> 'published' then
    if not v_full then
      raise exception 'Only the owner or a full editor can publish this profile for the first time.' using errcode = '42501';
    end if;
    if not (public._draft_all_sections() <@ v_sections) then
      raise exception 'Publishing this profile for the first time has to include every section.' using errcode = '22023';
    end if;
  end if;

  if 'basics' = any (v_sections) and v_member.member_type <> 'mobile' and not coalesce(p_confirm_hours, false) then
    raise exception 'Confirm your hours are right before publishing.' using errcode = '22023';
  end if;

  perform public._draft_ensure(p_member_id);
  select * into v_draft from public.member_drafts d where d.member_id = p_member_id for update;

  -- Re-validate each section as it stands now (rules may have tightened
  -- since it was saved), falling back to live for a section the draft
  -- somehow lacks.
  foreach v_section in array v_sections loop
    v_data := v_data || jsonb_build_object(
      v_section,
      coalesce(v_draft.data -> v_section, public._draft_section_from_live(p_member_id, v_section))
    );
    perform public._validate_draft_section(p_member_id, v_section, v_data -> v_section);
  end loop;

  -- Every referenced photo: this member's, and approved.
  select string_agg(distinct a.asset_id::text, ', ') into v_bad
  from (
    select (v_data #>> array['basics', k])::uuid as asset_id
    from unnest(array['logo_asset_id', 'cover_asset_id', 'og_image_asset_id']) k
    where v_data ? 'basics'
    union all
    select (e ->> 'asset_id')::uuid
    from jsonb_array_elements(coalesce(nullif(v_data #> '{media,slides}', 'null'::jsonb), '[]'::jsonb)) e
    where v_data ? 'media'
  ) a
  where a.asset_id is not null
    and not exists (
      select 1 from public.media_assets ma
      where ma.id = a.asset_id and ma.member_id = p_member_id and ma.review_status = 'approved'
    );
  if v_bad is not null then
    raise exception 'A photo on this profile isn''t approved or isn''t in this member''s gallery (%).', v_bad using errcode = '22023';
  end if;

  -- "Complete enough to go live": the draft may hold half-typed values, the
  -- live profile may not.
  if v_data ? 'basics' then
    v_basics := v_data -> 'basics';
    if coalesce(btrim(v_basics ->> 'business_name'), '') = '' then
      raise exception 'Add your business name before publishing.' using errcode = '22023';
    end if;
    if coalesce(btrim(v_basics ->> 'city'), '') = '' then
      raise exception 'Add your city before publishing.' using errcode = '22023';
    end if;
    if coalesce(btrim(v_basics ->> 'state'), '') = '' then
      raise exception 'Add your state before publishing.' using errcode = '22023';
    end if;
    if coalesce(btrim(v_basics ->> 'timezone'), '') = '' then
      raise exception 'Choose a timezone before publishing.' using errcode = '22023';
    end if;
  end if;
  if v_data ? 'links' and exists (
    select 1 from jsonb_array_elements(coalesce(nullif(v_data #> '{links,links}', 'null'::jsonb), '[]'::jsonb)) e
    where coalesce(btrim(e ->> 'url'), '') = ''
  ) then
    raise exception 'Every link needs a web address before publishing.' using errcode = '22023';
  end if;

  -- Writes. Child tables are replaced wholesale (delete and insert), which
  -- is how "the draft becomes live" reads for lists.
  if v_data ? 'basics' then
    update public.members m
    set business_name = v_basics ->> 'business_name',
        tagline = v_basics ->> 'tagline',
        city = v_basics ->> 'city',
        state = v_basics ->> 'state',
        street_address = v_basics ->> 'street_address',
        service_area = v_basics ->> 'service_area',
        lead_time = v_basics ->> 'lead_time',
        member_since_year = (v_basics ->> 'member_since_year')::numeric::smallint,
        timezone = v_basics ->> 'timezone',
        phone = v_basics ->> 'phone',
        contact_email = v_basics ->> 'contact_email',
        logo_asset_id = (v_basics ->> 'logo_asset_id')::uuid,
        logo_background = coalesce(v_basics ->> 'logo_background', m.logo_background),
        cover_asset_id = (v_basics ->> 'cover_asset_id')::uuid,
        cover_crop = nullif(v_basics -> 'cover_crop', 'null'::jsonb),
        og_image_asset_id = (v_basics ->> 'og_image_asset_id')::uuid
    where m.id = p_member_id;

    delete from public.hours h where h.member_id = p_member_id;
    insert into public.hours (member_id, weekday, opens_at, closes_at, closes_next_day, is_closed)
    select p_member_id,
           (e ->> 'weekday')::numeric::smallint,
           (e ->> 'opens_at')::time,
           (e ->> 'closes_at')::time,
           coalesce((e ->> 'closes_next_day')::boolean, false),
           coalesce((e ->> 'is_closed')::boolean, false)
    from jsonb_array_elements(coalesce(nullif(v_basics -> 'hours', 'null'::jsonb), '[]'::jsonb)) e;

    delete from public.special_hours sh where sh.member_id = p_member_id;
    insert into public.special_hours (member_id, date, is_closed, opens_at, closes_at, closes_next_day, note)
    select p_member_id,
           (e ->> 'date')::date,
           coalesce((e ->> 'is_closed')::boolean, false),
           (e ->> 'opens_at')::time,
           (e ->> 'closes_at')::time,
           coalesce((e ->> 'closes_next_day')::boolean, false),
           e ->> 'note'
    from jsonb_array_elements(coalesce(nullif(v_basics -> 'special_hours', 'null'::jsonb), '[]'::jsonb)) e;
  end if;

  if v_data ? 'media' then
    delete from public.carousel_slides cs where cs.member_id = p_member_id;
    insert into public.carousel_slides (member_id, asset_id, crop, outbound_url, sort_order)
    select p_member_id,
           (e ->> 'asset_id')::uuid,
           e -> 'crop',
           nullif(btrim(e ->> 'outbound_url'), ''),
           (e ->> 'sort_order')::numeric::smallint
    from jsonb_array_elements(coalesce(nullif(v_data #> '{media,slides}', 'null'::jsonb), '[]'::jsonb)) e;
  end if;

  if v_data ? 'links' then
    -- Live sort_order is renumbered 0..n-1: ordered by the draft's
    -- sort_order where given (missing ones last), ties broken by position
    -- in the array. Mixing given and missing values can't collide.
    delete from public.member_links l where l.member_id = p_member_id;
    insert into public.member_links (member_id, kind, label, url, sort_order)
    select p_member_id,
           e ->> 'kind',
           nullif(e ->> 'label', ''),
           btrim(e ->> 'url'),
           (row_number() over (order by (e ->> 'sort_order')::numeric nulls last, ord) - 1)::smallint
    from jsonb_array_elements(coalesce(nullif(v_data #> '{links,links}', 'null'::jsonb), '[]'::jsonb)) with ordinality as x(e, ord);
  end if;

  if v_data ? 'discount' then
    update public.members m
    set discount_percent = (v_data #>> '{discount,discount_percent}')::numeric::smallint,
        discount_no_fixed_percent = coalesce((v_data #>> '{discount,discount_no_fixed_percent}')::boolean, false),
        discount_redeem_text = v_data #>> '{discount,discount_redeem_text}'
    where m.id = p_member_id;

    delete from public.member_categories mc where mc.member_id = p_member_id;
    insert into public.member_categories (member_id, category_id)
    select distinct p_member_id, (e #>> '{}')::uuid
    from jsonb_array_elements(coalesce(nullif(v_data #> '{discount,category_ids}', 'null'::jsonb), '[]'::jsonb)) e;
  end if;

  if v_data ? 'theme' then
    update public.members m
    set theme = v_data #>> '{theme,theme}'
    where m.id = p_member_id;
  end if;

  -- published_at = last publish time: every publish moves it, including a
  -- photos-only one (the controller's decision for this phase). This
  -- update runs as the function owner, so the write-limits trigger's
  -- client-role rule on published_at/status doesn't apply to it.
  update public.members m
  set published_at = now(),
      hours_confirmed_at = case
        when 'basics' = any (v_sections) and coalesce(p_confirm_hours, false) then now()
        else m.hours_confirmed_at
      end,
      status = case when v_full then 'published' else m.status end
  where m.id = p_member_id
  returning * into v_member;

  -- The published sections now match live; store live's canonical form and
  -- clear their unpublished-changes flags. Other sections stay as drafted.
  update public.member_drafts d
  set data = d.data || (
        select jsonb_object_agg(s, public._draft_section_from_live(p_member_id, s))
        from unnest(v_sections) s
      ),
      dirty_sections = array(
        select s from unnest(d.dirty_sections) s where s <> all (v_sections)
      )
  where d.member_id = p_member_id
  returning * into v_draft;

  perform public._draft_audit_if_guild_admin(p_member_id, 'members');

  return jsonb_build_object(
    'published_sections', to_jsonb(v_sections),
    'status', v_member.status,
    'published_at', v_member.published_at,
    'hours_confirmed_at', v_member.hours_confirmed_at,
    'dirty_sections', to_jsonb(v_draft.dirty_sections)
  );
end;
$$;

-- Throws away the named sections' unpublished changes by resetting them
-- from live. Same role rule as publish: a Photos & events editor can
-- discard only 'media'.
create or replace function public.discard_member_draft_sections(p_member_id uuid, p_sections text[])
returns public.member_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public._draft_require_uid();
  v_sections text[];
  v_section text;
  v_row public.member_drafts;
begin
  v_sections := public._draft_normalize_sections(p_sections);
  foreach v_section in array v_sections loop
    if not public.can_edit_section(p_member_id, v_section) then
      raise exception 'You can''t discard changes to the % section of this profile.', v_section using errcode = '42501';
    end if;
  end loop;

  perform public._draft_ensure(p_member_id);
  select * into v_row from public.member_drafts d where d.member_id = p_member_id for update;

  update public.member_drafts d
  set data = d.data || (
        select jsonb_object_agg(s, public._draft_section_from_live(p_member_id, s))
        from unnest(v_sections) s
      ),
      dirty_sections = array(
        select s from unnest(d.dirty_sections) s where s <> all (v_sections)
      ),
      updated_by_user_id = v_uid
  where d.member_id = p_member_id
  returning * into v_row;

  perform public._draft_audit_if_guild_admin(p_member_id, 'member_drafts');
  return v_row;
end;
$$;

revoke execute on function public.ensure_member_draft(uuid) from public, anon;
revoke execute on function public.save_member_draft_section(uuid, text, jsonb) from public, anon;
revoke execute on function public.publish_member_draft(uuid, text[], boolean) from public, anon;
revoke execute on function public.discard_member_draft_sections(uuid, text[]) from public, anon;
grant execute on function public.ensure_member_draft(uuid) to authenticated;
grant execute on function public.save_member_draft_section(uuid, text, jsonb) to authenticated;
grant execute on function public.publish_member_draft(uuid, text[], boolean) to authenticated;
grant execute on function public.discard_member_draft_sections(uuid, text[]) to authenticated;
