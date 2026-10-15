# Multi-location Businesses, Part 1: Artboards and the Business Record — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the new multi-location screens for the owner's approval, and add the `businesses` record that ties a business's locations together, with the public Members page and profile "Next location" grouping by it instead of by matching names — no visible change for members or visitors.

**Architecture:** A new `businesses` table (mode `separate` / `one_manager`, optional manager) and a nullable `members.business_id`. A migration backfills one business per set of same-named members, and a `before insert` trigger keeps today's "same name groups together" behavior for newly created members until Part 2 gives the roster an explicit **Part of** choice. The pure directory shaping (`buildDirectoryMembers`) groups by `business_id ?? member id` and exposes that as each card's key.

**Tech Stack:** Supabase Postgres (migrations in `supabase/migrations/`, pgTAP tests in `supabase/tests/` run by `npm run test:db`), TanStack Start, TypeScript, Vitest (`npm test`). Design canvas: claude.ai Design artifact https://claude.ai/artifact/9YttpbrWTxgAkc145whpGf with a snapshot in `docs/design/`.

**Spec:** `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md` (read it first; this plan covers Rollout step 1 and the database/Members-page part of step 2). Later parts (roster screens and invite, location switcher, shared look and short setup, hand-off and mode switching, Member Guide) get their own plans after the owner approves the artboards.

## Global Constraints

- All visible text in US English ("color", "canceled") — owner's standing rule.
- Organization name in new copy: **ISC Brewers Guild** / **Inland Southern California Brewers Guild** (artboard headers still say "IE BREWERS GUILD"; match neighboring artboards there).
- Every business created by this plan starts with `management_mode = 'separate'` and `manager_user_id = null`. Nothing a member or visitor sees changes in Part 1.
- Staging and production share **one database**. `supabase db push` changes production's database; the owner must say yes before it runs (memory: db push needs owner's go-ahead). Migrations must be additive and safe for the code already live on `main`.
- Work on the `staging` branch; production only after the owner's "go".
- Design canvas edits: read the live canvas first, change only the files you mean to, publish with `url` + `root`, then copy the same files into `docs/design/artboards/` and update `docs/design/canvas.json` and `docs/design/README.md` (memory: wording changes go to canvas and snapshot).

## Review Focus

1. **Names with stray spaces** ("Hangar 24" and "Hangar 24 ") must land in one business, both in the backfill and in the insert trigger. Covered by pgTAP in Task 2.
2. **A member with no same-named sibling gets no business** (`business_id` stays null) and still shows as its own Members-page card. Covered in Task 2 (pgTAP) and Task 3 (Vitest).
3. **A visitor (anon) can read a business's `id` and `name` but not `manager_user_id`.** Covered in Task 2.
4. **A member (not a Guild admin) can't move their own location into another business** by updating `business_id`. Covered in Task 2 (the existing write lock refuses it; the test pins that).
5. **Two different businesses that happen to share a display name** must still be two cards with two distinct keys (hover/highlight on the map uses the key). Covered in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/design/artboards/BizRoster.dc.html` (new, + live canvas) | Guild roster: business row, Managed by, switch-mode boxes, Add member's Part of |
| `docs/design/artboards/BizSwitcher.dc.html` (new) | Location switcher on a computer (sidebar) and a phone (top bar) |
| `docs/design/artboards/BizShortSetup.dc.html` (new) | Short per-location setup: Logo, Photos & Cover with shared marks; "Set up Irvine next" |
| `docs/design/artboards/BizPeople.dc.html` (new) | People page: Business manager, Hand off this location, Take back |
| `docs/design/artboards/BizLookReadOnly.dc.html` (new) | Theme and logo/cover read-only for a location manager |
| `supabase/migrations/20261016100000_businesses.sql` (new) | `businesses` table, RLS, grants, `members.business_id`, backfill, insert trigger |
| `supabase/tests/businesses.test.sql` (new) | pgTAP for the above |
| `src/lib/supabase/types.ts` (modify) | `MemberRow.business_id`, `BusinessRow` |
| `src/lib/members/directory.ts` (modify) | Group by `business_id`; `DirectoryMember.groupKey` |
| `src/lib/members/directory.test.ts` (modify) | Grouping tests |
| `src/lib/members/members-v2.ts` (modify) | Card key = `groupKey` |
| `src/lib/members/members-v2.test.ts` (modify) | Key test |
| `src/lib/members/member-profile.server.ts` (modify) | "Next location" by `business_id` |
| `docs/member-profiles.md` (modify) | Document the business record |

---

### Task 1: Artboards for the new screens (owner approval gate)

**Files:**
- Create on the live canvas and in `docs/design/artboards/`: `BizRoster.dc.html`, `BizSwitcher.dc.html`, `BizShortSetup.dc.html`, `BizPeople.dc.html`, `BizLookReadOnly.dc.html`
- Modify: live canvas `project/canvas.json` and `docs/design/canvas.json` (five new boards plus a section title note), `docs/design/README.md` (artboard → code rows and a dated decision line)

**Interfaces:**
- Consumes: the spec's Screens section; the existing artboards' shell and design language (`docs/design/README.md`, "Design language").
- Produces: approved artboards that Parts 2–5 build against.

- [ ] **Step 1: Read the live canvas and the artboards to copy from**

Use the Artifact tool: `{action: "read", url: "https://claude.ai/artifact/9YttpbrWTxgAkc145whpGf"}` (clears the "not viewed latest" check), then `{action: "read", url, paths: ["project/canvas.json", "project/GuildMembers.dc.html", "project/AdminMedia.dc.html", "project/AdminTheme.dc.html", "project/AdminPhone.dc.html", "project/AdminBasics.dc.html"], out_dir: "<scratchpad>/canvas"}`. Follow the Design type's instructions that the read returns (skeleton, `support.js` head line, `$preview`, inline styles, real `<button>`/`<label>`).

- [ ] **Step 2: Write the five artboards**

Each one copies the shell of its nearest existing artboard (GuildMembers for the roster; AdminMedia/AdminTheme for member screens; AdminPhone for the phone switcher) and uses placeholder data in the spec's terms: business "Hangar 24", locations Redlands (Live), Riverside (Setting up), Irvine (Not started), Lake Havasu City (Live); manager "[MANAGER EMAIL]". Content per board, all copy in US English:

- **BizRoster** (1280×1300, Guild shell): a business row "Hangar 24 · 4 locations" with the four locations indented under it (city, status dot, Edit as them); a **Managed by** segmented control (*One manager* selected / *Each location separately*); one **Invite** button on the business row; a single-location member row below for contrast. Under the table, two dialogs drawn side by side: "Switch Hangar 24 to one manager" (radio list of existing owners' emails plus "Invite someone new" with an email field; "Keep the logo, cover and theme from:" location dropdown; **Switch**) and "Switch to each location separately" (text: "Each location keeps its current logo, cover, theme and owner. To give a location to someone new, the manager hands it off first."; **Switch**). Also the **Add member** dialog with a new **Part of** dropdown ("None — a single location", "Hangar 24", …).
- **BizSwitcher** (1280×900 desktop sidebar + a 390×700 phone panel, drawn side by side in one board 1760×900): sidebar top shows "Hangar 24 · Riverside ▾" opened as a menu listing the four locations by city with *Live* / *Setting up* / *Not started* pills; the phone shows the same name in the top bar and the menu as a bottom sheet.
- **BizShortSetup** (1280×1200): wizard chrome at step "Logo, Photos & Cover" for Irvine; the logo and cover show filled and read-only with a pill "Shared by all 4 locations" and the line "Change them from any location's Logo, Photos & Cover page; every location updates."; the gallery uploader is live. Beside it, the finish screen after a location goes live: "Irvine is live" with **Set up Lake Havasu City next** and **Back to the portal**.
- **BizPeople** (1280×1000): People page for Riverside seen by the business manager: list with "[MANAGER EMAIL] — Business manager" (no Remove), an editor row; a card **Hand off this location** (email field, Send invite, helper text "They'll manage Riverside only. You keep access, and the logo, cover and theme stay shared."). A second state below: after hand-off, "[LOCATION MANAGER EMAIL] — Location manager" and a **Take back this location** button with its confirm box.
- **BizLookReadOnly** (1280×900): the Theme page as a location manager sees it: theme swatches disabled, the current one marked, and an info box "Shared by all Hangar 24 locations. [MANAGER EMAIL] manages this."

- [ ] **Step 3: Add the boards to `project/canvas.json`**

Read `project/canvas.json` again right before publishing. Add the five `boards` entries in a new row at `y: 11000` (x = 0, then each next x = previous x + previous w + 80) with titles `"BZ1 · Roster — business row, Managed by, mode switches, Part of"`, `"BZ2 · Location switcher (computer and phone)"`, `"BZ3 · Short setup for another location"`, `"BZ4 · People — Business manager, hand off, take back"`, `"BZ5 · Shared look, read-only for a location manager"`; append them to `order`; add a `notes` entry `"hdr7": {"kind":"title1","text":"Multi-location businesses (spec 2026-10-15)","x":0,"y":10700,"w":240,"maxW":7000}`. Keep every other key exactly as read.

- [ ] **Step 4: Publish to the live canvas**

Artifact publish with `url` = the canvas, `root` = the scratchpad canvas folder, `file_path` = the absolute path of `project/canvas.json`, and `files` mapping each of the five `project/Biz*.dc.html` paths. If refused because someone saved meanwhile, re-read the named files and redo.

- [ ] **Step 5: Copy to the snapshot**

Copy the five files to `docs/design/artboards/`; add the same five boards and note to `docs/design/canvas.json`; add five rows to the README's "Artboard → code" table (Screen and "Part 2–5 (not built yet)"), and a dated line under the latest "Decisions" section: "**Multi-location businesses (2026-10-15):** artboards BZ1–BZ5 for the spec `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md`."

- [ ] **Step 6: Commit**

```bash
git add docs/design
git commit -m "design: multi-location business artboards (BZ1-BZ5) for owner review"
```

- [ ] **Step 7: STOP for the owner's approval**

Give the owner the canvas link and a one-line description of each board. Do not start Parts 2–5 until the owner approves (changes requested → edit the boards, republish, recopy, recommit). Tasks 2–4 below do not depend on the artboards and may proceed.

---

### Task 2: The `businesses` table, `members.business_id`, backfill and insert trigger

**Files:**
- Create: `supabase/migrations/20261016100000_businesses.sql`
- Create: `supabase/tests/businesses.test.sql`
- Modify: `src/lib/supabase/types.ts` (the `MemberRow` type near line 38, plus a new `BusinessRow`)

**Interfaces:**
- Consumes: `public.is_guild_admin()`, `public.set_updated_at()` (existing helpers), the members write lock `members_enforce_owner_write_limits` (unchanged; it already refuses client changes to any column but `member_type`).
- Produces: table `public.businesses (id, name, management_mode, manager_user_id, created_at, updated_at)`; column `public.members.business_id uuid null`; types `BusinessRow` and `MemberRow.business_id: string | null`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/businesses.test.sql`:

```sql
-- Businesses (20261016100000_businesses.sql): the table, the backfill rule,
-- the insert trigger that groups same-named members, and who can read/write.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(12);

insert into _tap (line) select has_table('public', 'businesses', 'businesses table exists');
insert into _tap (line) select has_column('public', 'members', 'business_id', 'members.business_id exists');
insert into _tap (line) select col_default_is(
  'public', 'businesses', 'management_mode', '''separate''::text', 'new businesses start as separate');

-- Insert trigger: a second location with the same name (stray space) joins a new business with the first.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a1', 'pgtap-chain-a', 'producer', 'PgTap Chain', 'Redlands', 'published');
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a2', 'pgtap-chain-b', 'producer', 'PgTap Chain ', 'Riverside', 'published');
insert into _tap (line) select isnt(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'), null,
  'trigger: the first location now has a business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a2'),
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1'),
  'trigger: same name (ignoring stray spaces) joins the same business');

-- A third location joins the existing business rather than making another.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000a3', 'pgtap-chain-c', 'producer', 'PgTap Chain', 'Irvine', 'draft');
insert into _tap (line) select is(
  (select count(distinct business_id)::int from public.members where business_name like 'PgTap Chain%'), 1,
  'trigger: a third location joins the existing business');
insert into _tap (line) select is(
  (select management_mode from public.businesses
    where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a3')),
  'separate', 'trigger-made business is separate');

-- A member with a unique name gets no business.
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000002'), null,
  'a single-location member has no business');

-- Visitors read id and name, not the manager.
set local role anon;
insert into _tap (line) select lives_ok(
  $$ select id, name from public.businesses $$, 'anon can read business id and name');
insert into _tap (line) select throws_ok(
  $$ select manager_user_id from public.businesses $$, '42501', null, 'anon cannot read manager_user_id');
reset role;

-- A member can't move their own location into another business.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ update public.members set business_id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000a1')
     where id = 'f1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot change business_id');
-- Nor create a business.
insert into _tap (line) select throws_ok(
  $$ insert into public.businesses (name) values ('Sneaky') $$, '42501', null, 'owner cannot create a business');
reset role;

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- --no-pending supabase/tests/businesses.test.sql`
Expected: FAIL — `has_table` not ok (the table doesn't exist without the pending migration).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261016100000_businesses.sql`:

```sql
-- Multi-location businesses, part 1 (spec 2026-10-15-multi-location-businesses-design.md).
-- A business ties a member's locations together. Every business starts as
-- 'separate' with no manager, so nothing visible changes yet.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  management_mode text not null default 'separate'
    check (management_mode in ('separate', 'one_manager')),
  manager_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_manager_only_when_one_manager
    check (management_mode = 'one_manager' or manager_user_id is null)
);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;

-- The Members page groups by business, so visitors read id and name only.
revoke all on public.businesses from anon, authenticated;
grant select (id, name) on public.businesses to anon;
grant select on public.businesses to authenticated;
grant insert, update, delete on public.businesses to authenticated;

create policy "businesses: anyone can read"
  on public.businesses for select to anon, authenticated using (true);
create policy "businesses: guild admins can insert"
  on public.businesses for insert to authenticated with check (public.is_guild_admin());
create policy "businesses: guild admins can update"
  on public.businesses for update to authenticated
  using (public.is_guild_admin()) with check (public.is_guild_admin());
create policy "businesses: guild admins can delete"
  on public.businesses for delete to authenticated using (public.is_guild_admin());

alter table public.members
  add column business_id uuid references public.businesses (id) on delete set null;
create index members_business_id_idx on public.members (business_id);
grant select (business_id) on public.members to anon, authenticated;

-- Backfill: each set of two or more members sharing a trimmed name becomes one business.
with groups as (
  select btrim(business_name) as name
  from public.members
  group by btrim(business_name)
  having count(*) > 1
), inserted as (
  insert into public.businesses (name)
  select name from groups
  returning id, name
)
update public.members m
set business_id = i.id
from inserted i
where btrim(m.business_name) = i.name;

-- Until the roster's "Part of" choice exists (part 2), a new member whose
-- name matches an existing member joins that member's business (creating
-- it when needed) -- the same grouping the Members page did by name.
create or replace function public.members_join_business_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sibling record;
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;

  select id, business_id into v_sibling
  from public.members
  where btrim(business_name) = btrim(new.business_name)
    and id <> new.id
  order by created_at
  limit 1;

  if not found then
    return new;
  end if;

  v_business := v_sibling.business_id;
  if v_business is null then
    insert into public.businesses (name) values (btrim(new.business_name))
    returning id into v_business;
    update public.members set business_id = v_business where id = v_sibling.id;
  end if;

  new.business_id := v_business;
  return new;
end;
$$;

create trigger members_join_business_by_name
  before insert on public.members
  for each row execute function public.members_join_business_by_name();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- supabase/tests/businesses.test.sql`
Expected: PASS — `ok 1` … `ok 12` (the runner splices the pending migration into the rolled-back transaction). If `col_default_is` reports a different text form of the default, copy the "have" value it prints into the test.

- [ ] **Step 5: Run every database test to check nothing else broke**

Run: `npm run test:db`
Expected: every file passes. (The fixtures' members all have unique names, so they get no business.)

- [ ] **Step 6: Add the types**

In `src/lib/supabase/types.ts`, add `business_id: string | null;` to `MemberRow` right after `business_name: string;`, and add:

```ts
export type BusinessManagementMode = "separate" | "one_manager";

/** A multi-location business (spec 2026-10-15). Visitors can read only id and name. */
export type BusinessRow = {
  id: string;
  name: string;
  management_mode: BusinessManagementMode;
  manager_user_id: string | null;
  created_at: string;
  updated_at: string;
};
```

Run: `npx tsc --noEmit`
Expected: only the existing `src/routes/survey.tsx` error (pre-existing; /survey is scheduled for deletion). Fix any new error from places that build `MemberRow` literals in tests by adding `business_id: null`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261016100000_businesses.sql supabase/tests/businesses.test.sql src/lib/supabase/types.ts
git commit -m "feat(db): businesses table groups multi-location members (all start separate)"
```

---

### Task 3: Members page groups locations by business

**Files:**
- Modify: `src/lib/members/directory.ts` (`DIRECTORY_MEMBER_COLUMNS`, `DirectoryMemberRow`, `DirectoryMember`, `buildDirectoryMembers` lines ~116-170)
- Modify: `src/lib/members/directory.test.ts`
- Modify: `src/lib/members/members-v2.ts:61` (`const key = m.name;`)
- Modify: `src/lib/members/members-v2.test.ts`

**Interfaces:**
- Consumes: `members.business_id` (Task 2), readable by anon.
- Produces: `DirectoryMemberRow.business_id: string | null`; `DirectoryMember.groupKey: string` (= the business id, or the member id for a single location); `V2Card.key === groupKey`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/members/directory.test.ts`, the `row()` helper builds a `DirectoryMemberRow`; add `business_id: null` to its defaults. Then add to `describe("buildDirectoryMembers", ...)`:

```ts
  it("groups locations by business, not by name (spec 2026-10-15)", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "a", slug: "hangar-24-redlands", business_name: "Hangar 24", city: "Redlands", business_id: "biz-1" }),
        row({ id: "b", slug: "hangar-24-riverside", business_name: "Hangar 24 Riverside", city: "Riverside", business_id: "biz-1" }),
      ],
      links: [],
      logoUrls: new Map(),
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].groupKey).toBe("biz-1");
    expect(cards[0].locations.map((l) => l.city)).toEqual(["Redlands", "Riverside"]);
  });

  it("two single locations that share a name stay two cards with distinct keys", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "x", slug: "same-name-1", business_name: "Same Name", city: "Chino", business_id: null }),
        row({ id: "y", slug: "same-name-2", business_name: "Same Name", city: "Corona", business_id: null }),
      ],
      links: [],
      logoUrls: new Map(),
    });
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((c) => c.groupKey))).toEqual(new Set(["x", "y"]));
  });

  it("a card is named after its first location (by city)", () => {
    const [card] = buildDirectoryMembers({
      rows: [
        row({ id: "b", slug: "z-riverside", business_name: "Zed Brewing Riverside", city: "Riverside", business_id: "biz-z" }),
        row({ id: "a", slug: "z-chino", business_name: "Zed Brewing", city: "Chino", business_id: "biz-z" }),
      ],
      links: [],
      logoUrls: new Map(),
    });
    expect(card.name).toBe("Zed Brewing");
  });
```

The existing test that groups two "Metabolic Brewing Co." rows by name must now give both rows the same `business_id` (e.g. `business_id: "biz-m"`); edit that test's rows accordingly, since grouping is by business now.

In `src/lib/members/members-v2.test.ts`, wherever a `DirectoryMember` literal is built, add `groupKey` (use the existing name string so existing expectations keep reading naturally, e.g. `groupKey: "All Points Brewing Co."`), and add:

```ts
  it("card and pin keys come from the business group, not the display name", () => {
    const { cards, pins } = buildV2({
      members: [
        {
          name: "Same Name",
          groupKey: "biz-1",
          memberType: "producer",
          locations: [{ slug: "s1", city: "Chino", street: "1 Main St", address: "1 Main St, Chino, CA", lat: 34, lng: -117.7 }],
          website: null,
          logo: null,
        },
      ],
      rows: [],
      categoriesByMemberId: new Map(),
      stopsByMemberId: new Map(),
      now: new Date("2026-10-16T12:00:00Z"),
    });
    expect(cards[0].key).toBe("biz-1");
    expect(pins[0].cardKey).toBe("biz-1");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/members/directory.test.ts src/lib/members/members-v2.test.ts`
Expected: FAIL — `groupKey` is undefined / type errors on `business_id` and `groupKey`.

- [ ] **Step 3: Implement**

In `src/lib/members/directory.ts`:

- Update the module comment's grouping sentence to: "a multi-location business is several member rows sharing a `business_id` (the same rule the profile page's "Next location" uses), shown as one card with one clickable city per location."
- `DIRECTORY_MEMBER_COLUMNS`: append `, business_id`.
- `DirectoryMemberRow`: add `business_id: string | null;` after `business_name`.
- `DirectoryMember`: add, after `name: string;`:

```ts
  /** Stable grouping key: the business id, or the member's own id for a single location. */
  groupKey: string;
```

- In `buildDirectoryMembers`, replace the `byBusiness` grouping and the loop head:

```ts
  const byBusiness = new Map<string, DirectoryMemberRow[]>();
  for (const row of args.rows) {
    const groupKey = row.business_id ?? row.id;
    const list = byBusiness.get(groupKey) ?? [];
    list.push(row);
    byBusiness.set(groupKey, list);
  }

  const cards: DirectoryMember[] = [];
  for (const [groupKey, rows] of byBusiness) {
    const sorted = [...rows].sort(
      (a, b) => a.city.localeCompare(b.city) || a.slug.localeCompare(b.slug),
    );
    const name = sorted[0].business_name.trim();
```

and in the `card` literal add `groupKey,` after `name,`.

In `src/lib/members/members-v2.ts:61`, change `const key = m.name;` to `const key = m.groupKey;` and update the `V2Card.key` doc comment to "Stable key: the business group (cards are one per business)."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/members`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm test` then `npx tsc --noEmit`
Expected: all tests pass; only the pre-existing `survey.tsx` type error. Any other `DirectoryMember` literal the type checker flags (e.g. in component tests) gets a `groupKey`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/members
git commit -m "feat(members page): group locations by business record instead of matching names"
```

---

### Task 4: Profile "Next location" by business, docs

**Files:**
- Modify: `src/lib/members/member-profile.server.ts` (the `MEMBER_COLUMNS` string at line ~48-49 and the sibling query at ~145-152)
- Modify: `docs/member-profiles.md` (Data/members section: add the business record; the Members page line ~754)

**Interfaces:**
- Consumes: `members.business_id` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Change the query**

In `MEMBER_COLUMNS`, add `business_id` after `business_name`. Replace the sibling query (the one commented "Next location: this business's other published rows"):

```ts
    // Next location: the other published locations of this business, by city.
    // A single location (no business) has none.
    member.business_id
      ? supabase
          .from("members")
          .select("id, slug, business_name, city, member_type")
          .eq("status", "published")
          .eq("business_id", member.business_id)
          .order("city")
      : Promise.resolve({ data: [] as unknown[] }),
```

`siblingResult.data` goes through `toEntries(rows: unknown[] | null)` (line ~51) into `siblingEntries`, which `profile-object.ts:338` reads as `getAdjacentInList(input.siblingEntries, member.id).next`. Add a test to `src/lib/members/profile-object.test.ts` pinning that an empty `siblingEntries` gives `nextLocation: null` (the single-location case), mirroring that file's existing `buildProfileObject`/`nextLocation` tests; if `getAdjacentInList([], id)` doesn't already return `{ next: null }`, return `{ data: [{ id: member.id, slug: member.slug, business_name: member.business_name, city: member.city, member_type: member.member_type }] }` instead of `[]` (today's single-location shape) and make the test pass that way.

- [ ] **Step 2: Type check and run the profile tests**

Run: `npx tsc --noEmit` and `npx vitest run src/lib/members src/components/profile`
Expected: pass (only the pre-existing `survey.tsx` error).

- [ ] **Step 3: Document**

In `docs/member-profiles.md`, add a short "Businesses (multi-location)" paragraph near the members data description: "A business ties a member's locations together (`businesses`, `members.business_id`, migration `20261016100000_businesses.sql`). The Members page card and the profile's Next location group by it. Every business starts 'Each location separately'; one-manager mode, the switcher, the shared look and hand-off come in later parts (spec `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md`). Until the roster's Part of choice exists, a new member whose name matches an existing member joins its business automatically." Update the Members page line (~754) "one card per member with its locations inside" to "one card per business (its locations inside)".

- [ ] **Step 4: Commit**

```bash
git add src/lib/members/member-profile.server.ts src/lib/members/profile-object.test.ts docs/member-profiles.md
git commit -m "feat(profile): Next location follows the business record"
```

---

### Task 5: Apply the migration and review on staging

**Files:** none changed.

- [ ] **Step 1: Ask the owner before pushing the migration**

The database is shared by staging and production. Tell the owner, in plain words: "This adds a new businesses table and fills it from members that share a name. It changes nothing the site shows, and the live site keeps working the same before and after. OK to apply it?" Wait for yes.

- [ ] **Step 2: Push the migration**

Run: `npx supabase db push --linked`
Expected: `20261016100000_businesses.sql` applied. Then `npm run test:db -- --no-pending supabase/tests/businesses.test.sql` passes against the applied schema.

- [ ] **Step 3: Read back the backfill (read-only)**

Run: `npx supabase db query --linked "select b.name, count(m.id) as locations from public.businesses b join public.members m on m.business_id = b.id group by b.name order by b.name"`
Expected: one row per multi-location business (e.g. Hangar 24 with its location count). Report the list to the owner.

- [ ] **Step 4: Push to staging**

```bash
git push origin staging
```

Wait for the staging build (memory: a push can land without a Cloudflare build; confirm the deploy time, and push an empty commit to re-trigger if needed). On staging, open `/members` and check: Hangar 24 (and every other multi-location business from Step 3) is still one card with all its locations; hovering a card still highlights its pins; a multi-location profile's "Next location" still steps through its locations.

- [ ] **Step 5: Hand over**

Tell the owner Part 1 is on staging for review and that nothing visible should have changed; production waits for their "go". Parts 2–5 get their plans once the artboards are approved.
