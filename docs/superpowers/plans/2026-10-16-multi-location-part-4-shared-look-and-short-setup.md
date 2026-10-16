# Multi-location Businesses, Part 4: Shared Look and Short Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a one-manager business, the logo, cover, link-preview image and theme are one shared look: a change on any location saves to every location, only the business manager (or a Guild admin) can change it, and publishing pushes it to every live location. Each location after the first gets a short setup that skips Welcome, Type and Theme, shows the shared logo and cover read-only, and starts pre-filled from the first location. "One manager" opens up to every Guild admin.

**Architecture:** The database enforces everything. New migrations redefine `save_member_draft_section`, `_draft_assert_own_asset`, `publish_member_draft` and `confirm_member_type` to know about one-manager businesses, add `prefill_location_setup`, and teach `set_business_mode` / `set_member_business` to copy the look. The look stays on each location's own row (spec approach A), so public pages don't change. The app adds a `sharedLook` description to the portal, setup and /admin shells; the look editors read it to label or lock themselves; the wizard's step list gains a short variant.

**Tech Stack:** Supabase Postgres + pgTAP (`npm run test:db`), TanStack Start, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md` — Database functions 1–5 and 8, Screens → Setup, Shared look read-only, Error handling. Rollout step 4. Parts 1–3 are on staging.

**Look and layout:** BZ3 `docs/design/artboards/BizShortSetup.dc.html` (short setup: logo and cover filled, read-only, pill "Shared by all 4 locations", line "Change them from any location's Logo, Photos & Cover page; every location updates."; finish screen "Irvine is live" with **Set up Riverside next**) and BZ5 `docs/design/artboards/BizLookReadOnly.dc.html` (theme read-only for a location manager with the note "Shared by all Hangar 24 locations. [MANAGER EMAIL] manages this.").

## Global Constraints

- Shared look fields, exactly: in the `basics` draft section `logo_asset_id`, `logo_background`, `cover_asset_id`, `cover_crop`, `og_image_asset_id`; in the `theme` section `theme`. Nothing else is shared (links, phone, tagline, categories are only **pre-filled** in short setup).
- Only the business manager (`businesses.manager_user_id = auth.uid()`) or a Guild admin may change the shared look in a `one_manager` business; the database refuses others with SQLSTATE 42501 and the message `The logo, cover and theme are shared by all <business> locations. <manager email> manages them.` Separate businesses and single locations work exactly as today.
- A shared-look save updates every location's draft in the same transaction; publishing a location copies only the look fields to the other **published** locations of its business and never publishes their other draft changes or changes their `status`.
- A photo still used by any location is never deleted.
- Each SQL function keeps today's behavior for members outside a one-manager business — byte-for-byte where possible: copy the current definition from the migration named in each task, then add the business branch.
- Staging and production share one database: migrations only with the owner's yes, `npm run build` before every push, production waits for the owner's "go" and a Member Guide update (Part 6 adds the guide page; this part's changes must be listed for it).
- US English; touch targets ≥ 44px.

### Rulings this plan makes within the spec

1. **"One manager" and the business Invite open to every Guild admin** (the super-admin gate from Part 2 lifts), and the business-invite email gets back its sentence "You'll set up the logo, cover and theme once for every location, then each location's own details."
2. **Look source when a business becomes one-manager:** the location whose setup finished first, else the oldest location. `set_business_mode` takes an optional `p_look_source` so Part 5's dialog can pass the admin's pick.
3. **A location joining a one-manager business** (Part of, Add member) takes the business's current look and, if the business's type is confirmed, its type confirmation.
4. **Short setup** = a location in a one-manager business when another location of it has `setup_completed_at`. Its steps: basics, logo-cover (logo and cover read-only; gallery is its own), hours, events, links, discount (Affiliate), then the finish screens. In the portal and /admin, the manager edits the look normally with a "Shared by all N locations" label.
5. **Pre-fill** runs once, when a short setup's shell first loads, and only if the location's draft has no tagline, phone or member-since and no links yet: it copies tagline, phone, member since, links and (Mobile) "What you offer" categories from the first set-up location.

## Review Focus

1. **A location manager (or editor) uploading a new logo** must be refused before a file is stored, not after (an orphaned upload otherwise). Covered in Task 4 (pre-check in `uploadMemberLogo`).
2. **Publishing location A while location B has unpublished non-look edits** must publish only B's look, leaving B's other edits in its draft and B's "Unpublished changes" state intact. Covered in Task 2 (pgTAP).
3. **Deleting a gallery photo that another location uses as its logo or cover** must be refused with the existing "in use" message. Covered in Task 4.
4. **A location with no draft yet** (never opened) must still receive a shared-look save (its draft is created). Covered in Task 1 (pgTAP).
5. **Two browser tabs: the manager changes the theme on location A while editing location B's basics** — B's next save must not overwrite the shared theme (saves are key merges per section; theme lives in its own section). Covered in Task 1 (pgTAP: a basics save on B after a theme change on A keeps the theme on B).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261017100000_shared_look_save.sql` (new) | helpers, `_draft_assert_own_asset`, `save_member_draft_section` |
| `supabase/migrations/20261017110000_shared_look_publish.sql` (new) | `publish_member_draft`, `confirm_member_type`, `set_business_mode`, `set_member_business`, `link_business_manager` gate |
| `supabase/migrations/20261017120000_prefill_location_setup.sql` (new) | `prefill_location_setup` |
| `supabase/tests/shared_look.test.sql`, `supabase/tests/prefill_location_setup.test.sql` (new); `supabase/tests/business_functions.test.sql` (modify for the lifted gate) | pgTAP |
| `src/lib/portal/shared-look.ts` (new) + `.test.ts` | `SharedLook` type, `loadSharedLook()`, `sharedLookNote()` |
| `src/lib/portal/portal-shell.server.ts`, `portal-setup.server.ts`, `src/lib/auth/require-member-session.server.ts`, `src/routes/admin.tsx`, `src/routes/portal._sections.tsx`, `src/routes/portal.setup.tsx`, `src/components/admin/MemberEditingContext.tsx` (modify) | carry `sharedLook` (+ `shortSetup` for setup) |
| `src/lib/media/logo.server.ts`, `src/lib/media/media-gallery.server.ts` (modify) | upload pre-check; sibling usage on delete |
| `src/components/admin/SharedLookNote.tsx` (new) + `.test.ts`; `LogoUploader.tsx`, `CoverEditor.tsx`, `SocialImageEditor.tsx`, `ThemePicker.tsx` (modify) | shared label / read-only |
| `src/lib/portal/wizard-steps.ts` (+ test), setup step components, `FinishSteps.tsx` (modify) | short setup steps; "Set up [city] next" |
| `src/lib/guild/businesses.server.ts`, `src/components/guild/BusinessRow.tsx` (+ test), `src/lib/email/build-email-content.ts` (+ test) (modify) | lift the gate |
| `docs/member-profiles.md` (modify) | document |

---

### Task 1: Shared-look saves (database)

**Files:**
- Create: `supabase/migrations/20261017100000_shared_look_save.sql`
- Create: `supabase/tests/shared_look.test.sql`

**Interfaces:**
- Produces (all `set search_path = public`):
  - `_shared_look_keys(p_section text) returns text[]` — `{logo_asset_id,logo_background,cover_asset_id,cover_crop,og_image_asset_id}` for basics, `{theme}` for theme, `{}` otherwise. `immutable`.
  - `_one_manager_business_id(p_member_id uuid) returns uuid` — the member's business id when that business is `one_manager`, else null. `stable security definer`.
  - `_can_change_shared_look(p_member_id uuid) returns boolean` — true when the member isn't in a one-manager business, or `is_guild_admin()`, or `auth.uid()` is the manager. `stable security definer`.
  - `_shared_look_refusal(p_member_id uuid) returns text` — the refusal message text from Global Constraints (business name, manager's email from `auth.users`, "the Guild" if none). `stable security definer`.
  - `_draft_assert_own_asset(...)` — same signature; also accepts an asset owned by another location of the same one-manager business.
  - `save_member_draft_section(...)` — same signature; shared-look branch.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/shared_look.test.sql` following `supabase/tests/business_functions.test.sql`'s style (`begin; \ir _fixtures.psql`, `_tap` table, `plan(N)`, `finish()`, `rollback`). Fixture setup inside the test (as superuser, before any `set local role`):
- three members `PgTap Look` in Redlands / Riverside / Irvine (ids `f1000000-0000-4000-8000-0000000000d1..d3`, status `draft`), grouped into one business (insert them with the same name — the name trigger groups them), then `update public.businesses set management_mode = 'one_manager', manager_user_id = 'f0000000-0000-4000-8000-000000000006' where id = (select business_id from members where id = '…d1')`;
- `member_users`: f0..06 owner of d1 and d2; f0..05 owner of d3 (a location manager, i.e. not the business manager); f0..02 editor of d1;
- an approved media asset `f2000000-0000-4000-8000-0000000000e1` owned by d1 (copy the insert columns from `_fixtures.psql`'s assets).

Assertions (one `insert into _tap … select …` each):
1. As the manager (jwt sub f0..06): `save_member_draft_section(d1, 'theme', '{"theme":"<a valid theme name from _validate_draft_section>"}')` succeeds (`lives_ok`).
2. d2's and d3's draft `data #>> '{theme,theme}'` equal that theme name (d3 had no draft before — Review Focus 4).
3. d2's and d3's `dirty_sections` contain `theme`.
4. As the manager: `save_member_draft_section(d2, 'basics', '{"logo_asset_id":"…e1"}')` succeeds — an asset owned by d1 is accepted on d2.
5. d1 and d3 drafts have `basics.logo_asset_id = …e1`.
6. As f0..05 (owner of d3, not the manager): `save_member_draft_section(d3, 'theme', …)` throws `42501` (`throws_ok`).
7. The same call's error message contains `shared by all PgTap Look locations` (`throws_like` or catch the message).
8. As f0..05: `save_member_draft_section(d3, 'basics', '{"tagline":"Own words"}')` succeeds (non-look key).
9. That tagline is only on d3's draft (d1's draft tagline is unchanged).
10. As f0..05: a basics save mixing `tagline` and `logo_background` throws 42501 and saves nothing (d3's draft tagline still "Own words").
11. As f0..02 (editor of d1, not the manager): theme save on d1 throws 42501.
12. As the Guild admin f0..04: theme save on d3 succeeds and reaches d1.
13. Review Focus 5: after (12), as the manager save `basics {"tagline":"x"}` on d2; d2's draft theme is still the admin's theme.
14. A member outside any business (fixture m2, owner f0..05): theme save as f0..05 still succeeds (today's behavior).
15. An asset owned by fixture m2 (b1) on d1's basics is refused (existing ownership rule still holds across unrelated members).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- --no-pending supabase/tests/shared_look.test.sql`
Expected: FAIL (assertion 2 and later: siblings don't receive the look; 4 refused by the ownership rule).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261017100000_shared_look_save.sql`:

```sql
-- Multi-location businesses, part 4 (spec 2026-10-15): the shared look.
-- In a one-manager business the logo, cover, link-preview image and theme
-- are the business's: a save on any location reaches every location's
-- draft in the same transaction, and only the business manager or a Guild
-- admin may change them. Members outside a one-manager business behave
-- exactly as before.

create or replace function public._shared_look_keys(p_section text)
returns text[]
language sql
immutable
as $$
  select case p_section
    when 'basics' then array['logo_asset_id', 'logo_background', 'cover_asset_id', 'cover_crop', 'og_image_asset_id']
    when 'theme' then array['theme']
    else array[]::text[]
  end;
$$;

create or replace function public._one_manager_business_id(p_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.members m
  join public.businesses b on b.id = m.business_id
  where m.id = p_member_id and b.management_mode = 'one_manager';
$$;

create or replace function public._can_change_shared_look(p_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business uuid := public._one_manager_business_id(p_member_id);
begin
  if v_business is null then
    return true;
  end if;
  return public.is_guild_admin()
    or exists (select 1 from public.businesses where id = v_business and manager_user_id = auth.uid());
end;
$$;

create or replace function public._shared_look_refusal(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format(
    'The logo, cover and theme are shared by all %s locations. %s manages them.',
    b.name,
    coalesce((select u.email from auth.users u where u.id = b.manager_user_id), 'The Guild')
  )
  from public.businesses b
  where b.id = public._one_manager_business_id(p_member_id);
$$;

revoke all on function public._shared_look_keys(text) from public, anon, authenticated;
revoke all on function public._one_manager_business_id(uuid) from public, anon, authenticated;
revoke all on function public._can_change_shared_look(uuid) from public, anon, authenticated;
revoke all on function public._shared_look_refusal(uuid) from public, anon, authenticated;
```

Then **`_draft_assert_own_asset`**: copy its current definition from `supabase/migrations/20260925200700_member_draft_internals.sql` (lines ~363-381) verbatim, and change only the ownership condition from `member_id = p_member_id` to:

```sql
        and (
          a.member_id = p_member_id
          or (
            public._one_manager_business_id(p_member_id) is not null
            and a.member_id in (
              select m.id from public.members m
              where m.business_id = public._one_manager_business_id(p_member_id)
            )
          )
        )
```

(alias the table `a` if the original doesn't). Keep its error message.

Then **`save_member_draft_section`**: copy its current definition from `supabase/migrations/20260925200800_member_draft_functions.sql` (lines ~40-83) verbatim, then:
- declare `v_look jsonb; v_business uuid; v_sibling uuid;`
- right after the `p_data` object check and **before** any write, add:

```sql
  -- Shared look: the look keys in this save (none outside basics/theme).
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_look
  from jsonb_each(p_data)
  where key = any (public._shared_look_keys(p_section));
  v_business := public._one_manager_business_id(p_member_id);
  if v_business is not null and v_look <> '{}'::jsonb and not public._can_change_shared_look(p_member_id) then
    raise exception '%', public._shared_look_refusal(p_member_id) using errcode = '42501';
  end if;
```

- after this location's own draft is written (and before the audit call / return), add:

```sql
  -- ...and every other location of the business gets the same look.
  if v_business is not null and v_look <> '{}'::jsonb then
    for v_sibling in
      select id from public.members where business_id = v_business and id <> p_member_id
    loop
      perform public._draft_ensure(v_sibling);
      update public.member_drafts d
      set data = d.data || jsonb_build_object(p_section, coalesce(d.data -> p_section, '{}'::jsonb) || v_look),
          dirty_sections = (
            select array_agg(s order by array_position(array['basics','media','links','discount','theme'], s))
            from (select distinct unnest(d.dirty_sections || array[p_section]) as s) x
          ),
          updated_by_user_id = auth.uid()
      where d.member_id = v_sibling;
    end loop;
  end if;
```

Match the dirty-sections ordering expression to whatever the copied function uses for its own row (reuse it exactly; the array above is the canonical order from `src/lib/drafts/sections.ts` `DRAFT_SECTIONS`). Keep the function's return value (this location's draft row).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- supabase/tests/shared_look.test.sql` — PASS. Then `npm run test:db` (all files) — PASS (existing drafts tests prove nothing changed outside businesses).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261017100000_shared_look_save.sql supabase/tests/shared_look.test.sql
git commit -m "feat(db): shared look saves reach every location of a one-manager business"
```

---

### Task 2: Publish, type, mode and joining carry the look (database)

**Files:**
- Create: `supabase/migrations/20261017110000_shared_look_publish.sql`
- Modify: `supabase/tests/shared_look.test.sql` (append), `supabase/tests/business_functions.test.sql` (lifted gate)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces:
  - `publish_member_draft` — same signature; accepts sibling-owned look assets; after publishing `basics`/`theme`, copies the look columns to the business's other `published` locations and cleans their drafts.
  - `confirm_member_type` — same signature; also confirms the type on the business's unconfirmed locations.
  - `set_business_mode(p_business_id uuid, p_mode text, p_look_source uuid default null)` — **replaces** the two-argument version (drop it first); Guild admin (no longer super admin) for one_manager; copies the look when switching to one_manager.
  - `link_business_manager` — Guild admin (no longer super admin).
  - `set_member_business` — same signature; a location joining a one-manager business takes its look and type confirmation.
  - `_copy_shared_look(p_from uuid, p_to uuid) returns void` (internal): copies the five live look columns and `theme` from one member to another, and the same keys into the target's draft (`_draft_ensure` first), without marking the draft dirty.

- [ ] **Step 1: Append failing pgTAP assertions**

Append to `supabase/tests/shared_look.test.sql` (bump `plan`), reusing Task 1's fixtures:
1. Make d1 and d2 `published` (superuser `update members set status='published'`), approve asset e1 (`review_status='approved'`). As the manager, save basics `{"logo_asset_id":"…e1"}` on d1 and basics `{"tagline":"B only"}` on d2 (d2 now has a non-look edit). As the manager, `publish_member_draft(d1, array['basics','theme'], true)` succeeds.
2. d2's **live** `logo_asset_id` = e1 and live `theme` = d1's theme.
3. d2's live `tagline` is NOT "B only" (Review Focus 2) and d2's `status` is still `published`.
4. d2's draft still has `basics.tagline = 'B only'` and `basics` is still in d2's `dirty_sections`.
5. d3 (draft, not published) live `logo_asset_id` is unchanged (null) — only published siblings get live copies.
6. `confirm_member_type`: for a fresh three-location one-manager business (new ids …f1..f3, none confirmed), as its manager confirm f1's type as `producer`; f2 and f3 have `type_confirmed_at` not null and `member_type = 'producer'`.
7. `set_business_mode`: a fresh separate two-location business (…g1 with live `theme` 'X-valid-theme-1', `logo_background` 'dark'; …g2 with a different theme), nobody linked; as the **Guild admin** (f0..04, not super admin) `set_business_mode(b, 'one_manager')` succeeds (gate lifted) and g2's live theme and draft theme equal g1's (g1 is the look source: oldest, or first set-up if you set `setup_completed_at` on g1).
8. `set_business_mode(b, 'one_manager', g2)` on another fresh pair copies from g2 instead.
9. `set_member_business`: a single member …h1 with its own theme joins the one-manager business from (7); its live and draft theme equal the business's look, and if g1's type was confirmed, h1's `type_confirmed_at` is set.

In `supabase/tests/business_functions.test.sql`, change the assertions that expect a plain Guild admin to be refused for `one_manager` / `link_business_manager` to expect success, and keep a refusal assertion for a non-admin member (42501).

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:db -- --no-pending supabase/tests/shared_look.test.sql supabase/tests/business_functions.test.sql`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261017110000_shared_look_publish.sql`:

1. `_copy_shared_look(p_from uuid, p_to uuid)` (security definer, revoked from public/anon/authenticated):

```sql
create or replace function public._copy_shared_look(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.members;
begin
  select * into v_src from public.members where id = p_from;
  update public.members
  set logo_asset_id = v_src.logo_asset_id,
      logo_background = v_src.logo_background,
      cover_asset_id = v_src.cover_asset_id,
      cover_crop = v_src.cover_crop,
      og_image_asset_id = v_src.og_image_asset_id,
      theme = v_src.theme
  where id = p_to;

  perform public._draft_ensure(p_to);
  update public.member_drafts d
  set data = d.data
    || jsonb_build_object('basics', coalesce(d.data -> 'basics', '{}'::jsonb) || jsonb_build_object(
         'logo_asset_id', v_src.logo_asset_id,
         'logo_background', v_src.logo_background,
         'cover_asset_id', v_src.cover_asset_id,
         'cover_crop', v_src.cover_crop,
         'og_image_asset_id', v_src.og_image_asset_id))
    || jsonb_build_object('theme', coalesce(d.data -> 'theme', '{}'::jsonb) || jsonb_build_object('theme', v_src.theme))
  where d.member_id = p_to;
end;
$$;
revoke all on function public._copy_shared_look(uuid, uuid) from public, anon, authenticated;
```

Check `cover_crop`'s column type: if it's `jsonb`, `jsonb_build_object` stores it as-is; if it's text/other, store it the way `_draft_section_from_live` does (copy that expression). Same for `logo_background`.

2. **`publish_member_draft`**: copy the current definition from `supabase/migrations/20261001100000_publish_names_empty_links.sql` verbatim. Changes:
   - In the photo check (around its lines 71-88 — "every referenced photo is in this member's gallery and approved"), for the look asset ids (logo, cover, og image) accept an asset owned by any location of `_one_manager_business_id(p_member_id)`; keep the approval requirement and keep carousel/slide photos to this member only.
   - After the basics write and after the theme write (and before status/published_at), add:

```sql
  -- Shared look: the business's other live locations show the same look.
  if public._one_manager_business_id(p_member_id) is not null
     and (p_sections && array['basics', 'theme']) then
    for v_sibling in
      select id from public.members
      where business_id = public._one_manager_business_id(p_member_id)
        and id <> p_member_id
        and status = 'published'
    loop
      if 'basics' = any (p_sections) then
        update public.members s
        set logo_asset_id = m.logo_asset_id, logo_background = m.logo_background,
            cover_asset_id = m.cover_asset_id, cover_crop = m.cover_crop,
            og_image_asset_id = m.og_image_asset_id
        from public.members m
        where m.id = p_member_id and s.id = v_sibling;
      end if;
      if 'theme' = any (p_sections) then
        update public.members s set theme = m.theme from public.members m
        where m.id = p_member_id and s.id = v_sibling;
      end if;
      -- Their drafts already hold this look (shared saves); a section that
      -- now matches live is no longer unpublished.
      update public.member_drafts d
      set dirty_sections = array(
        select s from unnest(d.dirty_sections) s
        where not (
          s = any (p_sections) and s in ('basics', 'theme')
          and (d.data -> s) = public._draft_section_from_live(v_sibling, s)
        )
      )
      where d.member_id = v_sibling;
    end loop;
  end if;
```

   Declare `v_sibling uuid`. Use `_draft_section_from_live`'s real signature (check it in `20260925200700_member_draft_internals.sql`); if it returns the whole draft rather than a section, compare the right key.

3. **`confirm_member_type`**: copy from `supabase/migrations/20260925200900_member_setup_functions.sql` (lines ~26-71). Inside the same `app.member_fn = 'on'` window, after this member's update:

```sql
  if public._one_manager_business_id(p_member_id) is not null then
    update public.members
    set member_type = p_new_type, type_confirmed_at = now(), type_confirmed_by_user_id = auth.uid()
    where business_id = public._one_manager_business_id(p_member_id)
      and id <> p_member_id
      and type_confirmed_at is null;
  end if;
```

4. **`set_business_mode`**: `drop function public.set_business_mode(uuid, text);` then recreate from `supabase/migrations/20261016100000_business_functions.sql`'s version with the extra parameter `p_look_source uuid default null`, the one_manager check changed from super admin to `_require_guild_admin()` (keep the existing "nobody linked yet" refusal — full switching is Part 5), and after the mode update when `p_mode = 'one_manager'`:

```sql
    v_source := coalesce(
      (select id from public.members where id = p_look_source and business_id = p_business_id),
      (select id from public.members where business_id = p_business_id and setup_completed_at is not null order by setup_completed_at limit 1),
      (select id from public.members where business_id = p_business_id order by created_at limit 1)
    );
    for v_member in select id from public.members where business_id = p_business_id and id <> v_source loop
      perform public._copy_shared_look(v_source, v_member);
    end loop;
```

   Re-grant execute to `authenticated` with the new signature; revoke from public/anon.

5. **`link_business_manager`**: recreate from `20261016100000` with the super-admin check replaced by `_require_guild_admin()`.

6. **`set_member_business`**: recreate from `20261016100000` and, in the "joining a one-manager business" branch (before linking the manager), add:

```sql
      v_source := (
        select id from public.members
        where business_id = v_target_business and id <> p_member_id
        order by (status = 'published') desc, setup_completed_at nulls last, created_at
        limit 1
      );
      if v_source is not null then
        perform public._copy_shared_look(v_source, p_member_id);
        perform set_config('app.member_fn', 'on', true);
        update public.members m
        set member_type = s.member_type, type_confirmed_at = now(), type_confirmed_by_user_id = auth.uid()
        from public.members s
        where m.id = p_member_id and s.id = v_source
          and s.type_confirmed_at is not null and m.type_confirmed_at is null;
        perform set_config('app.member_fn', 'off', true);
      end if;
```

   (Match how `confirm_member_type` sets and clears `app.member_fn`.)

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test:db -- supabase/tests/shared_look.test.sql supabase/tests/business_functions.test.sql`, then `npm run test:db` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261017110000_shared_look_publish.sql supabase/tests
git commit -m "feat(db): publishing, type, mode and Part of carry the shared look; One manager for every Guild admin"
```

---

### Task 3: Pre-fill a short setup (database)

**Files:**
- Create: `supabase/migrations/20261017120000_prefill_location_setup.sql`, `supabase/tests/prefill_location_setup.test.sql`

**Interfaces:**
- Produces: `prefill_location_setup(p_member_id uuid) returns boolean` (security definer, execute to `authenticated`): true when it copied, false when it did nothing.

Rules: caller must be `is_member_full_editor(p_member_id)` or a Guild admin (else 42501); the member must be in a one-manager business with another location whose `setup_completed_at` is set (source = the earliest such); and this member's draft (create with `_draft_ensure`) must have no `basics.tagline`, `basics.phone`, `basics.member_since_year` and an empty `links.links` — otherwise return false. Copy from the source's **draft** (falling back to live via `_draft_section_from_live` when the source has no draft): `basics.tagline`, `basics.phone`, `basics.member_since_year` (merged into this draft's basics), the whole `links` section, and — when the member type is `mobile` — `discount.category_ids`. Mark `basics`, `links` (and `discount` when copied) dirty. Audit with `_draft_audit_if_guild_admin`.

- [ ] **Step 1: Write the failing test** — fixtures: a one-manager business with p1 (setup complete; draft basics tagline "Since 2010", phone "909-555-0100", member_since_year 2010, links one website link) and p2 (fresh). Assertions: (1) as the manager `prefill_location_setup(p2)` returns true; (2) p2's draft has those three basics values and the link; (3) a second call returns false and changes nothing; (4) p2 with a tagline already set → false; (5) a member outside any business → false; (6) a non-editor (f0..06 not linked to p2's member … use another user) → 42501; (7) for a mobile pair, `discount.category_ids` is copied.
- [ ] **Step 2: Run** `npm run test:db -- --no-pending supabase/tests/prefill_location_setup.test.sql` — FAIL (function missing).
- [ ] **Step 3: Write the function** per the rules above (read `_validate_draft_section` for the exact key names and the links/discount section shapes; validate the merged sections with `_validate_draft_section` before writing).
- [ ] **Step 4: Run** the file and the full `npm run test:db` — PASS.
- [ ] **Step 5: Commit** `feat(db): prefill_location_setup copies the first location's basics and links once`.

---

### Task 4: The app knows the shared look; uploads and deletes respect it; the gate lifts

**Files:**
- Create: `src/lib/portal/shared-look.ts`, `src/lib/portal/shared-look.test.ts`
- Modify: `src/lib/portal/portal-shell.server.ts`, `src/lib/portal/portal-setup.server.ts`, `src/lib/auth/require-member-session.server.ts`, `src/routes/admin.tsx`, `src/routes/portal._sections.tsx`, `src/routes/portal.setup.tsx`, `src/components/admin/MemberEditingContext.tsx`
- Modify: `src/lib/media/logo.server.ts`, `src/lib/media/media-gallery.server.ts` (+ `src/lib/media/asset-usage.ts` if the usage helper needs sibling data)
- Modify: `src/lib/guild/businesses.server.ts`, `src/components/guild/BusinessRow.tsx` (+ test), `src/lib/email/build-email-content.ts` (+ test)

**Interfaces:**
- Produces:

```ts
// shared-look.ts
export type SharedLook = {
  businessName: string;
  locationCount: number;
  canChange: boolean;      // manager or Guild admin
  managerLabel: string;    // manager's email, or "The Guild"
};
/** null unless the member is in a one-manager business. */
export async function loadSharedLook(
  service: SupabaseClient,
  memberId: string,
  viewer: { userId: string; isGuildAdmin: boolean },
): Promise<SharedLook | null>;
/** "Shared by all 4 locations" (manager) or "Shared by all Hangar 24 locations. boss@x.com manages this." (others). */
export function sharedLookNote(look: SharedLook): string;
```

  - `MemberEditingValue` gains `sharedLook?: SharedLook | null`; the setup shell also gains `shortSetup: boolean`.

- [ ] **Step 1: Failing tests** in `shared-look.test.ts`: `sharedLookNote` for a manager (`canChange: true`) → `"Shared by all 4 locations"`; for others → `"Shared by all Hangar 24 Brewing Co. locations. boss@x.com manages this."`; `loadSharedLook` with a fake client returns null for a separate business and for no business, and `canChange` true for the manager id and for `isGuildAdmin`, false otherwise (fake the `members → businesses` select and `auth.admin.getUserById` like `src/lib/email/resolve-recipient.server.test.ts` fakes its client).
- [ ] **Step 2: Run** `npx vitest run src/lib/portal/shared-look.test.ts` — FAIL.
- [ ] **Step 3: Implement** `shared-look.ts` (plain module, not `.server`): one select `members.select("business_id, businesses(name, management_mode, manager_user_id)")` for the member, a count of `members` with that `business_id`, and `getUserById` for the manager email. Run the test — PASS.
- [ ] **Step 4: Carry it**
  - `portal-shell.server.ts` (`getPortalShell`) and `portal-setup.server.ts` (`getPortalSetupShell`): add `sharedLook: await loadSharedLook(service, member.memberId, { userId: member.userId, isGuildAdmin: member.isImpersonating })` (in the portal a Guild admin is always editing as the member, so impersonating ⇒ Guild admin; otherwise the viewer is a member). Setup shell also adds `shortSetup`: true when `sharedLook` is non-null and another location of the business has `setup_completed_at` (one count query), and when `shortSetup && !setupCompleted`, call `supabase.rpc("prefill_location_setup", { p_member_id })` **before** loading the draft status so the first screen shows the copied values (errors logged, not thrown).
  - `require-member-session.server.ts`: return `sharedLook` (computed with the memberships/service client it already has; for impersonation `isGuildAdmin: true`). `admin.tsx` puts it in the editing value.
  - `portal._sections.tsx`, `portal.setup.tsx`, `admin.tsx`: set `sharedLook` (and setup's `shortSetup` on the setup route's context) in their `MemberEditingValue`.
- [ ] **Step 5: Uploads and deletes**
  - `logo.server.ts` `uploadMemberLogo`: before storing the file, `rpc("_can_change_shared_look")` isn't callable (revoked) — instead compute with `loadSharedLook` (session user + Guild-admin flag) and throw the same message the database uses (`sharedLookNote`-style: "The logo, cover and theme are shared by all <business> locations. <manager> manages them.") when `canChange` is false. The database still refuses on its own; this only prevents an orphaned upload (Review Focus 1). Add a unit test of the pure decision if you extract one.
  - `media-gallery.server.ts` delete: when the asset's member is in a one-manager business, also load the other locations' live look columns and drafts and pass them to the usage check, so a photo used by any location is refused (Review Focus 3). Extend `asset-usage.ts`'s `findAssetUsages` input to accept a list of `{ live, draftData }` if needed, with a test.
- [ ] **Step 6: Lift the gate**
  - `businesses.server.ts`: `setBusinessMode` (one_manager) and `inviteBusinessManager` require a Guild admin, not the super admin; `setBusinessMode` passes `p_look_source: null`.
  - `BusinessRow.tsx`: remove the "Coming soon" disabled state; every Guild admin sees One manager and the business Invite. Update `BusinessRow.test.ts`.
  - `build-email-content.ts` `business_invited`: restore the sentence "You'll set up the logo, cover and theme once for every location, then each location's own details." before "Questions? Just reply to this email."; update the test.
- [ ] **Step 7: Checks and commit** — `npm test`, `npx tsc --noEmit` (survey only), `npm run build`; commit `feat(portal): shells know the shared look; uploads and deletes respect it; One manager for every Guild admin`.

---

### Task 5: Look editors show "shared" or lock

**Files:**
- Create: `src/components/admin/SharedLookNote.tsx`, `src/components/admin/SharedLookNote.test.ts`
- Modify: `src/components/admin/LogoUploader.tsx`, `CoverEditor.tsx`, `SocialImageEditor.tsx`, `ThemePicker.tsx`

**Interfaces:**
- Consumes: `useMemberEditing()` (existing hook in `MemberEditingContext.tsx`) → `sharedLook`; `sharedLookNote` (Task 4).
- Produces: `SharedLookNote({ look, readOnlyInSetup }: { look: SharedLook; readOnlyInSetup?: boolean })`; each look editor takes an optional `readOnly?: boolean` prop.

Behavior (BZ3, BZ5):
- `sharedLook` null → editors unchanged.
- `sharedLook.canChange` and not `readOnly` → editors work as today, with a small pill above them: "Shared by all N locations".
- `!canChange`, or `readOnly` → show the current value (logo/cover image, link-preview image, theme swatches with the current one marked) with every control disabled/hidden (no upload, crop, remove, background switch or theme pick), and an info box in the design language (`#EFEAE1`, ⓘ icon): for `!canChange` the BZ5 text from `sharedLookNote`; for the manager in short setup (`readOnly` with `canChange`) BZ3's line "Change them from any location's Logo, Photos & Cover page; every location updates." under the "Shared by all N locations" pill.

- [ ] **Step 1: Failing test** `SharedLookNote.test.ts`: renders the pill text for a manager; renders the BZ5 sentence for a non-manager; renders the BZ3 line when `readOnlyInSetup`.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement `SharedLookNote`. **Step 4:** wire the four editors: read `sharedLook` from context, compute `locked = readOnly || (sharedLook && !sharedLook.canChange)`, render `SharedLookNote` and disable controls when locked; add a render test per editor for the locked state where the editor is renderable with `renderToStaticMarkup` (follow existing tests in `src/components/admin/*.test.ts`; skip an editor whose dependencies make static rendering impractical and say so in the report).
- [ ] **Step 5: Checks and commit** — `npm test`, `npx tsc --noEmit`, `npm run build`; commit `feat(editors): logo, cover, link preview and theme show the shared look or lock`.

---

### Task 6: Short setup steps and "Set up [city] next"

**Files:**
- Modify: `src/lib/portal/wizard-steps.ts` (+ its test file), the setup routes/components that call `numberedStepsForType` / `allStepsForType` / `stepPosition` / `nextStep` / `previousStep` / `resolveSetupAccess` (grep them), the logo-cover step component (pass `readOnly` to logo and cover editors in short setup), `src/components/portal/setup/FinishSteps.tsx` (live screen)

**Interfaces:**
- Consumes: setup shell `shortSetup` (Task 4), `editing.locationSwitcher` (Part 3, already in the setup editing value), `choosePortalMember`.
- Produces: every step helper gains an optional last parameter `options: { shortSetup?: boolean } = {}`; `isStepForType(step, memberType, options)` returns false for `welcome`, `type` and `theme` when `shortSetup`.

- [ ] **Step 1: Failing tests** in the wizard-steps test file: with `{ shortSetup: true }`, a producer's numbered steps are `basics, logo-cover, hours, events, links` ("Step 1 of 5" for basics), an Affiliate's include `discount`, a Mobile member's skip `events`; `nextStep("links", "producer", { shortSetup: true })` is `review`; `previousStep("basics", …short)` is null; without options, today's results are unchanged.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement; thread `{ shortSetup: shell.shortSetup }` through every caller (the step route, `resolveSetupAccess`, WizardStep's progress line, the Review checklist). `resolveSetupAccess` in short setup must send a request for `welcome`/`type`/`theme` to `basics`.
- [ ] **Step 4: Logo-cover step** — in short setup, render the logo and cover editors with `readOnly` (gallery/carousel unchanged).
- [ ] **Step 5: Finish screen** — on the `live` screen, when `editing.locationSwitcher` lists a location other than this one whose status isn't `live`, show a primary button **Set up {city} next** (first such location in the switcher's order; label uses the location's `label`) that calls `choosePortalMember({ data: { memberId } })`, invalidates, and navigates to `/portal`; keep the existing button as the secondary **Back to the portal**. Add a render test of the button's presence/absence via a small pure helper `nextLocationToSetUp(switcher, currentMemberId)` in `location-groups.ts` (+ tests).
- [ ] **Step 6: Checks and commit** — `npm test`, `npx tsc --noEmit`, `npm run build`; commit `feat(setup): short setup for a business's other locations; Set up the next location`.

---

### Task 7: Docs, apply, staging

- [ ] **Step 1: Docs** — in `docs/member-profiles.md`: a "Shared look (Part 4, 17 October 2026)" paragraph (the shared fields, who can change them and the refusal text, save reaches every location, publish copies the look to live locations only, a photo used by any location can't be deleted, joining/switching copies the look, type confirmed once for the business), a "Short setup" paragraph (steps, read-only logo/cover, pre-fill rules, Set up [city] next), and "One manager is available to every Guild admin." Also list, under a "Member Guide to-do (Part 6)" line, what the guide must show: the switcher, the shared-look note, the short setup. Commit `docs: shared look and short setup`.
- [ ] **Step 2: Ask the owner before applying the three migrations** (plain words: "These change how saving and publishing work for one-manager businesses only; every other member works exactly as before. OK to apply?"), then `npx supabase migration list --linked` (only the three pending), `npx supabase db push --linked`, and `npm run test:db -- --no-pending` on the new test files.
- [ ] **Step 3: Build, push, confirm deploy** — `npm run build`, `git push origin staging`, confirm a new staging deployment after the push time.
- [ ] **Step 4: Owner's staging walk-through** (the Sample Brewing Co. one-manager pair from Part 3 testing): as the +chain manager, finish San Bernardino's look, check Corona received it; open Corona — short setup (5 steps, logo/cover read-only, tagline/phone pre-filled); publish both; change the theme on one in the portal and publish; both live pages match.
