-- Broadcast email (docs/member-profiles.md, "broadcast_emails",
-- "broadcast_draft", "broadcast_unsubscribes"; owner approved 2026-11-12).
-- The super admin sends one email to members' owners. Everything is written
-- by the Worker with the service key after its super-admin check, so RLS is
-- on with no write policies at all. Attachments are JSON objects shaped
-- { path, filename, size_bytes, content_type }.

-- One row per send: the history the super admin reads. The site is on the
-- Cloudflare Workers Free plan (50 subrequests per request), so a send is
-- split into batches of 10 people, each its own request, driven by the
-- screen. Starting writes the row with status 'sending' and the full
-- recipient list (pending_recipients) BEFORE any email goes out; each batch
-- sends the next people from next_index and moves next_index, the counts and
-- updated_at on; the last batch sets 'sent' or 'failed'. A 'sending' row not
-- updated for 15 minutes was cut off: it reads as interrupted and Finish
-- sending picks it up from next_index.
create table public.broadcast_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- No on delete action, same as audit_log.actor_user_id: a sender's account can't be deleted out from under the history.
  sent_by_user_id uuid not null references auth.users (id),
  subject text not null,
  body_html text not null,
  attachments jsonb not null default '[]',
  audience_type text not null check (audience_type in ('all', 'type_or_category', 'members')),
  audience_filter jsonb,
  member_ids uuid[],
  recipient_count integer not null,
  failed_emails text[] not null default '{}',
  status text not null default 'sent' check (status in ('sending', 'sent', 'failed')),
  sent_at timestamptz not null default now(),
  -- Everyone it goes to, resolved at the start, in order: [{userId, email}].
  pending_recipients jsonb not null default '[]',
  -- How many of pending_recipients have been tried (sent or refused).
  next_index integer not null default 0 check (next_index >= 0),
  -- pending_recipients' length, so the history can say "N of M" without loading the list.
  total_recipients integer not null default 0 check (total_recipients >= 0),
  -- Moved on by every batch; a 'sending' row untouched for 15 minutes was interrupted.
  updated_at timestamptz not null default now()
);
alter table public.broadcast_emails enable row level security;

create policy "broadcast_emails: super admin reads"
  on public.broadcast_emails for select
  to authenticated
  using (public.is_super_admin());

-- The super admin's one saved, possibly half-written draft.
create table public.broadcast_draft (
  id boolean primary key default true check (id),
  audience_type text not null default 'all' check (audience_type in ('all', 'type_or_category', 'members')),
  audience_filter jsonb,
  member_ids uuid[],
  subject text not null default '',
  body_html text not null default '',
  attachments jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users (id) on delete set null
);
alter table public.broadcast_draft enable row level security;

-- People who opted out of broadcasts (written by the Worker only).
create table public.broadcast_unsubscribes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.broadcast_unsubscribes enable row level security;

create policy "broadcast_unsubscribes: super admin reads"
  on public.broadcast_unsubscribes for select
  to authenticated
  using (public.is_super_admin());

-- broadcast-attachments: PRIVATE (Resend fetches each file through a
-- short-lived signed URL the Worker makes per send; never linked publicly).
-- 10 MB, documents and images. The Worker uploads and deletes with the
-- service key after its super-admin check, so the only client policy is
-- select, for the super admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'broadcast-attachments', 'broadcast-attachments', false, 10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create policy "broadcast-attachments: super admin reads"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'broadcast-attachments' and public.is_super_admin());
