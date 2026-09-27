-- Food calendar (docs/member-profiles.md, "Events" > "Food calendar"): a
-- producer can connect a second calendar, with its own link and tag, for
-- the food vendors at their taproom. Its entries are ordinary synced rows
-- in events with kind 'food', so the sync, the removal of deleted entries,
-- the public read policy and is_hidden all apply unchanged.

-- Which calendar a connection is: the member's events, or their food vendors.
alter table public.calendar_connections
  add column purpose text not null default 'events'
    check (purpose in ('events', 'food'));

-- One connection of each kind per member and provider (the app looks each
-- one up with maybeSingle()).
create unique index calendar_connections_member_provider_purpose_idx
  on public.calendar_connections (member_id, provider, purpose);

-- What an events row is: an event, or a food vendor's day.
alter table public.events
  add column kind text not null default 'event'
    check (kind in ('event', 'food'));

create index events_member_kind_starts_idx
  on public.events (member_id, kind, starts_at);

-- Whether a producer's profile shows "Food this week". Visitors can't read
-- calendar_connections (it holds the member's private calendar link), so
-- this answers only yes or no: a producer with a food calendar connected,
-- for a published member -- or for someone who can already see the
-- unpublished profile (its editors, a Guild admin), for the preview.
create function public.member_has_food_calendar(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.calendar_connections c
    join public.members m on m.id = c.member_id
    where c.member_id = target_member_id
      and c.purpose = 'food'
      and m.member_type = 'producer'
      and (m.status = 'published' or public.is_member_editor(m.id) or public.is_guild_admin())
  );
$$;

revoke all on function public.member_has_food_calendar(uuid) from public;
grant execute on function public.member_has_food_calendar(uuid) to anon, authenticated;
