-- Invites from the super admin's Guild admins screen (docs/member-profiles.md,
-- "Super admin" > "Guild admins screen"). The invitee gets a sign-in link;
-- when they sign in with the invited address, the sign-in callback accepts
-- the invite and turns Guild admin access on for their account. Pending
-- invites show until accepted, can be resent (another 14 days, as with
-- member invites) and canceled.
create table public.guild_admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  invited_by_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open invite per address.
create unique index guild_admin_invites_open_email_key
  on public.guild_admin_invites (email)
  where accepted_at is null and cancelled_at is null;
create index guild_admin_invites_invited_by_user_id_idx on public.guild_admin_invites (invited_by_user_id);
create index guild_admin_invites_accepted_user_id_idx on public.guild_admin_invites (accepted_user_id);

create trigger set_updated_at before update on public.guild_admin_invites
  for each row execute function public.set_updated_at();

-- No client access at all: the Worker reads and writes invites with the
-- service key, after its own super admin check (or, when accepting, after
-- matching the signed-in user's own verified address).
alter table public.guild_admin_invites enable row level security;
revoke all on public.guild_admin_invites from anon, authenticated;
