-- Address suggestions (owner decision 2026-09-26): the member's ZIP and the
-- map coordinates of a picked address become part of the draft's basics
-- section, so they're previewed and go live with the rest of Basics.
--
-- Re-creates, from their current bodies in
-- 20260925200700_member_draft_internals.sql and
-- 20260925200800_member_draft_functions.sql, with only these changes:
-- * _draft_section_from_live: basics also reads postal_code, latitude and
--   longitude from live (_draft_from_live re-created unchanged beside it).
-- * _validate_draft_section: basics accepts postal_code (text, at most 20
--   characters -- the app checks the ZIP format), latitude (-90..90) and
--   longitude (-180..180), numbers, both or neither.
-- * publish_member_draft: writes them to members. A draft that doesn't have
--   the keys at all keeps live's values.
-- * search_path is now `public, pg_temp` on all four.
-- Everything else is identical.
--
-- Clearing the coordinates when the member edits the address by hand is the
-- editor's job (src/lib/geo/places-address.ts); publishing null coordinates
-- then makes the post-publish geocode (src/lib/geo/geocode.server.ts) look
-- the address up again.

create or replace function public._draft_section_from_live(p_member_id uuid, p_section text)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_section
    when 'basics' then (
      select jsonb_build_object(
        'business_name', m.business_name,
        'tagline', m.tagline,
        'city', m.city,
        'state', m.state,
        'street_address', m.street_address,
        'postal_code', m.postal_code,
        'latitude', m.latitude,
        'longitude', m.longitude,
        'service_area', m.service_area,
        'lead_time', m.lead_time,
        'member_since_year', m.member_since_year,
        'timezone', m.timezone,
        'phone', m.phone,
        'contact_email', m.contact_email,
        'logo_asset_id', m.logo_asset_id,
        'logo_background', m.logo_background,
        'cover_asset_id', m.cover_asset_id,
        'cover_crop', m.cover_crop,
        'og_image_asset_id', m.og_image_asset_id,
        'hours', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'weekday', h.weekday,
              'opens_at', h.opens_at,
              'closes_at', h.closes_at,
              'closes_next_day', h.closes_next_day,
              'is_closed', h.is_closed
            )
            order by h.weekday, h.opens_at nulls first, h.created_at, h.id
          )
          from public.hours h
          where h.member_id = m.id
        ), '[]'::jsonb),
        'special_hours', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'date', sh.date,
              'is_closed', sh.is_closed,
              'opens_at', sh.opens_at,
              'closes_at', sh.closes_at,
              'closes_next_day', sh.closes_next_day,
              'note', sh.note
            )
            order by sh.date
          )
          from public.special_hours sh
          where sh.member_id = m.id
        ), '[]'::jsonb)
      )
      from public.members m
      where m.id = p_member_id
    )
    when 'media' then jsonb_build_object('slides', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'asset_id', cs.asset_id,
          'crop', cs.crop,
          'outbound_url', cs.outbound_url,
          'sort_order', cs.sort_order
        )
        order by cs.sort_order
      )
      from public.carousel_slides cs
      where cs.member_id = p_member_id
    ), '[]'::jsonb))
    when 'links' then jsonb_build_object('links', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'kind', l.kind,
          'label', l.label,
          'url', l.url,
          'sort_order', l.sort_order
        )
        order by l.sort_order, l.created_at, l.id
      )
      from public.member_links l
      where l.member_id = p_member_id
    ), '[]'::jsonb))
    when 'discount' then (
      select jsonb_build_object(
        'discount_percent', m.discount_percent,
        'discount_no_fixed_percent', m.discount_no_fixed_percent,
        'discount_redeem_text', m.discount_redeem_text,
        'category_ids', coalesce((
          select jsonb_agg(mc.category_id order by c.sort_order, c.name)
          from public.member_categories mc
          join public.categories c on c.id = mc.category_id
          where mc.member_id = m.id
        ), '[]'::jsonb)
      )
      from public.members m
      where m.id = p_member_id
    )
    when 'theme' then (
      select jsonb_build_object('theme', m.theme)
      from public.members m
      where m.id = p_member_id
    )
  end;
$$;

create or replace function public._draft_from_live(p_member_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_object_agg(s, public._draft_section_from_live(p_member_id, s))
  from unnest(public._draft_all_sections()) s;
$$;

create or replace function public._validate_draft_section(p_member_id uuid, p_section text, p_data jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_elem jsonb;
  v_where text;
  v_i int;
  v_seen text[];
  v_themes constant text[] := array['amber', 'rust', 'garnet', 'plum', 'indigo', 'teal', 'forest', 'olive'];
  v_link_kinds constant text[] := array[
    'website', 'instagram', 'facebook', 'tiktok', 'taplist', 'menu', 'press_kit', 'catalog', 'other'
  ];
begin
  case p_section
    when 'basics' then
      perform public._draft_assert_keys(p_data, array[
        'business_name', 'tagline', 'city', 'state', 'street_address', 'postal_code', 'latitude', 'longitude',
        'service_area', 'lead_time', 'member_since_year', 'timezone', 'phone', 'contact_email', 'logo_asset_id', 'logo_background',
        'cover_asset_id', 'cover_crop', 'og_image_asset_id', 'hours', 'special_hours'
      ], 'Basics');

      foreach v_key in array array[
        'business_name', 'tagline', 'city', 'state', 'street_address', 'postal_code', 'service_area', 'lead_time',
        'timezone', 'phone', 'contact_email', 'logo_background'
      ] loop
        perform public._draft_assert_type(p_data -> v_key, 'string', v_key);
      end loop;

      if char_length(p_data ->> 'tagline') > 70 then
        raise exception 'Tagline must be 70 characters or fewer.' using errcode = '22023';
      end if;
      -- ZIP: the app checks the 5-digit / ZIP+4 format; here only a sane
      -- length, so a draft read from an older live value never becomes
      -- unsaveable.
      if char_length(p_data ->> 'postal_code') > 20 then
        raise exception 'ZIP code must be 20 characters or fewer.' using errcode = '22023';
      end if;
      -- Map coordinates (from an address suggestion the member picked):
      -- numbers in range, and both or neither -- a pin needs both.
      perform public._draft_assert_type(p_data -> 'latitude', 'number', 'latitude');
      perform public._draft_assert_type(p_data -> 'longitude', 'number', 'longitude');
      if (nullif(p_data -> 'latitude', 'null'::jsonb) is null) <> (nullif(p_data -> 'longitude', 'null'::jsonb) is null) then
        raise exception 'latitude and longitude must be saved together.' using errcode = '22023';
      end if;
      if (p_data ->> 'latitude')::numeric not between -90 and 90 then
        raise exception 'latitude must be from -90 to 90.' using errcode = '22023';
      end if;
      if (p_data ->> 'longitude')::numeric not between -180 and 180 then
        raise exception 'longitude must be from -180 to 180.' using errcode = '22023';
      end if;
      if p_data ? 'logo_background'
         and (p_data ->> 'logo_background') is distinct from 'light'
         and (p_data ->> 'logo_background') is distinct from 'dark'
         and (p_data ->> 'logo_background') is distinct from 'theme' then
        raise exception 'logo_background must be light, dark or theme.' using errcode = '22023';
      end if;
      -- Same range the /admin Basics editor enforces (member-basics.server.ts).
      perform public._draft_assert_int(
        p_data -> 'member_since_year', 1800, extract(year from now())::numeric + 1, 'member_since_year'
      );

      perform public._draft_assert_own_asset(p_member_id, p_data -> 'logo_asset_id', 'logo_asset_id');
      perform public._draft_assert_own_asset(p_member_id, p_data -> 'cover_asset_id', 'cover_asset_id');
      perform public._draft_assert_own_asset(p_member_id, p_data -> 'og_image_asset_id', 'og_image_asset_id');
      perform public._draft_assert_crop(p_data -> 'cover_crop', 'cover_crop');

      perform public._draft_assert_type(p_data -> 'hours', 'array', 'hours');
      v_i := 0;
      for v_elem in select e from jsonb_array_elements(coalesce(nullif(p_data -> 'hours', 'null'::jsonb), '[]'::jsonb)) e loop
        v_where := format('hours[%s]', v_i);
        perform public._draft_assert_keys(v_elem, array['weekday', 'opens_at', 'closes_at', 'closes_next_day', 'is_closed'], v_where);
        -- 0 = Sunday, same as hours.weekday's check.
        perform public._draft_assert_int(v_elem -> 'weekday', 0, 6, v_where || '.weekday', true);
        perform public._draft_assert_castable(v_elem -> 'opens_at', 'time', v_where || '.opens_at');
        perform public._draft_assert_castable(v_elem -> 'closes_at', 'time', v_where || '.closes_at');
        perform public._draft_assert_type(v_elem -> 'closes_next_day', 'boolean', v_where || '.closes_next_day');
        perform public._draft_assert_type(v_elem -> 'is_closed', 'boolean', v_where || '.is_closed');
        v_i := v_i + 1;
      end loop;

      perform public._draft_assert_type(p_data -> 'special_hours', 'array', 'special_hours');
      v_i := 0;
      v_seen := '{}';
      for v_elem in select e from jsonb_array_elements(coalesce(nullif(p_data -> 'special_hours', 'null'::jsonb), '[]'::jsonb)) e loop
        v_where := format('special_hours[%s]', v_i);
        perform public._draft_assert_keys(v_elem, array['date', 'is_closed', 'opens_at', 'closes_at', 'closes_next_day', 'note'], v_where);
        perform public._draft_assert_castable(v_elem -> 'date', 'date', v_where || '.date', true);
        perform public._draft_assert_type(v_elem -> 'is_closed', 'boolean', v_where || '.is_closed');
        perform public._draft_assert_castable(v_elem -> 'opens_at', 'time', v_where || '.opens_at');
        perform public._draft_assert_castable(v_elem -> 'closes_at', 'time', v_where || '.closes_at');
        perform public._draft_assert_type(v_elem -> 'closes_next_day', 'boolean', v_where || '.closes_next_day');
        perform public._draft_assert_type(v_elem -> 'note', 'string', v_where || '.note');
        -- Mirrors special_hours_member_id_date_key, UNIQUE (member_id, date),
        -- added in 20260922153458_final_review_fixes.sql section 9: one
        -- override per date. Caught here so the draft can't hold a
        -- duplicate that would only fail at publish.
        if ((v_elem ->> 'date')::date)::text = any (v_seen) then
          raise exception 'Special hours has % more than once.', (v_elem ->> 'date')::date using errcode = '22023';
        end if;
        v_seen := v_seen || ((v_elem ->> 'date')::date)::text;
        v_i := v_i + 1;
      end loop;

    when 'media' then
      perform public._draft_assert_keys(p_data, array['slides'], 'Photos');
      perform public._draft_assert_type(p_data -> 'slides', 'array', 'slides');
      if jsonb_array_length(coalesce(nullif(p_data -> 'slides', 'null'::jsonb), '[]'::jsonb)) > 4 then
        raise exception 'The carousel holds at most four slides.' using errcode = '22023';
      end if;
      v_i := 0;
      v_seen := '{}';
      for v_elem in select e from jsonb_array_elements(coalesce(nullif(p_data -> 'slides', 'null'::jsonb), '[]'::jsonb)) e loop
        v_where := format('slides[%s]', v_i);
        perform public._draft_assert_keys(v_elem, array['asset_id', 'crop', 'outbound_url', 'sort_order'], v_where);
        perform public._draft_assert_own_asset(p_member_id, v_elem -> 'asset_id', v_where || '.asset_id', true);
        perform public._draft_assert_crop(v_elem -> 'crop', v_where || '.crop', true);
        perform public._draft_assert_url(v_elem -> 'outbound_url', v_where || '.outbound_url');
        -- carousel_slides: sort_order 0-3, unique per member.
        perform public._draft_assert_int(v_elem -> 'sort_order', 0, 3, v_where || '.sort_order', true);
        if (v_elem ->> 'sort_order')::numeric::int::text = any (v_seen) then
          raise exception 'Two slides share position %.', (v_elem ->> 'sort_order')::numeric::int using errcode = '22023';
        end if;
        v_seen := v_seen || (v_elem ->> 'sort_order')::numeric::int::text;
        v_i := v_i + 1;
      end loop;

    when 'links' then
      perform public._draft_assert_keys(p_data, array['links'], 'Links');
      perform public._draft_assert_type(p_data -> 'links', 'array', 'links');
      v_i := 0;
      for v_elem in select e from jsonb_array_elements(coalesce(nullif(p_data -> 'links', 'null'::jsonb), '[]'::jsonb)) e loop
        v_where := format('links[%s]', v_i);
        perform public._draft_assert_keys(v_elem, array['kind', 'label', 'url', 'sort_order'], v_where);
        perform public._draft_assert_type(v_elem -> 'kind', 'string', v_where || '.kind', true);
        if (v_elem ->> 'kind') <> all (v_link_kinds) then
          raise exception '%.kind "%" isn''t a link type.', v_where, v_elem ->> 'kind' using errcode = '22023';
        end if;
        perform public._draft_assert_type(v_elem -> 'label', 'string', v_where || '.label');
        -- An empty URL may sit in the draft while it's being typed; publish
        -- refuses it.
        perform public._draft_assert_url(v_elem -> 'url', v_where || '.url', true);
        -- Only orders the links; publish renumbers them 0..n-1 from it (see
        -- publish_member_draft), so gaps and ties are harmless.
        perform public._draft_assert_int(v_elem -> 'sort_order', -32768, 32767, v_where || '.sort_order');
        v_i := v_i + 1;
      end loop;

    when 'discount' then
      perform public._draft_assert_keys(p_data, array[
        'discount_percent', 'discount_no_fixed_percent', 'discount_redeem_text', 'category_ids'
      ], 'Discount');
      perform public._draft_assert_int(p_data -> 'discount_percent', 0, 100, 'discount_percent');
      perform public._draft_assert_type(p_data -> 'discount_no_fixed_percent', 'boolean', 'discount_no_fixed_percent');
      perform public._draft_assert_type(p_data -> 'discount_redeem_text', 'string', 'discount_redeem_text');
      perform public._draft_assert_type(p_data -> 'category_ids', 'array', 'category_ids');
      v_i := 0;
      for v_elem in select e from jsonb_array_elements(coalesce(nullif(p_data -> 'category_ids', 'null'::jsonb), '[]'::jsonb)) e loop
        perform public._draft_assert_castable(v_elem, 'uuid', format('category_ids[%s]', v_i), true);
        if not exists (select 1 from public.categories c where c.id = (v_elem #>> '{}')::uuid) then
          raise exception 'category_ids[%] isn''t a supply category.', v_i using errcode = '22023';
        end if;
        v_i := v_i + 1;
      end loop;

    when 'theme' then
      perform public._draft_assert_keys(p_data, array['theme'], 'Theme');
      perform public._draft_assert_type(p_data -> 'theme', 'string', 'theme', true);
      if (p_data ->> 'theme') <> all (v_themes) then
        raise exception 'theme "%" isn''t one of the eight themes.', p_data ->> 'theme' using errcode = '22023';
      end if;

    else
      raise exception 'Unknown draft section: %', p_section using errcode = '22023';
  end case;
end;
$$;

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

-- Existing drafts get the new keys from live, so the ZIP field and the
-- preview show what's live. The coordinates are copied only while the
-- draft's street/city/state still match live -- otherwise they belong to
-- the old address, and null lets the post-publish geocode place the new one.
update public.member_drafts d
set data = jsonb_set(
  d.data,
  '{basics}',
  (d.data -> 'basics') || jsonb_build_object(
    'postal_code', m.postal_code,
    'latitude', case when same_address then m.latitude end,
    'longitude', case when same_address then m.longitude end
  )
)
from (
  select m0.*,
         coalesce(d0.data #>> '{basics,street_address}', '') = coalesce(m0.street_address, '')
           and coalesce(d0.data #>> '{basics,city}', '') = coalesce(m0.city, '')
           and coalesce(d0.data #>> '{basics,state}', '') = coalesce(m0.state, '') as same_address
  from public.member_drafts d0
  join public.members m0 on m0.id = d0.member_id
) m
where m.id = d.member_id
  and jsonb_typeof(d.data -> 'basics') = 'object'
  and not ((d.data -> 'basics') ?| array['postal_code', 'latitude', 'longitude']);

revoke execute on function public._draft_section_from_live(uuid, text) from public, anon, authenticated;
revoke execute on function public._draft_from_live(uuid) from public, anon, authenticated;
revoke execute on function public._validate_draft_section(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.publish_member_draft(uuid, text[], boolean) from public, anon;
grant execute on function public.publish_member_draft(uuid, text[], boolean) to authenticated;
