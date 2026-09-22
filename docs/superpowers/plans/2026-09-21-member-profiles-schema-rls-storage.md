# Member Profiles: Schema, RLS, Storage, Seed Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the entire Supabase backend for the member profile system — every table, check constraint, RLS policy and storage bucket the spec describes — against the Guild's existing Supabase project, and seed the first Guild admin account so every later phase has something to build on.

**Architecture:** Pure backend. No application code changes in this plan — no routes, no Supabase client wiring, no UI. Everything lands as SQL migration files under `supabase/migrations/`, applied with the Supabase CLI, plus one Node seed script that runs once against the service-role key. Phase 3 (public profile) is the first plan that adds an in-app Supabase client.

**Tech Stack:** Supabase CLI, Postgres (via Supabase), `@supabase/supabase-js` (seed script only, run under plain Node — not bundled into the Cloudflare Worker).

**Spec:** `docs/member-profiles.md` — sections "Data model", "Row level security", "Storage buckets", "Roles" (seed admin), "Migrating the existing members" (informs why `status` defaults matter here even though import itself is a later plan).

## Global Constraints

- Every table gets `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` unless the spec says otherwise. (Spec, "Data model" preamble.)
- Foreign keys cascade on delete from `members` unless the spec notes a different behavior (`on delete set null` for `logo_asset_id`/`cover_asset_id`, `on delete restrict` for `carousel_slides.asset_id`). (Spec, "Data model" preamble.)
- Use `text` columns with `check` constraints for enumerated values, never Postgres `enum` types — these sets will change and enums are awkward to alter in a migration. (Spec, "Stack".)
- Every table gets Row Level Security enabled. No table is left open. (Spec, "Row level security".)
- The Supabase service-role key must never be a `VITE_*` variable and must never be committed — it lives in `.env` (gitignored, seed script only, plain Node) and later, for in-app server-side use, as a Cloudflare Worker secret (`wrangler secret put`, or `.dev.vars` for local dev). This plan only uses it from the Node seed script; Worker-side usage starts in a later plan.
- Store times as `time` in local wall-clock, not UTC — hours are "we open at 3pm" and must not shift when daylight saving does. (Spec, "Computing 'open now'".)
- A crop rectangle is `{"x":0.08,"y":0.0,"w":0.84,"h":1.0}` — fractions of the original's width/height, stored as `jsonb`. (Spec, "Data model", members table note.)

## Decisions made while filling gaps the spec left open

These aren't spec requirements — they're necessary technical completions the spec's own RLS section didn't spell out, needed to make the rest of the build possible. Flagging them here so they're visible, not silently baked into SQL:

1. **Owners/editors can `select` their own member row and its children regardless of `status`.** The spec's RLS section only grants public select on `published` rows. Taken literally, an owner could never read their own `draft` profile to edit it. Added an owner-select policy alongside the public one, on every table that has a public-select policy.
2. **Guild admins bypass RLS row-scoping everywhere**, via an `is_guild_admin()` helper function. The spec's RLS section never states this, but the entire Guild admin surface (roster, impersonation, approvals, brand editor, categories) requires it — there's no other way those screens function under RLS.
3. **A trigger blocks non-guild-admin writes to `members.slug`, `.dues_received_at`, `.approved_at`, `.approved_by_user_id`, `.trail_eligible`, and any `.status` transition other than `draft ⇄ published`.** RLS row-policies can't do column-level checks. Without this, a member's own browser could call the Supabase REST API directly (not through our UI) and set `approved_at` or flip `status` to `suspended` on their own row — RLS is the actual API boundary in Supabase, "the UI won't expose that field" is not a real defense. This is the same "once issued a slug never changes" invariant the spec states, made durable at the DB layer instead of just a UI convention.
4. **`categories` (the Allied Member supply-category list) is publicly readable by everyone, writable only by Guild admins.** The spec defines the table but not who manages it; artboard S ("supply categories") is listed under Guild admin, so that's where writes are scoped.
5. **`calendar_connections.google_refresh_token` is created as `text` now**, holding a Supabase Vault secret reference (not the raw token) once the OAuth flow exists. Actually wiring Vault happens in the Member Admin (Events) plan — this plan only shapes the column correctly.
6. **EXIF stripping is not implemented here.** The spec says to strip EXIF on ingest for both buckets, but ingest code doesn't exist until the Member Admin (media) and creator-upload plans. This plan only creates the buckets and their access policies; flagging so it isn't silently dropped.

---

### Task 1: Supabase CLI setup and project link

**Files:**
- Create: `supabase/config.toml` (generated by `supabase init`)
- Modify: `.gitignore` (add `supabase/.temp`)
- Modify: `.env.example`

**Interfaces:**
- Produces: a linked local `supabase/` project directory that every later task's `supabase migration new` / `supabase db push` runs against.

- [ ] **Step 1: Install the Supabase CLI as a dev dependency**

```bash
npm install --save-dev supabase
```

- [ ] **Step 2: Initialize the local Supabase project structure**

```bash
npx supabase init
```

Expected: creates `supabase/config.toml` and `supabase/` directory. When prompted about VS Code settings, either answer is fine.

- [ ] **Step 3: Log in and link to the existing Supabase project (manual — needs your input)**

You'll need two things from the Supabase dashboard:
- Your project's **reference ID** (Project Settings → General → "Reference ID", looks like `abcdefghijklmnop`).
- A personal **access token** (https://supabase.com/dashboard/account/tokens → "Generate new token").

Run:

```bash
npx supabase login
```

This opens a browser to authorize the CLI (or accepts a pasted access token if the browser flow isn't available in this environment — it will prompt).

Then link:

```bash
npx supabase link --project-ref <your-project-ref>
```

It will ask for your database password (Project Settings → Database → "Database password" — reset it there if you don't have it saved).

Expected: `Finished supabase link.` with no errors.

- [ ] **Step 4: Add `.env.example` entries for the Supabase keys this project will need**

Add to `.env.example` (after the existing entries, don't remove anything):

```bash
# Supabase project keys (Project Settings -> API in the Supabase dashboard).
# The anon key is safe to expose to the browser -- Vite inlines VITE_* at
# build time, so also set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as
# Cloudflare Workers Builds build variables (same pattern as the Google Maps key).
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Server-only. NEVER prefix this with VITE_ -- that would ship it to the
# browser bundle and give every visitor full read/write access to the
# database, bypassing every RLS policy in this project.
# Used by scripts/seed-guild-admin.ts (plain Node, not bundled).
# Later, in-app server-side usage will read this as a Cloudflare Worker
# secret (wrangler secret put SUPABASE_SERVICE_ROLE_KEY), not from .env.
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Add `supabase/.temp` to `.gitignore`**

Add under the existing "Wrangler / Cloudflare" block or its own line:

```
supabase/.temp
```

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml .gitignore .env.example
git commit -m "chore: initialize Supabase CLI project"
```

(`supabase/.temp` is gitignored and won't be staged; don't commit anything under it if it appears.)

---

### Task 2: `profiles` table, `is_guild_admin()` helper, and its RLS

**Files:**
- Create: a new migration via `supabase migration new profiles_table`

**Interfaces:**
- Produces: `public.profiles(id, is_guild_admin, created_at, updated_at)` and `public.is_guild_admin() returns boolean` — every later task's RLS policies call this function.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new profiles_table
```

Expected: creates `supabase/migrations/<timestamp>_profiles_table.sql`, empty.

- [ ] **Step 2: Write the migration**

Replace its contents with:

```sql
-- profiles: platform role, keyed to auth.users. Only is_guild_admin lives
-- here for now — member-editor role lives on member_users instead (spec,
-- "Roles"). A Guild admin is not automatically a member editor.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_guild_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer: profiles' own RLS only lets a user read their own row,
-- so every other table's RLS policy needs a way to check guild-admin status
-- that isn't itself blocked by that same restriction.
create or replace function public.is_guild_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_guild_admin
  );
$$;

create policy "profiles: users can read their own row"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: guild admins can read every row"
  on public.profiles for select
  to authenticated
  using (public.is_guild_admin());
```

No insert/update/delete policy is created for `authenticated` or `anon` — only the service role (which bypasses RLS) can write to this table. That's deliberate: there is no UI in this build for promoting a Guild admin, matching "cannot be created through the UI because the UI requires an admin."

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

Expected: `Applying migration <timestamp>_profiles_table.sql...` then success, no errors.

- [ ] **Step 4: Verify**

```bash
npx supabase db execute --sql "select is_guild_admin();"
```

Expected: returns `f` (false) — there's no authenticated session in this call, and no rows in `profiles` yet, so it degrades safely rather than erroring.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add profiles table and is_guild_admin() helper"
```

---

### Task 3: `members` table (no FK yet to media_assets — added in Task 5)

**Files:**
- Create: a new migration via `supabase migration new members_table`

**Interfaces:**
- Produces: `public.members` with every column from the spec's table. `logo_asset_id`/`cover_asset_id` are plain `uuid` here (no FK) because `media_assets` doesn't exist yet — Task 5 adds the FK once it does.
- Consumes: `public.is_guild_admin()` from Task 2.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new members_table
```

- [ ] **Step 2: Write the migration**

```sql
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
```

Owner select/update policies (`is_member_editor`-based) are added in Task 4, right after `member_users` exists — that function needs the `member_users` table to query.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the check constraints reject bad data**

```bash
npx supabase db execute --sql "insert into members (slug, member_type, business_name, city) values ('test-bad-type', 'winery', 'Test', 'Riverside');"
```

Expected: fails with a `check constraint "members_member_type_check"` violation. This confirms the constraint is live before moving on.

- [ ] **Step 5: Verify a valid row and the slug-immutability trigger**

```bash
npx supabase db execute --sql "
insert into members (slug, member_type, business_name, city)
values ('trigger-test', 'producer', 'Trigger Test', 'Riverside');
update members set slug = 'changed' where slug = 'trigger-test';
"
```

Expected: the insert succeeds; the update fails with `slug cannot be changed` — because this runs with no authenticated session, `is_guild_admin()` is false, so the trigger's owner-limit branch applies. Clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'trigger-test';"
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add members table with status/slug write guards"
```

---

### Task 4: `member_users` table, `is_member_editor()` helper, and members' owner policies

**Files:**
- Create: a new migration via `supabase migration new member_users_table`

**Interfaces:**
- Produces: `public.member_users(member_id, user_id, role)` and `public.is_member_editor(uuid) returns boolean` — every child table's RLS from here on calls this.
- Consumes: `public.members`, `public.is_guild_admin()`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new member_users_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.member_users (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, user_id)
);

create index member_users_user_id_idx on public.member_users (user_id);

create or replace function public.is_member_editor(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_users mu
    where mu.member_id = target_member_id and mu.user_id = auth.uid()
  );
$$;

alter table public.member_users enable row level security;

create policy "member_users: users can read their own links"
  on public.member_users for select
  to authenticated
  using (user_id = auth.uid());

create policy "member_users: guild admins can read every row"
  on public.member_users for select
  to authenticated
  using (public.is_guild_admin());

create policy "member_users: guild admins can manage every row"
  on public.member_users for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

-- Now that is_member_editor() exists, add the owner-visibility policies
-- the "Decisions made while filling gaps" note above calls for.
create policy "members: owners and editors can read their own row"
  on public.members for select
  to authenticated
  using (public.is_member_editor(id));

create policy "members: owners and editors can update their own row"
  on public.members for update
  to authenticated
  using (public.is_member_editor(id))
  with check (public.is_member_editor(id));
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the unique constraint**

```bash
npx supabase db execute --sql "
insert into members (slug, member_type, business_name, city) values ('mu-test', 'producer', 'MU Test', 'Riverside');
insert into member_users (member_id, user_id, role)
  select id, '00000000-0000-0000-0000-000000000001', 'owner' from members where slug = 'mu-test';
insert into member_users (member_id, user_id, role)
  select id, '00000000-0000-0000-0000-000000000001', 'editor' from members where slug = 'mu-test';
"
```

Expected: first insert succeeds, second fails on the `member_users_member_id_user_id_key` unique violation. Clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'mu-test';"
```

(cascades to `member_users` automatically)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add member_users table, is_member_editor(), members owner policies"
```

---

### Task 5: `media_assets` table, plus the deferred FK on `members`

**Files:**
- Create: a new migration via `supabase migration new media_assets_table`

**Interfaces:**
- Produces: `public.media_assets`, and adds the FK from `members.logo_asset_id`/`.cover_asset_id` deferred since Task 3.
- Consumes: `public.members`, `public.member_users`, `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new media_assets_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  byte_size bigint not null,
  width int,
  height int,
  duration_ms int,
  original_filename text,
  source text not null check (source in ('member_upload', 'creator_upload')),
  uploaded_by_user_id uuid references auth.users (id),
  upload_token_id uuid, -- FK added in Task 9, once upload_tokens exists
  creator_name text,
  creator_credit boolean not null default false,
  permission_accepted_at timestamptz,
  review_status text not null default 'approved'
    check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_member_id_idx on public.media_assets (member_id);

-- Deferred FK from Task 3: both tables now exist.
alter table public.members
  add constraint members_logo_asset_id_fkey
    foreign key (logo_asset_id) references public.media_assets (id) on delete set null,
  add constraint members_cover_asset_id_fkey
    foreign key (cover_asset_id) references public.media_assets (id) on delete set null;

alter table public.media_assets enable row level security;

-- Public select: approved AND referenced by a published slide, logo, or
-- cover (spec, "Row level security"). carousel_slides doesn't exist until
-- Task 6, so this policy is created there instead, once it can reference it.

create policy "media_assets: owners and editors can read all their own rows"
  on public.media_assets for select
  to authenticated
  using (public.is_member_editor(member_id));

create policy "media_assets: guild admins can read every row"
  on public.media_assets for select
  to authenticated
  using (public.is_guild_admin());

create policy "media_assets: owners and editors can insert"
  on public.media_assets for insert
  to authenticated
  with check (public.is_member_editor(member_id));

create policy "media_assets: owners and editors can update their own rows"
  on public.media_assets for update
  to authenticated
  using (public.is_member_editor(member_id))
  with check (public.is_member_editor(member_id));

create policy "media_assets: owners and editors can delete their own rows"
  on public.media_assets for delete
  to authenticated
  using (public.is_member_editor(member_id));

create policy "media_assets: guild admins can manage every row"
  on public.media_assets for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());
```

Creator-upload inserts (`source = 'creator_upload'`) don't go through this insert policy at all — the creator-upload Worker route (a later plan) writes with the service-role key, which bypasses RLS entirely. That's the point: the token never touches a client-side Supabase call.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the deferred FK is in place**

```bash
npx supabase db execute --sql "select conname from pg_constraint where conname in ('members_logo_asset_id_fkey', 'members_cover_asset_id_fkey');"
```

Expected: both constraint names returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add media_assets table and deferred members FK"
```

---

### Task 6: `carousel_slides` table, plus the deferred `media_assets` public-select policy

**Files:**
- Create: a new migration via `supabase migration new carousel_slides_table`

**Interfaces:**
- Produces: `public.carousel_slides`.
- Consumes: `public.members`, `public.media_assets`, `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new carousel_slides_table
```

- [ ] **Step 2: Write the migration**

```sql
create table public.carousel_slides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  crop jsonb not null,
  outbound_url text,
  sort_order smallint not null check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, sort_order)
);

create index carousel_slides_member_id_idx on public.carousel_slides (member_id);

alter table public.carousel_slides enable row level security;

create policy "carousel_slides: public can read slides of published members"
  on public.carousel_slides for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = carousel_slides.member_id and m.status = 'published'
    )
  );

create policy "carousel_slides: owners and editors can read their own"
  on public.carousel_slides for select
  to authenticated
  using (public.is_member_editor(member_id));

create policy "carousel_slides: guild admins can read every row"
  on public.carousel_slides for select
  to authenticated
  using (public.is_guild_admin());

create policy "carousel_slides: owners and editors can manage their own"
  on public.carousel_slides for all
  to authenticated
  using (public.is_member_editor(member_id))
  with check (public.is_member_editor(member_id));

create policy "carousel_slides: guild admins can manage every row"
  on public.carousel_slides for all
  to authenticated
  using (public.is_guild_admin())
  with check (public.is_guild_admin());

-- Deferred from Task 5: media_assets' public select needs carousel_slides
-- to exist, to check "referenced by a published slide."
create policy "media_assets: public can read approved assets referenced by a published slide/logo/cover"
  on public.media_assets for select
  to anon, authenticated
  using (
    review_status = 'approved'
    and (
      exists (
        select 1 from public.carousel_slides cs
        join public.members m on m.id = cs.member_id
        where cs.asset_id = media_assets.id and m.status = 'published'
      )
      or exists (
        select 1 from public.members m
        where (m.logo_asset_id = media_assets.id or m.cover_asset_id = media_assets.id)
          and m.status = 'published'
      )
    )
  );
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify `sort_order` and uniqueness constraints**

```bash
npx supabase db execute --sql "
insert into members (slug, member_type, business_name, city) values ('cs-test', 'producer', 'CS Test', 'Riverside');
insert into media_assets (member_id, storage_path, kind, mime_type, byte_size, source)
  select id, 'cs-test/a.jpg', 'image', 'image/jpeg', 1000, 'member_upload' from members where slug = 'cs-test';
insert into carousel_slides (member_id, asset_id, crop, sort_order)
  select m.id, a.id, '{\"x\":0,\"y\":0,\"w\":1,\"h\":1}'::jsonb, 4
  from members m join media_assets a on a.member_id = m.id where m.slug = 'cs-test';
"
```

Expected: fails on the `sort_order between 0 and 3` check. Retry with `sort_order` 0, expect success, then clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'cs-test';"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add carousel_slides table and media_assets public-select policy"
```

---

### Task 7: `member_links`, `hours`, `special_hours`

**Files:**
- Create: a new migration via `supabase migration new member_links_hours_tables`

**Interfaces:**
- Produces: `public.member_links`, `public.hours`, `public.special_hours`.
- Consumes: `public.members`, `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new member_links_hours_tables
```

- [ ] **Step 2: Write the migration**

```sql
create table public.member_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in (
    'website', 'instagram', 'facebook', 'tiktok', 'taplist', 'menu', 'press_kit', 'catalog', 'other'
  )),
  label text,
  url text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_links_member_id_idx on public.member_links (member_id);

create table public.hours (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hours_member_id_weekday_idx on public.hours (member_id, weekday);

create table public.special_hours (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  date date not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index special_hours_member_id_date_idx on public.special_hours (member_id, date);

-- Same three-policy shape (public-if-parent-published, owner-all,
-- guild-admin-all) repeats for every remaining member-scoped child table.
alter table public.member_links enable row level security;

create policy "member_links: public can read links of published members"
  on public.member_links for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = member_links.member_id and m.status = 'published'));
create policy "member_links: owners and editors can read their own"
  on public.member_links for select to authenticated using (public.is_member_editor(member_id));
create policy "member_links: guild admins can read every row"
  on public.member_links for select to authenticated using (public.is_guild_admin());
create policy "member_links: owners and editors can manage their own"
  on public.member_links for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "member_links: guild admins can manage every row"
  on public.member_links for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.hours enable row level security;

create policy "hours: public can read hours of published members"
  on public.hours for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = hours.member_id and m.status = 'published'));
create policy "hours: owners and editors can read their own"
  on public.hours for select to authenticated using (public.is_member_editor(member_id));
create policy "hours: guild admins can read every row"
  on public.hours for select to authenticated using (public.is_guild_admin());
create policy "hours: owners and editors can manage their own"
  on public.hours for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "hours: guild admins can manage every row"
  on public.hours for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.special_hours enable row level security;

create policy "special_hours: public can read special hours of published members"
  on public.special_hours for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = special_hours.member_id and m.status = 'published'));
create policy "special_hours: owners and editors can read their own"
  on public.special_hours for select to authenticated using (public.is_member_editor(member_id));
create policy "special_hours: guild admins can read every row"
  on public.special_hours for select to authenticated using (public.is_guild_admin());
create policy "special_hours: owners and editors can manage their own"
  on public.special_hours for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "special_hours: guild admins can manage every row"
  on public.special_hours for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the `weekday` check constraint**

```bash
npx supabase db execute --sql "
insert into members (slug, member_type, business_name, city) values ('hrs-test', 'producer', 'Hours Test', 'Riverside');
insert into hours (member_id, weekday, opens_at, closes_at)
  select id, 7, '09:00', '17:00' from members where slug = 'hrs-test';
"
```

Expected: fails on `hours_weekday_check`. Clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'hrs-test';"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add member_links, hours, special_hours tables"
```

---

### Task 8: `calendar_connections`, `events`

**Files:**
- Create: a new migration via `supabase migration new calendar_events_tables`

**Interfaces:**
- Produces: `public.calendar_connections`, `public.events`.
- Consumes: `public.members`, `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new calendar_events_tables
```

- [ ] **Step 2: Write the migration**

```sql
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  provider text not null check (provider in ('google', 'ics')),
  -- Holds a Supabase Vault secret reference once the OAuth flow exists
  -- (spec: "store in Supabase Vault, not plaintext"), not the raw token.
  -- Vault wiring is implemented in the Member Admin (Events) plan.
  google_refresh_token text,
  google_calendar_id text,
  ics_url text,
  sync_tag text,
  last_synced_at timestamptz,
  last_sync_error text,
  sync_status text not null default 'ok' check (sync_status in ('ok', 'failing', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_connections_member_id_idx on public.calendar_connections (member_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  calendar_connection_id uuid references public.calendar_connections (id) on delete cascade,
  source text not null check (source in ('google', 'ics', 'manual')),
  external_event_id text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text,
  city text,
  address text,
  overlay_status text check (overlay_status in ('postponed', 'rescheduled', 'canceled')),
  overlay_starts_at timestamptz,
  overlay_note text,
  overlay_set_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_connection_id, external_event_id)
);

create index events_member_id_starts_at_idx on public.events (member_id, starts_at);

alter table public.calendar_connections enable row level security;

-- No public select at all (spec, "Row level security") -- only owners/
-- editors and guild admins, ever.
create policy "calendar_connections: owners and editors can read their own"
  on public.calendar_connections for select to authenticated using (public.is_member_editor(member_id));
create policy "calendar_connections: guild admins can read every row"
  on public.calendar_connections for select to authenticated using (public.is_guild_admin());
create policy "calendar_connections: owners and editors can manage their own"
  on public.calendar_connections for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "calendar_connections: guild admins can manage every row"
  on public.calendar_connections for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.events enable row level security;

create policy "events: public can read events of published members"
  on public.events for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = events.member_id and m.status = 'published'));
create policy "events: owners and editors can read their own"
  on public.events for select to authenticated using (public.is_member_editor(member_id));
create policy "events: guild admins can read every row"
  on public.events for select to authenticated using (public.is_guild_admin());
create policy "events: owners and editors can manage their own"
  on public.events for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "events: guild admins can manage every row"
  on public.events for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
```

`unique (calendar_connection_id, external_event_id)` is what a re-sync reconciles against — Postgres treats two `null` values in a unique constraint as distinct, so hand-entered events (both columns null) never collide with each other, and a re-sync upserting on this pair never touches the `overlay_*` columns unless the sync code explicitly writes them (which it must not — that's the whole point, per the spec).

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the reconciliation-key uniqueness behavior**

```bash
npx supabase db execute --sql "
insert into members (slug, member_type, business_name, city) values ('evt-test', 'producer', 'Event Test', 'Riverside');
insert into events (member_id, source, starts_at, overlay_status, overlay_note)
  select id, 'manual', now(), null, null from members where slug = 'evt-test';
insert into events (member_id, source, starts_at)
  select id, 'manual', now() + interval '1 day' from members where slug = 'evt-test';
"
```

Expected: both inserts succeed (both have `calendar_connection_id` and `external_event_id` null — no collision). Clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'evt-test';"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add calendar_connections and events tables"
```

---

### Task 9: `upload_tokens`, `categories`, `member_categories`, and the deferred `media_assets` FK

**Files:**
- Create: a new migration via `supabase migration new upload_tokens_categories_tables`

**Interfaces:**
- Produces: `public.upload_tokens`, `public.categories`, `public.member_categories`; adds the deferred FK from `media_assets.upload_token_id`.
- Consumes: `public.members`, `public.media_assets`, `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new upload_tokens_categories_tables
```

- [ ] **Step 2: Write the migration**

```sql
create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  token_hash text not null,
  created_by_user_id uuid not null references auth.users (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_files smallint not null default 5,
  used_count smallint not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index upload_tokens_member_id_idx on public.upload_tokens (member_id);

alter table public.media_assets
  add constraint media_assets_upload_token_id_fkey
    foreign key (upload_token_id) references public.upload_tokens (id) on delete set null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_categories (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category_id)
);

create index member_categories_member_id_idx on public.member_categories (member_id);

alter table public.upload_tokens enable row level security;

-- No public select at all -- the creator-upload Worker route validates
-- tokens with the service key, which bypasses RLS entirely.
create policy "upload_tokens: owners and editors can read their own"
  on public.upload_tokens for select to authenticated using (public.is_member_editor(member_id));
create policy "upload_tokens: guild admins can read every row"
  on public.upload_tokens for select to authenticated using (public.is_guild_admin());
create policy "upload_tokens: owners and editors can manage their own"
  on public.upload_tokens for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "upload_tokens: guild admins can manage every row"
  on public.upload_tokens for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.categories enable row level security;

-- Categories are a shared, curated taxonomy (artboard S is a Guild admin
-- screen) -- everyone reads, only Guild admins write.
create policy "categories: anyone can read"
  on public.categories for select to anon, authenticated using (true);
create policy "categories: guild admins can manage"
  on public.categories for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());

alter table public.member_categories enable row level security;

create policy "member_categories: public can read categories of published members"
  on public.member_categories for select to anon, authenticated
  using (exists (select 1 from public.members m where m.id = member_categories.member_id and m.status = 'published'));
create policy "member_categories: owners and editors can read their own"
  on public.member_categories for select to authenticated using (public.is_member_editor(member_id));
create policy "member_categories: guild admins can read every row"
  on public.member_categories for select to authenticated using (public.is_guild_admin());
create policy "member_categories: owners and editors can manage their own"
  on public.member_categories for all to authenticated
  using (public.is_member_editor(member_id)) with check (public.is_member_editor(member_id));
create policy "member_categories: guild admins can manage every row"
  on public.member_categories for all to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the `member_categories` unique constraint and category read access**

```bash
npx supabase db execute --sql "
insert into categories (name, slug) values ('Malt & Grain', 'malt-grain');
insert into members (slug, member_type, business_name, city) values ('cat-test', 'allied', 'Cat Test', 'Riverside');
insert into member_categories (member_id, category_id)
  select m.id, c.id from members m, categories c where m.slug = 'cat-test' and c.slug = 'malt-grain';
insert into member_categories (member_id, category_id)
  select m.id, c.id from members m, categories c where m.slug = 'cat-test' and c.slug = 'malt-grain';
"
```

Expected: first `member_categories` insert succeeds, second fails on the unique constraint. Clean up:

```bash
npx supabase db execute --sql "delete from members where slug = 'cat-test'; delete from categories where slug = 'malt-grain';"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add upload_tokens, categories, member_categories tables"
```

---

### Task 10: Storage buckets and their access policies

**Files:**
- Create: a new migration via `supabase migration new storage_buckets`

**Interfaces:**
- Produces: `member-media` (private) and `member-logos` (public) buckets with `storage.objects` policies.
- Consumes: `public.is_member_editor`, `public.is_guild_admin`.

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new storage_buckets
```

- [ ] **Step 2: Write the migration**

```sql
insert into storage.buckets (id, name, public)
values ('member-media', 'member-media', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('member-logos', 'member-logos', true)
on conflict (id) do nothing;

-- Path convention for both buckets: {member_id}/{filename}. This lets
-- storage.foldername(name) pull the member_id straight out of the path
-- for RLS, without a lookup table.

-- member-media: fully private. The public reaches it only through a
-- Worker that applies crop/resize (a later plan) using the service key,
-- which bypasses RLS -- so there is deliberately no anon/public select
-- policy on this bucket at all.
create policy "member-media: owners and editors manage their folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'member-media'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'member-media'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  );

create policy "member-media: guild admins manage everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'member-media' and public.is_guild_admin())
  with check (bucket_id = 'member-media' and public.is_guild_admin());

-- member-logos: public, since logos are published anyway (spec, "Storage
-- buckets").
create policy "member-logos: anyone can read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'member-logos');

create policy "member-logos: owners and editors manage their folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'member-logos'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'member-logos'
    and public.is_member_editor((storage.foldername(name))[1]::uuid)
  );

create policy "member-logos: guild admins manage everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'member-logos' and public.is_guild_admin())
  with check (bucket_id = 'member-logos' and public.is_guild_admin());
```

EXIF stripping on ingest (spec, "Logos and assets") is not implemented by this migration — it's upload-processing code that doesn't exist until the Member Admin (media) and creator-upload plans. This task only creates the buckets and their access rules.

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the buckets exist with the right visibility**

```bash
npx supabase db execute --sql "select id, public from storage.buckets where id in ('member-media', 'member-logos') order by id;"
```

Expected:
```
      id       | public
---------------+--------
 member-logos  | t
 member-media  | f
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add member-media and member-logos storage buckets"
```

---

### Task 11: Seed the first Guild admin (boblelle77@gmail.com)

**Files:**
- Create: `scripts/seed-guild-admin.ts`
- Modify: `package.json` (add `@supabase/supabase-js` as a dependency — this script runs under plain Node, not bundled by Vite)

**Interfaces:**
- Produces: an `auth.users` row and a `profiles` row with `is_guild_admin = true` for `boblelle77@gmail.com`. Every later phase that needs "a Guild admin exists" depends on this having run.
- Consumes: `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_URL` from `.env`.

- [ ] **Step 1: Install the Supabase JS client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-guild-admin.ts`:

```ts
/**
 * One-time seed: create the first Guild admin account.
 *
 * Nothing else in this system can be created through the UI until this
 * exists -- the Guild admin UI requires an admin to use it, and there is
 * no signup flow. This is the one and only bootstrap step.
 *
 * Run:
 *   node --env-file=.env scripts/seed-guild-admin.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "boblelle77@gmail.com";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill both in.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingUser(email: string) {
  // admin.listUsers() doesn't take an email filter in supabase-js v2, so
  // page through (there won't be more than a handful of users this early).
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return undefined;
    page += 1;
  }
}

async function main() {
  let user = await findExistingUser(ADMIN_EMAIL);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user ${user.id} for ${ADMIN_EMAIL}`);
  } else {
    console.log(`Auth user already exists: ${user.id}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, is_guild_admin: true }, { onConflict: "id" });
  if (profileError) throw profileError;

  console.log(`profiles row set: is_guild_admin = true for ${ADMIN_EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Fill in real Supabase credentials (manual — needs your input)**

Open `.env` (create it from `.env.example` if you haven't) and fill in:
- `VITE_SUPABASE_URL` — from Project Settings → API → "Project URL".
- `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API → "service_role" secret. Treat this like a root database password — never share it, never commit it.

- [ ] **Step 4: Run the seed script**

```bash
node --env-file=.env scripts/seed-guild-admin.ts
```

Expected output ending in:
```
Created auth user <uuid> for boblelle77@gmail.com
profiles row set: is_guild_admin = true for boblelle77@gmail.com
```

- [ ] **Step 5: Verify**

```bash
npx supabase db execute --sql "select u.email, p.is_guild_admin from profiles p join auth.users u on u.id = p.id;"
```

Expected:
```
        email         | is_guild_admin
-----------------------+----------------
 boblelle77@gmail.com  | t
```

- [ ] **Step 6: Re-run the script to confirm it's idempotent**

```bash
node --env-file=.env scripts/seed-guild-admin.ts
```

Expected: `Auth user already exists: <same uuid>` followed by the same `profiles row set` line, with no error — this can be safely re-run if it's ever needed again (e.g. after a database reset in a non-production project).

- [ ] **Step 7: Commit**

```bash
git add scripts/seed-guild-admin.ts package.json package-lock.json
git commit -m "feat: seed the first Guild admin account"
```

---

### Task 12: Full-schema smoke test

This task has no new SQL — it's a final pass confirming every RLS boundary from the "Row level security" spec section actually holds, run once against the fully-migrated database. Do this before calling the phase done.

**Files:** none created or modified.

- [ ] **Step 1: Confirm anonymous access is exactly as scoped**

```bash
npx supabase db execute --sql "
set role anon;
select count(*) from members; -- expect 0 (no published rows exist yet)
"
```

- [ ] **Step 2: Confirm anonymous writes are rejected everywhere**

```bash
npx supabase db execute --sql "
set role anon;
insert into members (slug, member_type, business_name, city) values ('smoke-test', 'producer', 'Smoke Test', 'Riverside');
"
```

Expected: fails with a row-level security policy violation (`new row violates row-level security policy for table "members"`), not a generic permission error — confirming the anon role has no insert policy at all on `members`.

- [ ] **Step 3: Confirm the service role bypasses RLS (as the creator-upload route and seed script depend on)**

```bash
npx supabase db execute --sql "
set role service_role;
insert into members (slug, member_type, business_name, city) values ('smoke-test', 'producer', 'Smoke Test', 'Riverside');
select slug, status from members where slug = 'smoke-test';
delete from members where slug = 'smoke-test';
"
```

Expected: insert and select both succeed under `service_role` with no policy applied.

- [ ] **Step 4: Confirm every table has RLS enabled**

```bash
npx supabase db execute --sql "
select relname from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and not relrowsecurity;
"
```

Expected: zero rows. If anything is listed, RLS was not enabled on that table — go back and fix it before proceeding.

- [ ] **Step 5: Confirm the Guild admin exists and is queryable via the helper function under an admin-like session**

There's no real Supabase Auth session available from the CLI's `db execute`, so this step confirms the underlying data directly instead:

```bash
npx supabase db execute --sql "
select u.email, p.is_guild_admin
from profiles p
join auth.users u on u.id = p.id
where p.is_guild_admin = true;
"
```

Expected: exactly one row, `boblelle77@gmail.com`, `is_guild_admin = t`.

No commit for this task — it's a verification pass, not a code change. If any step doesn't match its expected output, stop and fix the migration that's responsible before moving to the next plan.
