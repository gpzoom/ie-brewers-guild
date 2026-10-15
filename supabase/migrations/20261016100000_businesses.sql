-- Multi-location businesses, part 1 (spec 2026-10-15-multi-location-businesses-design.md).
-- A business ties a member's locations together. Every business starts as
-- 'separate' with no manager, so nothing visible changes yet.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  management_mode text not null default 'separate'
    check (management_mode in ('separate', 'one_manager')),
  manager_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_manager_only_when_one_manager
    check (management_mode = 'one_manager' or manager_user_id is null)
);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;

-- The Members page groups by business, so visitors read id and name only.
revoke all on public.businesses from anon, authenticated;
grant select (id, name) on public.businesses to anon;
grant select on public.businesses to authenticated;
grant insert, update, delete on public.businesses to authenticated;

create policy "businesses: anyone can read"
  on public.businesses for select to anon, authenticated using (true);
create policy "businesses: guild admins can insert"
  on public.businesses for insert to authenticated with check (public.is_guild_admin());
create policy "businesses: guild admins can update"
  on public.businesses for update to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
create policy "businesses: guild admins can delete"
  on public.businesses for delete to authenticated using (public.is_guild_admin());

alter table public.members
  add column business_id uuid references public.businesses (id) on delete set null;
create index members_business_id_idx on public.members (business_id);
grant select (business_id) on public.members to anon, authenticated;

-- Backfill: each set of two or more members sharing a trimmed name becomes one business.
with groups as (
  select btrim(business_name) as name
  from public.members
  group by btrim(business_name)
  having count(*) > 1
), inserted as (
  insert into public.businesses (name)
  select name from groups
  returning id, name
)
update public.members m
set business_id = i.id
from inserted i
where btrim(m.business_name) = i.name;

-- Until the roster's "Part of" choice exists (part 2), a new member whose
-- name matches an existing member joins that member's business (creating
-- it when needed) -- the same grouping the Members page did by name.
create or replace function public.members_join_business_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sibling record;
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;

  select id, business_id into v_sibling
  from public.members
  where btrim(business_name) = btrim(new.business_name)
    and id <> new.id
  order by created_at
  limit 1;

  if not found then
    return new;
  end if;

  v_business := v_sibling.business_id;
  if v_business is null then
    insert into public.businesses (name) values (btrim(new.business_name))
    returning id into v_business;
    update public.members set business_id = v_business where id = v_sibling.id;
  end if;

  new.business_id := v_business;
  return new;
end;
$$;

create trigger members_join_business_by_name
  before insert on public.members
  for each row execute function public.members_join_business_by_name();
