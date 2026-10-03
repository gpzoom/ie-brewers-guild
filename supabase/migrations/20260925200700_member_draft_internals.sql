-- Internal building blocks for the draft functions
-- (20260925200800_member_draft_functions.sql and
-- 20260925200900_member_setup_functions.sql): converting live rows to a
-- draft section, validating a section, and a few small checks. Kept apart so
-- each exposed function reads as a short list of steps.
--
-- None of these check who the caller is -- the exposed functions do that
-- first -- so none of them may be callable from the API. Supabase's default
-- privileges grant EXECUTE on every new public function to anon and
-- authenticated, which would put them on PostgREST's /rpc; the revoke at the
-- bottom takes that back. The exposed functions still reach them because
-- they run as the function owner (SECURITY DEFINER).

-- The five draft sections, in the order they're shown and stored.
create or replace function public._draft_all_sections()
returns text[]
language sql
immutable
as $$
  select array['basics', 'media', 'links', 'discount', 'theme'];
$$;

-- Every exposed function starts here: there is no anonymous drafting.
create or replace function public._draft_require_uid()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- A sections argument from a client: non-empty, known names only, returned
-- de-duplicated in canonical order.
create or replace function public._draft_normalize_sections(p_sections text[])
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_bad text;
begin
  if p_sections is null or cardinality(p_sections) = 0 then
    raise exception 'Name at least one section.' using errcode = '22023';
  end if;
  select string_agg(coalesce(s, 'null'), ', ') into v_bad
  from unnest(p_sections) s
  where s is null or s <> all (public._draft_all_sections());
  if v_bad is not null then
    raise exception 'Unknown draft section: %', v_bad using errcode = '22023';
  end if;
  return array(
    select s from unnest(public._draft_all_sections()) s
    where s = any (p_sections)
  );
end;
$$;

-- One section of the draft, read from the live tables. Also used after a
-- publish to rewrite the published sections in the draft in canonical form
-- (e.g. '9:00' comes back as '09:00:00'), so the draft always matches live
-- right after publishing.
create or replace function public._draft_section_from_live(p_member_id uuid, p_section text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case p_section
    when 'basics' then (
      select jsonb_build_object(
        'business_name', m.business_name,
        'tagline', m.tagline,
        'city', m.city,
        'state', m.state,
        'street_address', m.street_address,
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

-- The whole draft, read from live: what a new draft starts as.
create or replace function public._draft_from_live(p_member_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_object_agg(s, public._draft_section_from_live(p_member_id, s))
  from unnest(public._draft_all_sections()) s;
$$;

-- Returns the member's draft, creating it from live first if there isn't
-- one yet (spec: "A draft is created on first edit by copying live").
create or replace function public._draft_ensure(p_member_id uuid)
returns public.member_drafts
language plpgsql
set search_path = public
as $$
declare
  v_row public.member_drafts;
begin
  if not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;

  insert into public.member_drafts (member_id, data)
  values (p_member_id, public._draft_from_live(p_member_id))
  on conflict (member_id) do nothing;

  select * into v_row from public.member_drafts d where d.member_id = p_member_id;
  return v_row;
end;
$$;

-- Rejects any key outside the allowlist. This is what keeps member_type,
-- status, slug, published_at and every other non-draft column out of a
-- draft: they simply aren't on any section's list.
create or replace function public._draft_assert_keys(p_obj jsonb, p_allowed text[], p_what text)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_bad text;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    raise exception '% must be an object.', p_what using errcode = '22023';
  end if;
  select string_agg(k, ', ' order by k) into v_bad
  from jsonb_object_keys(p_obj) k
  where k <> all (p_allowed);
  if v_bad is not null then
    raise exception '% has fields that can''t be saved here: %', p_what, v_bad using errcode = '22023';
  end if;
end;
$$;

-- JSON type check for one value. A missing key (SQL null) and a JSON null
-- both count as "no value".
create or replace function public._draft_assert_type(p_val jsonb, p_type text, p_what text, p_required boolean default false)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    if p_required then
      raise exception '% is required.', p_what using errcode = '22023';
    end if;
    return;
  end if;
  if jsonb_typeof(p_val) <> p_type then
    raise exception '% must be a %.', p_what, p_type using errcode = '22023';
  end if;
end;
$$;

-- A whole number (JSON numbers can arrive as 3.0) within [p_min, p_max].
create or replace function public._draft_assert_int(p_val jsonb, p_min numeric, p_max numeric, p_what text, p_required boolean default false)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n numeric;
begin
  perform public._draft_assert_type(p_val, 'number', p_what, p_required);
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return;
  end if;
  v_n := (p_val #>> '{}')::numeric;
  if v_n <> trunc(v_n) or v_n < p_min or v_n > p_max then
    raise exception '% must be a whole number from % to %.', p_what, p_min, p_max using errcode = '22023';
  end if;
end;
$$;

-- A string that parses as p_cast ('time', 'date' or 'uuid'), or no value.
create or replace function public._draft_assert_castable(p_val jsonb, p_cast text, p_what text, p_required boolean default false)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  perform public._draft_assert_type(p_val, 'string', p_what, p_required);
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return;
  end if;
  begin
    case p_cast
      when 'time' then perform (p_val #>> '{}')::time;
      when 'date' then perform (p_val #>> '{}')::date;
      when 'uuid' then perform (p_val #>> '{}')::uuid;
    end case;
  exception when others then
    raise exception '% is not a valid %.', p_what, p_cast using errcode = '22023';
  end;
end;
$$;

-- A crop rectangle is exactly {x, y, w, h}, fractions of the original
-- (spec, "Data model" -> members). A small tolerance absorbs float rounding
-- from the crop editor.
create or replace function public._draft_assert_crop(p_val jsonb, p_what text, p_required boolean default false)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_x numeric;
  v_y numeric;
  v_w numeric;
  v_h numeric;
  v_eps constant numeric := 0.000001;
begin
  perform public._draft_assert_type(p_val, 'object', p_what, p_required);
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return;
  end if;
  perform public._draft_assert_keys(p_val, array['x', 'y', 'w', 'h'], p_what);
  perform public._draft_assert_type(p_val -> 'x', 'number', p_what || '.x', true);
  perform public._draft_assert_type(p_val -> 'y', 'number', p_what || '.y', true);
  perform public._draft_assert_type(p_val -> 'w', 'number', p_what || '.w', true);
  perform public._draft_assert_type(p_val -> 'h', 'number', p_what || '.h', true);
  v_x := (p_val ->> 'x')::numeric;
  v_y := (p_val ->> 'y')::numeric;
  v_w := (p_val ->> 'w')::numeric;
  v_h := (p_val ->> 'h')::numeric;
  if v_x < -v_eps or v_y < -v_eps or v_w <= 0 or v_h <= 0
     or v_x + v_w > 1 + v_eps or v_y + v_h > 1 + v_eps then
    raise exception '% must fit inside the photo.', p_what using errcode = '22023';
  end if;
end;
$$;

-- A web address a visitor will tap: http(s) only, so a draft can't carry a
-- javascript:/data: URL onto the live page. Empty or missing passes here;
-- publish decides whether empty is acceptable (a link's URL isn't optional,
-- a slide's tap-through is).
create or replace function public._draft_assert_url(p_val jsonb, p_what text, p_required boolean default false)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  perform public._draft_assert_type(p_val, 'string', p_what, p_required);
  if p_val is null or jsonb_typeof(p_val) = 'null' or btrim(p_val #>> '{}') = '' then
    return;
  end if;
  if btrim(p_val #>> '{}') !~* '^https?://' then
    raise exception '% must start with http:// or https://.', p_what using errcode = '22023';
  end if;
end;
$$;

-- An asset reference must point at this member's own gallery -- otherwise a
-- draft could show another member's photo in its preview. Approval is
-- checked again, strictly, at publish (an asset can be rejected after it
-- was put in a draft).
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
    where ma.id = (p_val #>> '{}')::uuid and ma.member_id = p_member_id
  ) then
    raise exception '% isn''t in this member''s gallery.', p_what using errcode = '22023';
  end if;
end;
$$;

-- Validates one whole draft section (after merging a save into it). The
-- checks mirror the live tables' constraints so a saved draft can't become
-- unpublishable because of its shape. What's left for publish time is
-- "complete enough to go live" (non-empty name/city, link URLs) and asset
-- approval.
create or replace function public._validate_draft_section(p_member_id uuid, p_section text, p_data jsonb)
returns void
language plpgsql
stable
set search_path = public
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
        'business_name', 'tagline', 'city', 'state', 'street_address', 'service_area', 'lead_time',
        'member_since_year', 'timezone', 'phone', 'contact_email', 'logo_asset_id', 'logo_background',
        'cover_asset_id', 'cover_crop', 'og_image_asset_id', 'hours', 'special_hours'
      ], 'Basics');

      foreach v_key in array array[
        'business_name', 'tagline', 'city', 'state', 'street_address', 'service_area', 'lead_time',
        'timezone', 'phone', 'contact_email', 'logo_background'
      ] loop
        perform public._draft_assert_type(p_data -> v_key, 'string', v_key);
      end loop;

      if char_length(p_data ->> 'tagline') > 70 then
        raise exception 'Tagline must be 70 characters or fewer.' using errcode = '22023';
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

-- Impersonated edits are logged against the real actor (spec, "Drafts").
-- A member's own edits aren't audited here -- the draft row already records
-- updated_by_user_id / media_updated_by_user_id.
create or replace function public._draft_audit_if_guild_admin(p_member_id uuid, p_table_name text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if public.is_guild_admin() then
    insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
    values (auth.uid(), p_member_id, p_table_name, p_member_id, 'update');
  end if;
end;
$$;

revoke execute on function public._draft_all_sections() from public, anon, authenticated;
revoke execute on function public._draft_require_uid() from public, anon, authenticated;
revoke execute on function public._draft_normalize_sections(text[]) from public, anon, authenticated;
revoke execute on function public._draft_section_from_live(uuid, text) from public, anon, authenticated;
revoke execute on function public._draft_from_live(uuid) from public, anon, authenticated;
revoke execute on function public._draft_ensure(uuid) from public, anon, authenticated;
revoke execute on function public._draft_assert_keys(jsonb, text[], text) from public, anon, authenticated;
revoke execute on function public._draft_assert_type(jsonb, text, text, boolean) from public, anon, authenticated;
revoke execute on function public._draft_assert_int(jsonb, numeric, numeric, text, boolean) from public, anon, authenticated;
revoke execute on function public._draft_assert_castable(jsonb, text, text, boolean) from public, anon, authenticated;
revoke execute on function public._draft_assert_crop(jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public._draft_assert_url(jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public._draft_assert_own_asset(uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public._validate_draft_section(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public._draft_audit_if_guild_admin(uuid, text) from public, anon, authenticated;
