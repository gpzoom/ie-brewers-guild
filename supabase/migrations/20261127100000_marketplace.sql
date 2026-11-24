-- Producer marketplace (owner, 2026-11-24): classified ads between Producers
-- -- used equipment, excess inventory, services, and "In Search Of". No bids,
-- no payments, no alcohol. Private: only full editors of a published Producer
-- and Guild admins ever read it. Guild admins own the category list.

-- Can the signed-in person browse? Guild admin, or owner / co-owner / full
-- editor of a published Producer.
create or replace function public.can_use_marketplace()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_guild_admin()
    or exists (
      select 1 from public.member_users mu
      join public.members m on m.id = mu.member_id
      where mu.user_id = auth.uid()
        and mu.role in ('owner', 'co_owner', 'editor')
        and m.member_type = 'producer'
        and m.status = 'published'
    );
$$;
revoke execute on function public.can_use_marketplace() from public, anon;
grant execute on function public.can_use_marketplace() to authenticated;

-- May the signed-in person post for this member? Draft producers may prepare
-- listings; nobody else sees those until the member is published.
create or replace function public.can_post_marketplace(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_member_full_editor(p_member_id)
    and exists (
      select 1 from public.members m
      where m.id = p_member_id
        and m.member_type = 'producer'
        and m.status in ('draft', 'published')
    );
$$;
revoke execute on function public.can_post_marketplace(uuid) from public, anon;
grant execute on function public.can_post_marketplace(uuid) to authenticated;

create table public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order int not null default 0
);
create unique index marketplace_categories_name_key on public.marketplace_categories (lower(btrim(name)));

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('equipment', 'inventory', 'service', 'wanted')),
  -- Deleting a category leaves its listings up, without a category.
  category_id uuid references public.marketplace_categories (id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 5000),
  condition text check (condition in ('new', 'like_new', 'good', 'fair', 'parts')),
  -- Asking price, or the budget on an In Search Of. Null: "Contact for price".
  price_cents bigint check (price_cents between 0 and 100000000),
  price_unit text check (price_unit is null or length(price_unit) <= 40),
  negotiable boolean not null default false,
  location_text text check (location_text is null or length(location_text) <= 120),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  contact_email text check (contact_email is null or length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  status text not null default 'open' check (status in ('open', 'closed')),
  posted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  check (coalesce(contact_email, contact_phone) is not null)
);
create index marketplace_listings_member_id_idx on public.marketplace_listings (member_id);
create index marketplace_listings_category_id_idx on public.marketplace_listings (category_id);
create index marketplace_listings_open_idx on public.marketplace_listings (posted_at desc) where status = 'open';

-- The server's dates (as job_postings): 60 days from posting; touching either
-- date is a Renew. A listing can't move to another member, and its photos
-- must sit in that member's own folder.
create or replace function public.marketplace_listings_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.posted_at := now();
    new.expires_at := now() + interval '60 days';
  else
    new.member_id := old.member_id;
    new.created_at := old.created_at;
    if new.posted_at is distinct from old.posted_at or new.expires_at is distinct from old.expires_at then
      new.posted_at := now();
      new.expires_at := now() + interval '60 days';
    end if;
  end if;
  foreach v_path in array new.photo_paths loop
    if v_path is null or v_path !~ ('^' || new.member_id::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'A photo must belong to the member posting it.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger marketplace_listings_guard
  before insert or update on public.marketplace_listings
  for each row execute function public.marketplace_listings_guard();

alter table public.marketplace_categories enable row level security;
alter table public.marketplace_listings enable row level security;

create policy "marketplace_categories: producers and guild admins can read"
  on public.marketplace_categories for select to authenticated
  using (
    public.can_use_marketplace()
    or exists (
      select 1 from public.member_users mu
      where mu.user_id = auth.uid() and public.can_post_marketplace(mu.member_id)
    )
  );
create policy "marketplace_categories: guild admins manage"
  on public.marketplace_categories for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

create policy "marketplace_listings: producers read open listings"
  on public.marketplace_listings for select to authenticated
  using (
    status = 'open'
    and expires_at > now()
    and public.can_use_marketplace()
    and exists (
      select 1 from public.members m
      where m.id = marketplace_listings.member_id
        and m.member_type = 'producer' and m.status = 'published'
    )
  );
-- Includes Guild admins (is_member_full_editor).
create policy "marketplace_listings: full editors read their own"
  on public.marketplace_listings for select to authenticated
  using (public.is_member_full_editor(member_id));
create policy "marketplace_listings: producers post"
  on public.marketplace_listings for insert to authenticated
  with check (public.can_post_marketplace(member_id));
create policy "marketplace_listings: producers change their own"
  on public.marketplace_listings for update to authenticated
  using (public.can_post_marketplace(member_id)) with check (public.can_post_marketplace(member_id));
create policy "marketplace_listings: full editors delete their own"
  on public.marketplace_listings for delete to authenticated
  using (public.is_member_full_editor(member_id));

-- Photos: {member_id}/{file}, private, shown through short-lived links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-photos', 'marketplace-photos', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "marketplace-photos: producers view"
  on storage.objects for select to authenticated
  using (bucket_id = 'marketplace-photos' and public.can_use_marketplace());
create policy "marketplace-photos: full editors view their own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'marketplace-photos'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(objects.name))[1] and public.is_member_full_editor(m.id)
    )
  );
create policy "marketplace-photos: producers add to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-photos'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(objects.name))[1] and public.can_post_marketplace(m.id)
    )
  );
create policy "marketplace-photos: full editors remove from their folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-photos'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(objects.name))[1] and public.is_member_full_editor(m.id)
    )
  );

-- A starting list; Guild admins rename, reorder, add and remove.
insert into public.marketplace_categories (name, sort_order) values
  ('Brewhouse & brewing equipment', 0),
  ('Fermenters & tanks', 1),
  ('Kegs & cooperage', 2),
  ('Canning, bottling & packaging', 3),
  ('Draft & taproom equipment', 4),
  ('Cold storage & refrigeration', 5),
  ('Ingredients & supplies', 6),
  ('Services', 7),
  ('Other', 8);
