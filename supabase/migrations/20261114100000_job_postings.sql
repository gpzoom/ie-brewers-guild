-- Jobs board (docs/member-profiles.md, "Jobs board"; artboards CC1, CC2).
-- Ordinary member content, like events: no draft/publish gate and no Guild
-- admin review -- a save is live straight away. Any linked person (owner,
-- co-owner, editor, Photos & events editor) can manage their member's
-- postings; a Guild admin editing as them can too, exactly as with events,
-- and the server functions audit those writes (recordAuditLogIfImpersonating).

create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  employment_type text not null
    check (employment_type in ('full_time', 'part_time', 'seasonal', 'internship', 'contract')),
  location_text text check (location_text is null or length(location_text) <= 120),
  description text not null check (length(btrim(description)) between 1 and 5000),
  -- An email address or a URL; the client reads it to pick the button's
  -- label and is never parsed server-side beyond that.
  how_to_apply text not null check (length(btrim(how_to_apply)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'filled')),
  posted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);

create index job_postings_member_id_idx on public.job_postings (member_id);
create index job_postings_open_posted_at_idx on public.job_postings (posted_at desc)
  where status = 'open';

-- The dates are the server's, never the browser's: a new posting runs 60
-- days from now, and any update that touches posted_at or expires_at is a
-- Repost -- both reset to now / now + 60 days on the same row. A posting
-- also can't be moved to another member.
create or replace function public.job_postings_set_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.posted_at := now();
    new.expires_at := now() + interval '60 days';
  else
    new.member_id := old.member_id;
    new.created_at := old.created_at;
    if new.posted_at is distinct from old.posted_at
      or new.expires_at is distinct from old.expires_at then
      new.posted_at := now();
      new.expires_at := now() + interval '60 days';
    end if;
  end if;
  return new;
end;
$$;

create trigger job_postings_set_dates
  before insert or update on public.job_postings
  for each row execute function public.job_postings_set_dates();

alter table public.job_postings enable row level security;

-- Public: open, unexpired postings of published members only. A draft or
-- suspended member's postings never show, even before they expire.
create policy "job_postings: public can read open postings of published members"
  on public.job_postings for select to anon, authenticated
  using (
    status = 'open'
    and expires_at > now()
    and exists (
      select 1 from public.members m
      where m.id = job_postings.member_id and m.status = 'published'
    )
  );
create policy "job_postings: owners and editors can read their own"
  on public.job_postings for select to authenticated using (public.is_member_editor(member_id));
create policy "job_postings: guild admins can read every row"
  on public.job_postings for select to authenticated using (public.is_guild_admin());
create policy "job_postings: owners and editors can manage their own"
  on public.job_postings for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "job_postings: guild admins can manage every row"
  on public.job_postings for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
