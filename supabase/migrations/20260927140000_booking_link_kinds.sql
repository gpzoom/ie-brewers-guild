-- Two booking link types for Mobile members (owner's request, 2026-09-27):
-- an Instagram DM link (entered as @name, stored as https://ig.me/m/name)
-- and WhatsApp (entered as a phone number, stored as https://wa.me/<digits>).
-- Both are stored as ordinary https URLs, so every existing URL check still
-- applies. The link list is the draft's `links` section, so both the live
-- table's check and the draft validator learn the new kinds.

alter table public.member_links drop constraint member_links_kind_check;
alter table public.member_links add constraint member_links_kind_check check (kind in (
  'website', 'instagram', 'facebook', 'tiktok', 'taplist', 'menu', 'press_kit', 'catalog',
  'instagram_dm', 'whatsapp', 'other'
));

-- _validate_draft_section, as in 20260926120000_draft_basics_address_coordinates.sql,
-- with the two new kinds in v_link_kinds (nothing else changed).
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
    'website', 'instagram', 'facebook', 'tiktok', 'taplist', 'menu', 'press_kit', 'catalog',
    'instagram_dm', 'whatsapp', 'other'
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
