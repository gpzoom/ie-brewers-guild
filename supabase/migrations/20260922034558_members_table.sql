create table public.members (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  member_type text not null check (member_type in ('producer', 'mobile', 'allied')),
  business_name text not null,
  tagline text check (char_length(tagline) <= 70),
  city text not null,
  state text not null default 'CA',
  street_address text,
  postal_code text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  service_area text,
  lead_time text,
  phone text,
  contact_email text,
  timezone text not null default 'America/Los_Angeles',
  theme text not null default 'amber'
    check (theme in ('amber', 'rust', 'garnet', 'plum', 'indigo', 'teal', 'forest', 'olive')),
  -- FK to media_assets added in the media_assets migration (Task 5) --
  -- media_assets.member_id references members, so members can't reference
  -- media_assets until both tables exist.
  logo_asset_id uuid,
  cover_asset_id uuid,
  cover_crop jsonb,
  member_since_year smallint,
  discount_percent smallint,
  discount_no_fixed_percent boolean not null default false,
  discount_redeem_text text,
  status text not null default 'applied'
    check (status in ('applied', 'declined', 'draft', 'published', 'suspended')),
  hours_confirmed_at timestamptz,
  published_at timestamptz,
  dues_received_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id),
  application_note text,
  trail_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index members_status_idx on public.members (status);

-- Once issued a slug never changes, or shared links break (spec,
-- "Migrating the existing members"). RLS can't enforce column-level
-- invariants, so this is a trigger rather than a check constraint.
create or replace function public.members_enforce_owner_write_limits()
returns trigger
language plpgsql
as $$
begin
  if public.is_guild_admin() then
    return new;
  end if;

  if new.slug is distinct from old.slug then
    raise exception 'slug cannot be changed';
  end if;
  if new.dues_received_at is distinct from old.dues_received_at then
    raise exception 'dues_received_at can only be set by a Guild admin';
  end if;
  if new.approved_at is distinct from old.approved_at then
    raise exception 'approved_at can only be set by a Guild admin';
  end if;
  if new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'approved_by_user_id can only be set by a Guild admin';
  end if;
  if new.trail_eligible is distinct from old.trail_eligible then
    raise exception 'trail_eligible can only be set by a Guild admin';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'published') and new.status in ('draft', 'published')) then
    raise exception 'status can only be moved between draft and published by the member; other transitions need a Guild admin';
  end if;

  return new;
end;
$$;

create trigger members_enforce_owner_write_limits
  before update on public.members
  for each row
  execute function public.members_enforce_owner_write_limits();

alter table public.members enable row level security;

create policy "members: public can read published rows"
  on public.members for select
  to anon, authenticated
  using (status = 'published');

create policy "members: guild admins can read every row"
  on public.members for select
  to authenticated
  using (public.is_guild_admin());

create policy "members: guild admins can insert"
  on public.members for insert
  to authenticated
  with check (public.is_guild_admin());

create policy "members: guild admins can update any row"
  on public.members for update
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

create policy "members: guild admins can delete"
  on public.members for delete
  to authenticated
  using (public.is_guild_admin());
