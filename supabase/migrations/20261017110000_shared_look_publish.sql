-- Multi-location businesses, part 4 (spec 2026-10-15): publishing, the
-- member type, the mode switch and Part of carry the shared look.
--
-- * publish_member_draft accepts a look photo (logo, cover, link preview)
--   owned by any location of a one-manager business, and publishing basics
--   or theme copies the look columns onto the business's other live
--   locations (their own unpublished edits stay in their drafts).
-- * confirm_member_type confirms the type on the business's locations that
--   haven't confirmed one yet.
-- * set_business_mode gains p_look_source and copies one location's look to
--   the others when switching to One manager; it and link_business_manager
--   are now open to every Guild admin, not only the super admin.
-- * set_member_business: a location joining a one-manager business takes
--   its look and its confirmed type.
-- Members outside a one-manager business behave exactly as before.

-- Copies the five live look columns and the theme from one member to
-- another, and the same keys into the target's draft, without marking the
-- draft unpublished (the live profile already shows them).
create or replace function public._copy_shared_look(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.members;
begin
  select * into v_src from public.members where id = p_from;
  update public.members
  set logo_asset_id = v_src.logo_asset_id,
      logo_background = v_src.logo_background,
      cover_asset_id = v_src.cover_asset_id,
      cover_crop = v_src.cover_crop,
      og_image_asset_id = v_src.og_image_asset_id,
      theme = v_src.theme
  where id = p_to;

  perform public._draft_ensure(p_to);
  update public.member_drafts d
  set data = d.data
    || jsonb_build_object('basics', coalesce(d.data -> 'basics', '{}'::jsonb) || jsonb_build_object(
         'logo_asset_id', v_src.logo_asset_id,
         'logo_background', v_src.logo_background,
         'cover_asset_id', v_src.cover_asset_id,
         'cover_crop', v_src.cover_crop,
         'og_image_asset_id', v_src.og_image_asset_id))
    || jsonb_build_object('theme', coalesce(d.data -> 'theme', '{}'::jsonb) || jsonb_build_object('theme', v_src.theme))
  where d.member_id = p_to;
end;
$$;
revoke all on function public._copy_shared_look(uuid, uuid) from public, anon, authenticated;

-- publish_member_draft: from 20261001100000_publish_names_empty_links.sql,
-- plus the shared-look photo rule and the copy to live siblings.
create or replace function public.publish_member_draft(p_member_id uuid, p_sections text[], p_confirm_hours boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing_links text;
  v_sections text[];
  v_section text;
  v_member public.members;
  v_draft public.member_drafts;
  v_full boolean;
  v_data jsonb := '{}'::jsonb;
  v_basics jsonb;
  v_bad text;
  v_business uuid;
  v_sibling uuid;
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

  -- Every referenced photo: this member's, and approved. In a one-manager
  -- business a look photo (logo, cover, link preview) owned by any
  -- location of the business counts (the shared logo lives in one
  -- gallery); carousel slides stay this member's own.
  v_business := public._one_manager_business_id(p_member_id);
  select string_agg(distinct a.asset_id::text, ', ') into v_bad
  from (
    select (v_data #>> array['basics', k])::uuid as asset_id, true as is_look
    from unnest(array['logo_asset_id', 'cover_asset_id', 'og_image_asset_id']) k
    where v_data ? 'basics'
    union all
    select (e ->> 'asset_id')::uuid, false
    from jsonb_array_elements(coalesce(nullif(v_data #> '{media,slides}', 'null'::jsonb), '[]'::jsonb)) e
    where v_data ? 'media'
  ) a
  where a.asset_id is not null
    and not exists (
      select 1 from public.media_assets ma
      where ma.id = a.asset_id and ma.review_status = 'approved'
        and (
          ma.member_id = p_member_id
          or (
            a.is_look and v_business is not null
            and ma.member_id in (select m.id from public.members m where m.business_id = v_business)
          )
        )
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
  -- Name the links that are missing an address, and where to fix them
  -- (owner, 1 October 2026: "Every link needs a web address" didn't say which).
  if v_data ? 'links' then
    select string_agg(
             case e ->> 'kind'
               when 'website' then 'Website'
               when 'instagram' then 'Instagram'
               when 'facebook' then 'Facebook'
               when 'tiktok' then 'TikTok'
               when 'taplist' then 'Tap list'
               when 'menu' then 'Menu'
               when 'press_kit' then 'Press kit'
               when 'catalog' then 'Catalog'
               when 'instagram_dm' then 'Instagram DM'
               when 'whatsapp' then 'WhatsApp'
               else coalesce(nullif(btrim(e ->> 'label'), ''), 'Something else')
             end, ', ' order by ord)
      into v_missing_links
      from jsonb_array_elements(coalesce(nullif(v_data #> '{links,links}', 'null'::jsonb), '[]'::jsonb))
           with ordinality as x (e, ord)
     where coalesce(btrim(e ->> 'url'), '') = '';
    if v_missing_links is not null then
      raise exception 'These links have no web address: %. Open Links & contact and add each address, or remove those links, then publish again.', v_missing_links
        using errcode = '22023';
    end if;
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
        -- A draft saved before these keys existed keeps live's values.
        postal_code = case when v_basics ? 'postal_code' then v_basics ->> 'postal_code' else m.postal_code end,
        latitude = case when v_basics ? 'latitude' or v_basics ? 'longitude'
                        then (v_basics ->> 'latitude')::numeric else m.latitude end,
        longitude = case when v_basics ? 'latitude' or v_basics ? 'longitude'
                         then (v_basics ->> 'longitude')::numeric else m.longitude end,
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

  -- Shared look: the business's other live locations show the same look.
  -- Only the look columns are copied; each location's own unpublished
  -- edits stay in its draft.
  if v_business is not null and (v_sections && array['basics', 'theme']) then
    for v_sibling in
      select id from public.members
      where business_id = v_business
        and id <> p_member_id
        and status = 'published'
    loop
      if 'basics' = any (v_sections) then
        update public.members s
        set logo_asset_id = m.logo_asset_id, logo_background = m.logo_background,
            cover_asset_id = m.cover_asset_id, cover_crop = m.cover_crop,
            og_image_asset_id = m.og_image_asset_id
        from public.members m
        where m.id = p_member_id and s.id = v_sibling;
      end if;
      if 'theme' = any (v_sections) then
        update public.members s set theme = m.theme from public.members m
        where m.id = p_member_id and s.id = v_sibling;
      end if;
      -- Their drafts already hold this look (shared saves); a section that
      -- now matches live is no longer unpublished.
      update public.member_drafts d
      set dirty_sections = array(
        select s from unnest(d.dirty_sections) s
        where not (
          s = any (v_sections) and s in ('basics', 'theme')
          and (d.data -> s) = public._draft_section_from_live(v_sibling, s)
        )
      )
      where d.member_id = v_sibling;
      perform public._draft_audit_if_guild_admin(v_sibling, 'members');
    end loop;
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

revoke execute on function public.publish_member_draft(uuid, text[], boolean) from public, anon;
grant execute on function public.publish_member_draft(uuid, text[], boolean) to authenticated;

-- confirm_member_type: from 20260925200900_member_setup_functions.sql, plus
-- the business's unconfirmed locations.
create or replace function public.confirm_member_type(p_member_id uuid, p_new_type text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public._draft_require_uid();
  v_member public.members;
  v_sibling uuid;
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
  -- One-manager business: the type is the business's, so its locations
  -- that haven't confirmed one yet take it too.
  if public._one_manager_business_id(p_member_id) is not null then
    for v_sibling in
      update public.members
      set member_type = p_new_type, type_confirmed_at = now(), type_confirmed_by_user_id = v_uid
      where business_id = public._one_manager_business_id(p_member_id)
        and id <> p_member_id
        and type_confirmed_at is null
      returning id
    loop
      insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
      values (v_uid, v_sibling, 'members', v_sibling, 'update');
    end loop;
  end if;
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

revoke execute on function public.confirm_member_type(uuid, text) from public, anon;
grant execute on function public.confirm_member_type(uuid, text) to authenticated;

-- set_business_mode, link_business_manager, set_member_business: from
-- 20261016100000_business_functions.sql. set_business_mode gains a
-- parameter, so the two-argument version goes first.
drop function public.set_business_mode(uuid, text);

create or replace function public.set_business_mode(p_business_id uuid, p_mode text, p_look_source uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_source uuid;
  v_member uuid;
begin
  perform public._require_guild_admin();
  if p_mode not in ('separate', 'one_manager') then
    raise exception 'Unknown management mode: %', p_mode;
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode = p_mode then
    return;
  end if;

  if p_mode = 'one_manager' and exists (
    select 1 from public.member_users mu
    join public.members m on m.id = mu.member_id
    where m.business_id = p_business_id
  ) then
    raise exception 'Some of these locations already have people signed up. Switching them to one manager comes in a later update.';
  end if;
  if p_mode = 'separate' and v_business.manager_user_id is not null then
    raise exception 'This business already has a manager. Switching it back comes in a later update.';
  end if;

  update public.businesses set management_mode = p_mode where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  -- One manager: every location takes one location's look -- the one the
  -- Guild chose, else the first set up, else the oldest.
  if p_mode = 'one_manager' then
    v_source := coalesce(
      (select id from public.members where id = p_look_source and business_id = p_business_id),
      (select id from public.members where business_id = p_business_id and setup_completed_at is not null order by setup_completed_at limit 1),
      (select id from public.members where business_id = p_business_id order by created_at limit 1)
    );
    if v_source is not null then
      for v_member in select id from public.members where business_id = p_business_id and id <> v_source loop
        perform public._copy_shared_look(v_source, v_member);
        perform public._business_audit(v_member, 'members', v_member, 'update');
      end loop;
    end if;
  end if;
end;
$$;

create or replace function public.link_business_manager(p_business_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_member_id uuid;
begin
  perform public._require_guild_admin();
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode <> 'one_manager' then
    raise exception 'Set this business to One manager first';
  end if;
  if v_business.manager_user_id is not null then
    raise exception 'This business already has a manager';
  end if;

  update public.businesses set manager_user_id = p_user_id where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  for v_member_id in select id from public.members where business_id = p_business_id loop
    perform public._link_manager_to_location(v_member_id, p_user_id);
  end loop;
end;
$$;

create or replace function public.set_member_business(p_member_id uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_current public.businesses;
  v_target_business uuid;
  v_target_member public.members;
  v_target public.businesses;
  v_remaining int;
  v_left uuid;
  v_source uuid;
begin
  perform public._require_guild_admin();
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception 'That member no longer exists';
  end if;

  -- Resolve the target to a business id (or null).
  if p_target is null then
    v_target_business := null;
  elsif exists (select 1 from public.businesses where id = p_target) then
    -- Lock it so a concurrent link_business_manager can't miss this location.
    select * into v_target from public.businesses where id = p_target for update;
    v_target_business := p_target;
  else
    select * into v_target_member from public.members where id = p_target for update;
    if not found then
      raise exception 'Choose a business or a member';
    end if;
    if v_target_member.id = p_member_id then
      raise exception 'A location can''t be grouped with itself';
    end if;
    v_target_business := v_target_member.business_id;
    if v_target_business is null then
      insert into public.businesses (name) values (btrim(v_target_member.business_name))
      returning id into v_target_business;
      update public.members set business_id = v_target_business where id = v_target_member.id;
      perform public._business_audit(v_target_member.id, 'members', v_target_member.id, 'update');
    end if;
  end if;

  if v_target_business is not distinct from v_member.business_id then
    return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
  end if;

  -- Leaving the current business.
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' then
      raise exception 'Switch the business to each location separately first';
    end if;
  end if;

  update public.members set business_id = v_target_business where id = p_member_id;
  perform public._business_audit(p_member_id, 'members', p_member_id, 'update');

  -- A business left with one location (or none) is dissolved.
  if v_member.business_id is not null then
    select count(*) into v_remaining from public.members where business_id = v_member.business_id;
    if v_remaining <= 1 then
      for v_left in select id from public.members where business_id = v_member.business_id loop
        update public.members set business_id = null where id = v_left;
        perform public._business_audit(v_left, 'members', v_left, 'update');
      end loop;
      delete from public.businesses where id = v_member.business_id;
      perform public._business_audit(null, 'businesses', v_member.business_id, 'delete');
    end if;
  end if;

  -- Joining a one-manager business: take its look and its confirmed type,
  -- then, when it has a manager, link them.
  if v_target_business is not null then
    select * into v_target from public.businesses where id = v_target_business for update;
    if v_target.management_mode = 'one_manager' then
      v_source := (
        select id from public.members
        where business_id = v_target_business and id <> p_member_id
        order by (status = 'published') desc, setup_completed_at nulls last, created_at
        limit 1
      );
      if v_source is not null then
        perform public._copy_shared_look(v_source, p_member_id);
        perform set_config('app.member_fn', 'on', true);
        update public.members m
        set member_type = s.member_type, type_confirmed_at = now(), type_confirmed_by_user_id = auth.uid()
        from public.members s
        where m.id = p_member_id and s.id = v_source
          and s.type_confirmed_at is not null and m.type_confirmed_at is null;
        perform set_config('app.member_fn', '', true);
      end if;
    end if;
    if v_target.management_mode = 'one_manager' and v_target.manager_user_id is not null then
      perform public._link_manager_to_location(p_member_id, v_target.manager_user_id);
      return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', v_target.manager_user_id);
    end if;
  end if;

  return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
end;
$$;

revoke all on function public.set_business_mode(uuid, text, uuid) from public, anon;
revoke all on function public.link_business_manager(uuid, uuid) from public, anon;
revoke all on function public.set_member_business(uuid, uuid) from public, anon;
grant execute on function public.set_business_mode(uuid, text, uuid) to authenticated;
grant execute on function public.link_business_manager(uuid, uuid) to authenticated;
grant execute on function public.set_member_business(uuid, uuid) to authenticated;
