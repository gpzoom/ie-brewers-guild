-- Help messages: waiting or done (docs/member-profiles.md, "Help button").
-- The super admin's bell counts the waiting ones; the Help messages screen
-- marks them done (or back to waiting). The change goes through the server
-- after its super admin check, with the service role -- there is still no
-- update policy, so nobody can change a row straight through the API.
alter table public.support_messages
  add column status text not null default 'waiting' check (status in ('waiting', 'done')),
  add column handled_at timestamptz,
  add column handled_by_user_id uuid references auth.users (id) on delete set null;

create index support_messages_waiting_idx
  on public.support_messages (created_at desc)
  where status = 'waiting';
