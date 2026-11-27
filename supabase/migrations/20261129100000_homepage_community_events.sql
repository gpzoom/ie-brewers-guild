-- Community Events carousel (docs/superpowers/specs/2026-11-27-community-events-carousel-design.md).
--
-- The image announcements become community events, shown together in one
-- homepage block. That block's place in the list is a new 'community' row
-- (one only, never deleted, like Events and Spotlight). The image rows keep
-- their own positions, which now only set the order of the events.
--
-- The live code from before this change skips the unknown 'community' kind on
-- the homepage, so the live homepage looks the same until the new code ships.

alter table public.homepage_sections drop constraint homepage_sections_kind_check;
alter table public.homepage_sections
  add constraint homepage_sections_kind_check check (kind in ('events', 'spotlight', 'image', 'community'));

drop index public.homepage_sections_one_per_kind;
create unique index homepage_sections_one_per_kind
  on public.homepage_sections (kind)
  where kind in ('events', 'spotlight', 'community');

-- Make room (positions are unique; the check is deferred to the end of the
-- statement), then put the block just above the first image row, or last.
update public.homepage_sections set position = position * 2;

insert into public.homepage_sections (kind, position, enabled)
select
  'community',
  coalesce(
    (select min(position) - 1 from public.homepage_sections where kind = 'image'),
    (select coalesce(max(position), 0) + 1 from public.homepage_sections)
  ),
  true
where not exists (select 1 from public.homepage_sections where kind = 'community');

-- Like move_homepage_section, but swaps only with the nearest neighbor in the
-- same group: an event among the events, a block among the blocks.
-- Runs as the caller, so RLS still limits it to the super admin.
create or replace function public.move_homepage_section_in_group(p_id uuid, p_direction int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pos int;
  v_is_event boolean;
  v_other_id uuid;
  v_other_pos int;
begin
  if p_direction not in (-1, 1) then
    raise exception 'p_direction must be -1 or 1';
  end if;

  select position, kind = 'image' into v_pos, v_is_event from homepage_sections where id = p_id;
  if v_pos is null then
    return;
  end if;

  if p_direction = -1 then
    select id, position into v_other_id, v_other_pos from homepage_sections
      where position < v_pos and (kind = 'image') = v_is_event
      order by position desc limit 1;
  else
    select id, position into v_other_id, v_other_pos from homepage_sections
      where position > v_pos and (kind = 'image') = v_is_event
      order by position asc limit 1;
  end if;
  if v_other_id is null then
    return;
  end if;

  update homepage_sections
    set position = case when id = p_id then v_other_pos else v_pos end
    where id in (p_id, v_other_id);
end;
$$;
