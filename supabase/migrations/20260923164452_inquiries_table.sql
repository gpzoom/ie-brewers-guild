create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  message text,
  wants_membership_info boolean not null default false,
  status text not null default 'open' check (status in ('open', 'handled')),
  confirmation_sent_at timestamptz,
  handled_by_user_id uuid references auth.users (id),
  handled_at timestamptz,
  converted_member_id uuid references public.members (id)
);

create index inquiries_status_idx on public.inquiries (status);
create index inquiries_created_at_idx on public.inquiries (created_at);

alter table public.inquiries enable row level security;

-- No public select or insert policy at all (spec: "no public select at
-- all... Inserts go through the Worker with the service key, never a
-- client-side Supabase call" -- same pattern as upload_tokens and
-- calendar_connections in the schema plan). The public contact-form
-- endpoint that inserts here is the Contact Form + Resend phase's own
-- Worker route, using the service-role key, which bypasses RLS entirely.
create policy "inquiries: guild admins can read every row"
  on public.inquiries for select
  to authenticated
  using (public.is_guild_admin());

create policy "inquiries: guild admins can update every row"
  on public.inquiries for update
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
