-- Owner invites (spec, "The People section" and "Data model additions").
-- An invite is accepted when someone signs in to /portal with the invited
-- address, which creates their member_users row with the invited role --
-- so it also works for people who already have an account, unlike the
-- Guild's create-the-account invite.
--
-- role never includes 'owner': one owner per member, and changing owner is
-- a Guild admin job from the roster.
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  email text not null check (email = btrim(email) and position('@' in email) > 1),
  role text not null check (role in ('editor', 'media_events')),
  invited_by_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pending invite per address per member. Resend extends expires_at on
-- the same row rather than inserting a second one. Email is compared
-- case-insensitively because that's how sign-in compares it.
create unique index member_invites_pending_member_email_key
  on public.member_invites (member_id, lower(email))
  where accepted_at is null and cancelled_at is null;

-- Invite acceptance looks up pending invites by the signed-in address.
create index member_invites_lower_email_idx on public.member_invites (lower(email));
create index member_invites_invited_by_user_id_idx on public.member_invites (invited_by_user_id);
create index member_invites_accepted_user_id_idx on public.member_invites (accepted_user_id);

create trigger set_updated_at before update on public.member_invites
  for each row execute function public.set_updated_at();

-- No client access at all: the Worker reads and writes invites with the
-- service key (which bypasses RLS), after its own owner check. RLS on with
-- no policies, and no table privileges either, so a direct REST call fails
-- loudly rather than returning an empty list.
alter table public.member_invites enable row level security;

revoke all on public.member_invites from anon, authenticated;
