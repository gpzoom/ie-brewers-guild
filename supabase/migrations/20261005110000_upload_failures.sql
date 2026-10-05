-- Rejected photo uploads, so the Guild can see what a member tried when
-- they report "it said this type isn't supported" (owner, 2026-10-05).
-- Written only by the server with the service role (media-gallery.server.ts,
-- creator-upload.server.ts); readable only by Guild admins. No photo bytes
-- are kept -- just the name, the claimed and detected types, the size and
-- the reason.
create table public.upload_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid references public.members (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('gallery', 'creator')),
  original_filename text,
  claimed_type text,
  detected_type text,
  byte_size integer,
  reason text not null
);

create index upload_failures_created_at_idx on public.upload_failures (created_at desc);

alter table public.upload_failures enable row level security;

create policy "upload_failures: guild admins can read"
  on public.upload_failures for select
  using (public.is_guild_admin());

-- No insert/update/delete policies: only the service role writes.
revoke insert, update, delete on public.upload_failures from anon, authenticated;
