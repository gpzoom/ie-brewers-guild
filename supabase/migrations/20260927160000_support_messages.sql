-- The Help button's messages (docs/member-profiles.md, "Help button"): a
-- bug report or feature request from anyone signed in to the member
-- portal, the old /admin editor or the Guild screens. Each one is emailed
-- to the site owner and kept here too, so nothing is lost if an email
-- fails or lands in spam.
--
-- Written only by the server (service role) after it has checked the
-- session and the rate limit, so there is no insert policy. Only the super
-- admin can read the rows; nobody can change or delete them through the API.
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bug', 'feature')),
  first_name text not null check (char_length(first_name) between 1 and 60),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 5000),
  -- The profile they were working on, worked out from the session. The name
  -- is copied so the message still makes sense if the member is deleted.
  member_id uuid references public.members (id) on delete set null,
  member_name text,
  -- Who was signed in, and whether it was a Guild admin (editing as the
  -- member, or on the Guild screens).
  submitted_by_user_id uuid references auth.users (id) on delete set null,
  sent_by_guild_admin boolean not null default false,
  page_path text check (page_path is null or char_length(page_path) <= 300),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

create index support_messages_user_created_idx
  on public.support_messages (submitted_by_user_id, created_at desc);

alter table public.support_messages enable row level security;

create policy "support_messages: super admins can read every row"
  on public.support_messages for select
  to authenticated
  using (public.is_super_admin());
