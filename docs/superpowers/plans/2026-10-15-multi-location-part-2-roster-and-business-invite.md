# Multi-location Businesses, Part 2: Roster, Managed By and the Business Invite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Guild roster, show each multi-location business as one row with its locations under it, let a Guild admin choose **Managed by: One manager / Each location separately**, send one invitation to a one-manager business's manager, and choose **Part of** when adding a member or from a row's menu.

**Architecture:** Three SECURITY DEFINER SQL functions (`set_business_mode`, `link_business_manager`, `set_member_business`) do every business write, check `is_guild_admin()`, and audit-log against the real actor. Server functions in `src/lib/guild/businesses.server.ts` wrap them; the invite's account step reuses the existing create-or-find-account logic through a testable core (`business-invite-core.ts`). The roster loader returns businesses next to entries, and a pure `groupRoster()` shapes rows for `RosterTable`.

**Tech Stack:** Supabase Postgres + pgTAP (`npm run test:db`), TanStack Start server functions, React, Vitest (`npm test`), Resend emails via `src/lib/email/`.

**Spec:** `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md` (Rollout step 2, roster part). Part 1 (`docs/superpowers/plans/2026-10-15-multi-location-part-1-artboards-and-business-record.md`) is done: `businesses`, `members.business_id`, the name trigger, and Members-page grouping are live on the shared database and on staging.

**Look and layout:** artboard BZ1 `docs/design/artboards/BizRoster.dc.html` (owner-approved 15 Oct 2026). Match it; this plan wins on behavior.

## Global Constraints

- All visible text in US English.
- New emails: one link (sign-in, `/signin?next=/portal`), `replyTo: MEMBER_INVITE_REPLY_TO` ("webmaster@iscbrewersguild.org"), organization named **ISC Brewers Guild** / **Inland Southern California Brewers Guild**.
- Every business write goes through a SQL function that checks `public.is_guild_admin()` and inserts an `audit_log` row (`actor_user_id = auth.uid()`, `table_name = 'businesses'` or `'members'`, `row_id`, `action`). No direct client writes to `businesses`.
- Staging and production share one database. `supabase db push` only with the owner's yes; work stays on `staging`; production waits for the owner's "go", and the Member Guide is checked before any merge to `main` (owner, 15 Oct 2026).
- Nothing changes for members yet: the location switcher is Part 3, so a one-manager invite must not be sent to a real member before Part 3 is on staging. (Tests and staging checks use sample accounts only.)

### Rulings this plan makes within the spec (owner sees these at hand-over)

1. **Mode switching is limited in Part 2.** Switching to *One manager* is allowed only when nobody is linked to any of the business's locations yet; switching back to *Each location separately* only while no manager has been invited. The full switches in the spec (existing owners become location managers; manager's links removed) come with hand-off in Part 5. The refusal message says so.
2. **A location added to a one-manager business gets the manager linked and emailed now; it copies the shared look in Part 4** (when the shared look exists).
3. **Taking a location out of a one-manager business is refused in Part 2** ("Switch the business to each location separately first"); Part 5 handles it with the manager's links.

## Review Focus

1. **A non-admin calling any of the three SQL functions** (signed-in member, anon) must be refused with 42501 and change nothing. Covered in Task 1.
2. **Taking the second-to-last location out of a business** must leave no one-location business behind (the last location's `business_id` is cleared and the business deleted), or the Members page would still group a lone location. Covered in Task 1.
3. **Inviting a manager with an email that already has an account** (someone who signed in on their own) must link that account, never fail or delete it — same rule as today's member invite. Covered in Task 3.
4. **The roster search/filters on a business** must still find it by any location's city and keep its business row; a filter that matches no location hides the whole business. Covered in Task 4.
5. **Adding a member whose name matches a one-manager business** must not slip into it without the manager being linked (Part 1's name trigger would have). Covered in Task 1: the trigger now joins only separately managed businesses, and Part of links the manager.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261016100000_business_functions.sql` (new) | `set_business_mode`, `link_business_manager`, `set_member_business` |
| `supabase/tests/business_functions.test.sql` (new) | pgTAP for them |
| `src/lib/email/build-email-content.ts` (modify) | `business_invited`, `business_location_added` triggers |
| `src/lib/email/resolve-recipient.server.ts` (modify) | recipients for the two triggers |
| `src/lib/email/build-email-content.test.ts` (modify) | email tests |
| `src/lib/guild/auth-accounts.server.ts` (new) | create-or-find an auth account (moved out of invite-member.server.ts, shared) |
| `src/lib/guild/invite-member.server.ts` (modify) | uses auth-accounts |
| `src/lib/guild/business-invite-core.ts` (new) + `.test.ts` | invite steps without I/O |
| `src/lib/guild/businesses.server.ts` (new) | `setBusinessMode`, `setMemberBusiness`, `inviteBusinessManager` |
| `src/lib/guild/roster.server.ts` (modify) | return `{ entries, businesses }` |
| `src/lib/guild/roster-groups.ts` (new) + `.test.ts` | `groupRoster()` and filtering |
| `src/routes/guild.roster.tsx` (modify) | pass businesses |
| `src/components/guild/RosterTable.tsx` (modify) | business rows, Managed by, Invite, Part of menu item |
| `src/components/guild/BusinessRow.tsx` (new) | the business row header |
| `src/components/guild/PartOfDialog.tsx` (new) | Part of picker for an existing member |
| `src/components/guild/InviteEmailDialog.tsx` (modify) | optional `title`/`description` props |
| `src/components/guild/CreateMemberDialog.tsx` + `src/lib/guild/create-member.server.ts` (modify) | Part of on Add member |
| `docs/member-profiles.md` (modify) | roster and emails |

---

### Task 1: SQL functions for business writes

**Files:**
- Create: `supabase/migrations/20261016100000_business_functions.sql`
- Create: `supabase/tests/business_functions.test.sql`

**Interfaces:**
- Consumes: `public.businesses`, `public.members.business_id`, `public.member_users (member_id, user_id, role)` with `unique (member_id, user_id)` and the one-owner index, `public.is_guild_admin()`, `public.audit_log`.
- Produces (all `security definer`, `set search_path = public`, execute granted to `authenticated` only):
  - `set_business_mode(p_business_id uuid, p_mode text) returns void`
  - `link_business_manager(p_business_id uuid, p_user_id uuid) returns void`
  - `set_member_business(p_member_id uuid, p_target uuid) returns jsonb` — `p_target` is a business id, another member's id, or null; returns `{"business_id": uuid|null, "notify_manager_user_id": uuid|null}`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/business_functions.test.sql`:

```sql
-- Business write functions (20261016100000_business_functions.sql): who may
-- call them, mode switching in part 2, linking a manager, Part of.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(18);

-- A three-location business nobody has been invited to, and a single member.
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000b1', 'pgtap-biz-a', 'producer', 'PgTap Biz', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b2', 'pgtap-biz-b', 'producer', 'PgTap Biz', 'Riverside', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b3', 'pgtap-biz-c', 'producer', 'PgTap Biz', 'Irvine', 'draft'),
  ('f1000000-0000-4000-8000-0000000000b4', 'pgtap-solo', 'producer', 'PgTap Solo', 'Chino', 'draft');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-0000000000b1';
grant select on _biz to public;

-- Non-admins are refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager') $$, '42501', null,
  'member: cannot change a business mode');
insert into _tap (line) select throws_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', (select id from _biz)) $$, '42501', null,
  'member: cannot change Part of');
insert into _tap (line) select throws_ok(
  $$ select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000001') $$, '42501', null,
  'member: cannot link a manager');
reset role;

-- Guild admin from here on.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';

select public.set_business_mode((select id from _biz), 'one_manager');
insert into _tap (line) select is(
  (select management_mode from public.businesses where id = (select id from _biz)), 'one_manager',
  'admin: switches an uninvited business to one manager');
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log where table_name = 'businesses' and row_id = (select id from _biz)
          and actor_user_id = 'f0000000-0000-4000-8000-000000000004'),
  'mode change is audit-logged against the admin');

-- Link the manager: owner of every location.
select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000006');
insert into _tap (line) select is(
  (select manager_user_id from public.businesses where id = (select id from _biz)),
  'f0000000-0000-4000-8000-000000000006'::uuid, 'manager recorded on the business');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users mu join public.members m on m.id = mu.member_id
    where m.business_id = (select id from _biz) and mu.user_id = 'f0000000-0000-4000-8000-000000000006' and mu.role = 'owner'),
  3, 'manager is owner of all three locations');
insert into _tap (line) select throws_ok(
  $$ select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000005') $$,
  'P0001', null, 'a second manager is refused');

-- Part 2 limits: back to separate refused once a manager exists.
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$, 'P0001', null,
  'switching back after a manager is invited is refused in part 2');

-- Adding the solo member to the one-manager business links the manager and asks to notify.
insert into _tap (line) select is(
  public.set_member_business('f1000000-0000-4000-8000-0000000000b4', (select id from _biz)) ->> 'notify_manager_user_id',
  'f0000000-0000-4000-8000-000000000006', 'joining a one-manager business returns the manager to email');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-0000000000b4'
     and user_id = 'f0000000-0000-4000-8000-000000000006'),
  'owner', 'the new location''s owner is the manager');

-- Leaving a one-manager business is refused in part 2.
insert into _tap (line) select throws_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', null) $$, 'P0001', null,
  'leaving a one-manager business is refused in part 2');

-- Separate businesses: grouping two singles by member id, then splitting cleans up.
reset role;
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c1', 'pgtap-x', 'producer', 'PgTap X', 'Corona', 'draft'),
  ('f1000000-0000-4000-8000-0000000000c2', 'pgtap-y', 'producer', 'PgTap Y Different', 'Norco', 'draft');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_member_business('f1000000-0000-4000-8000-0000000000c2', 'f1000000-0000-4000-8000-0000000000c1');
insert into _tap (line) select ok(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1') is not null
  and (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1')
    = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c2'),
  'target = another member: both share a new business');
insert into _tap (line) select is(
  (select name from public.businesses where id = (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1')),
  'PgTap X', 'the new business is named after the target member');
select public.set_member_business('f1000000-0000-4000-8000-0000000000c2', null);
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c1'), null,
  'taking out the second-to-last location clears the last one too');
insert into _tap (line) select is(
  (select count(*)::int from public.businesses where name = 'PgTap X'), 0,
  'and deletes the empty business');

-- The name rule never joins a one-manager business (Part of does, linking the manager).
reset role;
insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-0000000000c3', 'pgtap-biz-d', 'producer', 'PgTap Biz', 'Temecula', 'draft');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-0000000000c3'), null,
  'a same-name location is not auto-joined to a one-manager business');
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000002'), null,
  'unrelated members untouched');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

Note on `pgtap-biz-d`: Part 1's name trigger would have joined it to the one-manager business without linking the manager. This migration changes the trigger to join only a business in `separate` mode (or create one); a one-manager business is joined through Part of, which links and emails the manager.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- --no-pending supabase/tests/business_functions.test.sql`
Expected: FAIL — `function public.set_business_mode(uuid, unknown) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261016100000_business_functions.sql`:

```sql
-- Multi-location businesses, part 2 (spec 2026-10-15): the Guild's business
-- writes. Every one checks is_guild_admin() and is audit-logged against the
-- real actor. Part 2 limits mode switching and leaving a one-manager
-- business; part 5 (hand-off) widens both.

create or replace function public._business_audit(p_member_id uuid, p_table text, p_row_id uuid, p_action text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
  values (auth.uid(), p_member_id, p_table, p_row_id, p_action);
$$;
revoke all on function public._business_audit(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public._require_guild_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_guild_admin() then
    raise exception 'Only a Guild admin can do this' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_guild_admin() from public, anon, authenticated;

-- Link the business manager to one location: owner when it has none, else editor.
create or replace function public._link_manager_to_location(p_member_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.member_users where member_id = p_member_id and user_id = p_user_id) then
    return;
  end if;
  insert into public.member_users (member_id, user_id, role)
  values (
    p_member_id,
    p_user_id,
    case when exists (select 1 from public.member_users where member_id = p_member_id and role = 'owner')
         then 'editor' else 'owner' end
  );
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'insert');
end;
$$;
revoke all on function public._link_manager_to_location(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_business_mode(p_business_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
begin
  perform public._require_guild_admin();
  if p_mode not in ('separate', 'one_manager') then
    raise exception 'Unknown management mode: %', p_mode;
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode = p_mode then
    return;
  end if;

  if p_mode = 'one_manager' and exists (
    select 1 from public.member_users mu
    join public.members m on m.id = mu.member_id
    where m.business_id = p_business_id
  ) then
    raise exception 'Some of these locations already have people signed up. Switching them to one manager comes in a later update.';
  end if;
  if p_mode = 'separate' and v_business.manager_user_id is not null then
    raise exception 'This business already has a manager. Switching it back comes in a later update.';
  end if;

  update public.businesses set management_mode = p_mode where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');
end;
$$;

create or replace function public.link_business_manager(p_business_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_member_id uuid;
begin
  perform public._require_guild_admin();
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode <> 'one_manager' then
    raise exception 'Set this business to One manager first';
  end if;
  if v_business.manager_user_id is not null then
    raise exception 'This business already has a manager';
  end if;

  update public.businesses set manager_user_id = p_user_id where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  for v_member_id in select id from public.members where business_id = p_business_id loop
    perform public._link_manager_to_location(v_member_id, p_user_id);
  end loop;
end;
$$;

-- Part of. p_target: a business id, another member's id (join its business,
-- creating one named after it when it has none), or null (no business).
create or replace function public.set_member_business(p_member_id uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_current public.businesses;
  v_target_business uuid;
  v_target_member public.members;
  v_target public.businesses;
  v_remaining int;
begin
  perform public._require_guild_admin();
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception 'That member no longer exists';
  end if;

  -- Resolve the target to a business id (or null).
  if p_target is null then
    v_target_business := null;
  elsif exists (select 1 from public.businesses where id = p_target) then
    v_target_business := p_target;
  else
    select * into v_target_member from public.members where id = p_target for update;
    if not found then
      raise exception 'Choose a business or a member';
    end if;
    if v_target_member.id = p_member_id then
      raise exception 'A location can''t be grouped with itself';
    end if;
    v_target_business := v_target_member.business_id;
    if v_target_business is null then
      insert into public.businesses (name) values (btrim(v_target_member.business_name))
      returning id into v_target_business;
      update public.members set business_id = v_target_business where id = v_target_member.id;
      perform public._business_audit(v_target_member.id, 'members', v_target_member.id, 'update');
    end if;
  end if;

  if v_target_business is not distinct from v_member.business_id then
    return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
  end if;

  -- Leaving the current business.
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' then
      raise exception 'Switch the business to each location separately first';
    end if;
  end if;

  update public.members set business_id = v_target_business where id = p_member_id;
  perform public._business_audit(p_member_id, 'members', p_member_id, 'update');

  -- A business left with one location (or none) is dissolved.
  if v_member.business_id is not null then
    select count(*) into v_remaining from public.members where business_id = v_member.business_id;
    if v_remaining <= 1 then
      update public.members set business_id = null where business_id = v_member.business_id;
      delete from public.businesses where id = v_member.business_id;
      perform public._business_audit(null, 'businesses', v_member.business_id, 'delete');
    end if;
  end if;

  -- Joining a one-manager business that has a manager: link them.
  if v_target_business is not null then
    select * into v_target from public.businesses where id = v_target_business;
    if v_target.management_mode = 'one_manager' and v_target.manager_user_id is not null then
      perform public._link_manager_to_location(p_member_id, v_target.manager_user_id);
      return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', v_target.manager_user_id);
    end if;
  end if;

  return jsonb_build_object('business_id', v_target_business, 'notify_manager_user_id', null);
end;
$$;

-- Part 1's name rule (20261015200000) joins only a separately managed
-- business: a one-manager business needs its manager linked, which Part of
-- (set_member_business) does.
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

  select m.id, m.business_id into v_sibling
  from public.members m
  left join public.businesses b on b.id = m.business_id
  where btrim(m.business_name) = btrim(new.business_name)
    and m.id <> new.id
    and (m.business_id is null or b.management_mode = 'separate')
  order by m.created_at
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

revoke all on function public.set_business_mode(uuid, text) from public, anon;
revoke all on function public.link_business_manager(uuid, uuid) from public, anon;
revoke all on function public.set_member_business(uuid, uuid) from public, anon;
grant execute on function public.set_business_mode(uuid, text) to authenticated;
grant execute on function public.link_business_manager(uuid, uuid) to authenticated;
grant execute on function public.set_member_business(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- supabase/tests/business_functions.test.sql`
Expected: PASS 17/17. If `raise exception` without an errcode doesn't surface as `P0001` in `throws_ok`, check the printed "caught" code and keep `P0001` (plpgsql's default `raise_exception` is SQLSTATE P0001).

- [ ] **Step 5: Run every database test**

Run: `npm run test:db`
Expected: all files pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261016100000_business_functions.sql supabase/tests/business_functions.test.sql
git commit -m "feat(db): Guild-only functions to set a business's mode, link its manager and choose Part of"
```

---

### Task 2: The two business emails

**Files:**
- Modify: `src/lib/email/build-email-content.ts` (the `TransactionalEmailPayload` union near line 17, and the `switch` in `buildEmailContent`)
- Modify: `src/lib/email/resolve-recipient.server.ts:42-45`
- Modify: `src/lib/email/build-email-content.test.ts`

**Interfaces:**
- Produces payloads:
  - `{ trigger: "business_invited"; businessId: string; businessName: string; locationCount: number; email: string }`
  - `{ trigger: "business_location_added"; memberId: string; businessName: string; city: string; email: string }`
- `resolveRecipient` returns `payload.email` for both.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/email/build-email-content.test.ts` (it already imports `buildEmailContent`, `MEMBER_INVITE_REPLY_TO`, `SITE_URL`, `ORG_SHORT_NAME`):

```ts
describe("buildEmailContent: business_invited (spec 2026-10-15)", () => {
  const payload = {
    trigger: "business_invited" as const,
    businessId: "b1",
    businessName: "Hangar 24 Brewing Co.",
    locationCount: 4,
    email: "boss@hangar24.example",
  };

  it("names the business and its location count in the subject", () => {
    expect(buildEmailContent(payload).subject).toBe(
      `You're invited to manage Hangar 24 Brewing Co.'s 4 locations on the ${ORG_SHORT_NAME} member directory`,
    );
  });

  it("has one link, to sign in to the Member Portal, and replies go to the webmaster", () => {
    const content = buildEmailContent(payload);
    expect(content.html.match(/<a /g)).toHaveLength(1);
    expect(content.text).toContain(`${SITE_URL}/signin?next=/portal`);
    expect(content.replyTo).toBe(MEMBER_INVITE_REPLY_TO);
  });

  it("escapes the business name in the HTML", () => {
    const content = buildEmailContent({ ...payload, businessName: "<b>Bad</b> & Co." });
    expect(content.html).toContain("&lt;b&gt;Bad&lt;/b&gt; &amp; Co.");
  });
});

describe("buildEmailContent: business_location_added (spec 2026-10-15)", () => {
  const payload = {
    trigger: "business_location_added" as const,
    memberId: "m9",
    businessName: "Hangar 24 Brewing Co.",
    city: "Temecula",
    email: "boss@hangar24.example",
  };

  it("says which location was added and links to sign in", () => {
    const content = buildEmailContent(payload);
    expect(content.subject).toBe("A new location was added to Hangar 24 Brewing Co.");
    expect(content.text).toContain("A new location, Hangar 24 Brewing Co. · Temecula, was added to your business.");
    expect(content.text).toContain(`${SITE_URL}/signin?next=/portal`);
    expect(content.html.match(/<a /g)).toHaveLength(1);
    expect(content.replyTo).toBe(MEMBER_INVITE_REPLY_TO);
  });
});
```

And in `src/lib/email/resolve-recipient.server.test.ts`, add (using that file's existing `fakeSupabase` helper):

```ts
  it("business emails go to the address in the payload", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    await expect(
      resolveRecipient({ trigger: "business_invited", businessId: "b", businessName: "B", locationCount: 2, email: "a@x.com" }, supabase),
    ).resolves.toBe("a@x.com");
    await expect(
      resolveRecipient({ trigger: "business_location_added", memberId: "m", businessName: "B", city: "C", email: "a@x.com" }, supabase),
    ).resolves.toBe("a@x.com");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/email`
Expected: FAIL (type errors / undefined content for the new triggers).

- [ ] **Step 3: Implement**

In the `TransactionalEmailPayload` union add:

```ts
  | {
      /** Roster: one invite for a one-manager business (spec 2026-10-15). */
      trigger: "business_invited";
      businessId: string;
      businessName: string;
      locationCount: number;
      email: string;
    }
  | {
      /** Roster: a Guild admin added a location to a one-manager business; to its manager. */
      trigger: "business_location_added";
      memberId: string;
      businessName: string;
      city: string;
      email: string;
    }
```

In `buildEmailContent`'s switch, before `case "contact_confirmation"`:

```ts
    case "business_invited": {
      const signInUrl = `${siteUrl}/signin?next=/portal`;
      const intro =
        `Welcome to the ${ORG_NAME}! The Guild has set up profiles on the member directory for ` +
        `${payload.businessName}'s ${payload.locationCount} locations, and you manage all of them.`;
      const howTo = "Sign in anytime with this email address to set them up:";
      const after = "You'll set up the logo, cover and theme once for every location, then each location's own details. Questions? Just reply to this email.";
      return {
        subject: `You're invited to manage ${payload.businessName}'s ${payload.locationCount} locations on the ${ORG_SHORT_NAME} member directory`,
        replyTo: MEMBER_INVITE_REPLY_TO,
        text: `${intro}\n\n${howTo}\n\n${signInUrl}\n\n${after}`,
        html: wrapHtml([escapeHtml(intro), `${howTo} <a href="${signInUrl}">${signInUrl}</a>`, escapeHtml(after)]),
      };
    }

    case "business_location_added": {
      const signInUrl = `${siteUrl}/signin?next=/portal`;
      const sentence = `A new location, ${payload.businessName} · ${payload.city}, was added to your business.`;
      const howTo = "Sign in to set it up:";
      return {
        subject: `A new location was added to ${payload.businessName}`,
        replyTo: MEMBER_INVITE_REPLY_TO,
        text: `${sentence}\n\n${howTo}\n\n${signInUrl}`,
        html: wrapHtml([escapeHtml(sentence), `${howTo} <a href="${signInUrl}">${signInUrl}</a>`]),
      };
    }
```

In `resolve-recipient.server.ts`, add `case "business_invited":` and `case "business_location_added":` to the group that returns `payload.email` (lines 42-45).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/email`
Expected: PASS. Then `npx tsc --noEmit` (only the pre-existing `src/routes/survey.tsx` error).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email
git commit -m "feat(email): business invited and location added emails (one link, replies to webmaster@)"
```

---

### Task 3: Business invite and the business server functions

**Files:**
- Create: `src/lib/guild/auth-accounts.server.ts`
- Modify: `src/lib/guild/invite-member.server.ts` (lines 68-86: `createUser`, `findUserIdByEmail` move out)
- Create: `src/lib/guild/business-invite-core.ts`, `src/lib/guild/business-invite-core.test.ts`
- Create: `src/lib/guild/businesses.server.ts`

**Interfaces:**
- Consumes: SQL `set_business_mode`, `link_business_manager`, `set_member_business` (Task 1); email payloads (Task 2); `sendTransactionalEmail` (`src/lib/email/send.ts`).
- Produces:
  - `auth-accounts.server.ts`: `createAuthUser(service: SupabaseClient, email: string): Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }>` and `findAuthUserIdByEmail(service: SupabaseClient, email: string): Promise<string | null>` (bodies moved verbatim from invite-member.server.ts).
  - `business-invite-core.ts`: `inviteBusinessManagerCore(deps: BusinessInviteDeps, input: { businessId: string; email: string }): Promise<{ ok: true; userId: string; existing: boolean }>`.
  - `businesses.server.ts`: server functions `setBusinessMode({ businessId, mode })`, `setMemberBusiness({ memberId, target })` (target: `string | null`), `inviteBusinessManager({ businessId, email })`; and a plain helper `applyMemberBusiness(supabase, memberId, target): Promise<void>` used by Task 5.

- [ ] **Step 1: Write the failing core test**

Create `src/lib/guild/business-invite-core.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { inviteBusinessManagerCore, type BusinessInviteDeps } from "./business-invite-core";

function deps(over: Partial<BusinessInviteDeps> = {}): BusinessInviteDeps {
  return {
    loadBusiness: vi.fn(async () => ({ name: "Hangar 24 Brewing Co.", mode: "one_manager" as const, managerUserId: null, locationCount: 4 })),
    createUser: vi.fn(async () => ({ ok: true as const, userId: "new-user" })),
    findUserIdByEmail: vi.fn(async () => "existing-user"),
    linkManager: vi.fn(async () => ({ ok: true as const })),
    deleteUser: vi.fn(async () => {}),
    sendInviteEmail: vi.fn(async () => {}),
    ...over,
  };
}

describe("inviteBusinessManagerCore", () => {
  it("a new email: creates the account, links it as manager, sends the business invite", async () => {
    const d = deps();
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: " Boss@X.com " })).resolves.toEqual({ ok: true, userId: "new-user", existing: false });
    expect(d.createUser).toHaveBeenCalledWith("boss@x.com");
    expect(d.linkManager).toHaveBeenCalledWith("b", "new-user");
    expect(d.sendInviteEmail).toHaveBeenCalledWith({ businessId: "b", businessName: "Hangar 24 Brewing Co.", locationCount: 4, email: "boss@x.com" });
  });

  it("an email that already has an account links that account and never deletes it", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ ok: false as const, emailTaken: true, message: "already registered" })),
      linkManager: vi.fn(async () => ({ ok: false as const, message: "boom" })),
    });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.linkManager).toHaveBeenCalledWith("b", "existing-user");
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("removes a just-created account when linking fails", async () => {
    const d = deps({ linkManager: vi.fn(async () => ({ ok: false as const, message: "boom" })) });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("refuses before creating anything when the business isn't one-manager or already has a manager", async () => {
    const separate = deps({ loadBusiness: vi.fn(async () => ({ name: "B", mode: "separate" as const, managerUserId: null, locationCount: 2 })) });
    await expect(inviteBusinessManagerCore(separate, { businessId: "b", email: "a@x.com" })).rejects.toThrow("Set this business to One manager first.");
    expect(separate.createUser).not.toHaveBeenCalled();

    const managed = deps({ loadBusiness: vi.fn(async () => ({ name: "B", mode: "one_manager" as const, managerUserId: "u", locationCount: 2 })) });
    await expect(inviteBusinessManagerCore(managed, { businessId: "b", email: "a@x.com" })).rejects.toThrow("This business already has a manager.");
    expect(managed.createUser).not.toHaveBeenCalled();
  });

  it("a failed email never undoes the invite", async () => {
    const d = deps({ sendInviteEmail: vi.fn(async () => { throw new Error("resend down"); }) });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).resolves.toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/guild/business-invite-core.test.ts`
Expected: FAIL — cannot find module `./business-invite-core`.

- [ ] **Step 3: Write the core**

Create `src/lib/guild/business-invite-core.ts`:

```ts
/**
 * The roster's one Invite for a one-manager business (spec 2026-10-15),
 * minus the I/O so it's testable (businesses.server.ts wires Supabase and
 * the email). Same account rules as the member invite
 * (invite-member-core.ts): an email that already has an account is linked,
 * never deleted; only an account this invite just created is removed again
 * if linking fails.
 */
export type BusinessInviteDeps = {
  loadBusiness: (businessId: string) => Promise<{
    name: string;
    mode: "separate" | "one_manager";
    managerUserId: string | null;
    locationCount: number;
  }>;
  createUser: (email: string) => Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }>;
  findUserIdByEmail: (email: string) => Promise<string | null>;
  linkManager: (businessId: string, userId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  deleteUser: (userId: string) => Promise<void>;
  sendInviteEmail: (payload: { businessId: string; businessName: string; locationCount: number; email: string }) => Promise<void>;
};

export async function inviteBusinessManagerCore(
  deps: BusinessInviteDeps,
  input: { businessId: string; email: string },
): Promise<{ ok: true; userId: string; existing: boolean }> {
  const email = input.email.trim().toLowerCase();

  const business = await deps.loadBusiness(input.businessId);
  if (business.mode !== "one_manager") throw new Error("Set this business to One manager first.");
  if (business.managerUserId) throw new Error("This business already has a manager.");

  let userId: string;
  let existing = false;
  const created = await deps.createUser(email);
  if (created.ok) {
    userId = created.userId;
  } else if (created.emailTaken) {
    const found = await deps.findUserIdByEmail(email);
    if (!found) throw new Error(created.message || "Could not send the invite.");
    userId = found;
    existing = true;
  } else {
    throw new Error(created.message || "Could not send the invite.");
  }

  const linked = await deps.linkManager(input.businessId, userId);
  if (!linked.ok) {
    if (!existing) {
      await deps.deleteUser(userId).catch((err) => {
        console.error("inviteBusinessManager: failed to roll back the new auth user after the link failed", err);
      });
    }
    throw new Error(linked.message);
  }

  try {
    await deps.sendInviteEmail({ businessId: input.businessId, businessName: business.name, locationCount: business.locationCount, email });
  } catch (err) {
    console.error("sendTransactionalEmail(business_invited) failed", err);
  }

  return { ok: true, userId, existing };
}
```

- [ ] **Step 4: Run the core test to verify it passes**

Run: `npx vitest run src/lib/guild/business-invite-core.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Move the account helpers**

Create `src/lib/guild/auth-accounts.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creating or finding a sign-in account for an invite (the member invite
 * and the business invite share this). createUser sends no email of its
 * own (invite-member.server.ts explains why); email_confirm because the
 * Guild admin is vouching for the address.
 */
export async function createAuthUser(
  service: SupabaseClient,
  email: string,
): Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }> {
  const { data: created, error } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (!error && created.user) return { ok: true, userId: created.user.id };
  const message = error?.message ?? "Could not send the invite.";
  const emailTaken =
    (error as { code?: string } | null)?.code === "email_exists" || /already (been )?registered/i.test(message);
  return { ok: false, emailTaken, message };
}

/** The Guild has a few hundred accounts at most; 10 pages of 1000 is plenty. */
export async function findAuthUserIdByEmail(service: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data: list, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = list.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (list.users.length < 1000) return null;
  }
  return null;
}
```

In `src/lib/guild/invite-member.server.ts`, replace the bodies of `createUser(email)` and `findUserIdByEmail(email)` in the deps object with `return createAuthUser(serviceClient, email);` and `return findAuthUserIdByEmail(serviceClient, email);`, importing both from `@/lib/guild/auth-accounts.server`. Run `npx vitest run src/lib/guild` — the existing invite tests still pass.

- [ ] **Step 6: Write `businesses.server.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { createAuthUser, findAuthUserIdByEmail } from "@/lib/guild/auth-accounts.server";
import { inviteBusinessManagerCore } from "@/lib/guild/business-invite-core";
import type { BusinessManagementMode } from "@/lib/supabase/types";

/**
 * The Guild roster's business actions (spec 2026-10-15). Permission checks
 * and audit logging live in the SQL functions (20261016100000); these run
 * on the caller's own session so is_guild_admin() sees the real person.
 */

async function requireGuildAdminSession(): Promise<SupabaseClient> {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("is_guild_admin").eq("id", userData.user.id).maybeSingle();
  if (!profile?.is_guild_admin) throw new Error("Only a Guild admin can do this.");
  return supabase;
}

export const setBusinessMode = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; mode: BusinessManagementMode }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    const { error } = await supabase.rpc("set_business_mode", { p_business_id: data.businessId, p_mode: data.mode });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Part of, for Task 5's Add member too. Emails the manager when a one-manager business gained a location. */
export async function applyMemberBusiness(supabase: SupabaseClient, memberId: string, target: string | null): Promise<void> {
  const { data, error } = await supabase.rpc("set_member_business", { p_member_id: memberId, p_target: target });
  if (error) throw new Error(error.message);
  const result = data as { business_id: string | null; notify_manager_user_id: string | null };
  if (!result.notify_manager_user_id || !result.business_id) return;

  try {
    const service = await getSupabaseServiceRoleClient();
    const [{ data: userData }, { data: business }, { data: member }] = await Promise.all([
      service.auth.admin.getUserById(result.notify_manager_user_id),
      service.from("businesses").select("name").eq("id", result.business_id).single(),
      service.from("members").select("city").eq("id", memberId).single(),
    ]);
    const email = userData?.user?.email;
    if (!email || !business || !member) return;
    await sendTransactionalEmail({
      trigger: "business_location_added",
      memberId,
      businessName: business.name as string,
      city: member.city as string,
      email,
    });
  } catch (err) {
    console.error("sendTransactionalEmail(business_location_added) failed", err);
  }
}

export const setMemberBusiness = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; target: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    await applyMemberBusiness(supabase, data.memberId, data.target);
    return { ok: true as const };
  });

export const inviteBusinessManager = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    const service = await getSupabaseServiceRoleClient();
    const result = await inviteBusinessManagerCore(
      {
        async loadBusiness(businessId) {
          const { data: business, error } = await supabase
            .from("businesses")
            .select("name, management_mode, manager_user_id")
            .eq("id", businessId)
            .single();
          if (error || !business) throw new Error("That business no longer exists.");
          const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("business_id", businessId);
          return {
            name: business.name as string,
            mode: business.management_mode as BusinessManagementMode,
            managerUserId: (business.manager_user_id as string | null) ?? null,
            locationCount: count ?? 0,
          };
        },
        createUser: (email) => createAuthUser(service, email),
        findUserIdByEmail: (email) => findAuthUserIdByEmail(service, email),
        async linkManager(businessId, userId) {
          const { error } = await supabase.rpc("link_business_manager", { p_business_id: businessId, p_user_id: userId });
          return error ? { ok: false as const, message: error.message } : { ok: true as const };
        },
        async deleteUser(userId) {
          await service.auth.admin.deleteUser(userId);
        },
        async sendInviteEmail(payload) {
          await sendTransactionalEmail({ trigger: "business_invited", ...payload });
        },
      },
      { businessId: data.businessId, email: data.email },
    );
    return { ok: true as const, userId: result.userId };
  });
```

- [ ] **Step 7: Type check, run the guild tests, commit**

Run: `npx tsc --noEmit` and `npx vitest run src/lib/guild`
Expected: pass (only the pre-existing survey error). If `src/lib/guild/audit-log-coverage.test.ts` lists files that write tables directly, note `businesses.server.ts` writes only through SQL functions that audit themselves (like `drafts.server.ts`); add a test there mirroring the drafts one:

```ts
  it("businesses.server.ts writes only through the (self-auditing) SQL business functions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/guild/businesses.server.ts"), "utf-8");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    for (const fn of ["set_business_mode", "set_member_business", "link_business_manager"]) {
      expect(source).toContain(`rpc("${fn}"`);
    }
  });
```

```bash
git add src/lib/guild
git commit -m "feat(guild): business mode, Part of and one invite for a one-manager business"
```

---

### Task 4: Roster data and grouping

**Files:**
- Modify: `src/lib/guild/roster.server.ts`
- Create: `src/lib/guild/roster-groups.ts`, `src/lib/guild/roster-groups.test.ts`
- Modify: `src/routes/guild.roster.tsx`

**Interfaces:**
- Produces:
  - `RosterBusiness = { id: string; name: string; mode: BusinessManagementMode; managerEmail: string | null; managerSignedIn: boolean }`
  - `getRoster` returns `RosterData = { entries: RosterEntry[]; businesses: RosterBusiness[] }`
  - `RosterGroup = { kind: "single"; entry: RosterEntry } | { kind: "business"; business: RosterBusiness; entries: RosterEntry[] }`
  - `groupRoster(entries: RosterEntry[], businesses: RosterBusiness[], matches: (entry: RosterEntry) => boolean): RosterGroup[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/guild/roster-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupRoster, type RosterBusiness } from "./roster-groups";
import type { RosterEntry } from "./roster.server";

function entry(id: string, name: string, city: string, businessId: string | null): RosterEntry {
  return {
    member: { id, business_name: name, city, business_id: businessId } as RosterEntry["member"],
    claimState: "unclaimed",
    ownerEmail: null,
  };
}

const hangar: RosterBusiness = { id: "b1", name: "Hangar 24 Brewing Co.", mode: "one_manager", managerEmail: null, managerSignedIn: false };
const all = () => true;

describe("groupRoster", () => {
  const entries = [
    entry("m1", "Hangar 24 Brewing Co.", "Riverside", "b1"),
    entry("m2", "Alpha Brewing", "Chino", null),
    entry("m3", "Hangar 24 Brewing Co.", "Irvine", "b1"),
  ];

  it("one group per business, its locations by city, singles alongside, ordered by name", () => {
    const groups = groupRoster(entries, [hangar], all);
    expect(groups.map((g) => (g.kind === "single" ? g.entry.member.id : g.business.id))).toEqual(["m2", "b1"]);
    const business = groups[1];
    expect(business.kind === "business" && business.entries.map((e) => e.member.city)).toEqual(["Irvine", "Riverside"]);
  });

  it("a search that matches one location keeps the business row with just that location", () => {
    const groups = groupRoster(entries, [hangar], (e) => e.member.city === "Irvine");
    expect(groups).toHaveLength(1);
    expect(groups[0].kind === "business" && groups[0].entries.map((e) => e.member.id)).toEqual(["m3"]);
  });

  it("a filter that matches no location hides the business", () => {
    expect(groupRoster(entries, [hangar], (e) => e.member.id === "m2").map((g) => g.kind)).toEqual(["single"]);
  });

  it("a location whose business isn't in the list shows as a single", () => {
    expect(groupRoster([entry("m1", "X", "Y", "gone")], [], all)[0].kind).toBe("single");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/guild/roster-groups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `roster-groups.ts`**

```ts
import type { BusinessManagementMode } from "@/lib/supabase/types";
import type { RosterEntry } from "@/lib/guild/roster.server";

/** A multi-location business as the roster shows it (spec 2026-10-15; artboard BZ1). */
export type RosterBusiness = {
  id: string;
  name: string;
  mode: BusinessManagementMode;
  managerEmail: string | null;
  managerSignedIn: boolean;
};

export type RosterGroup =
  | { kind: "single"; entry: RosterEntry }
  | { kind: "business"; business: RosterBusiness; entries: RosterEntry[] };

/**
 * Roster rows: a business's matching locations grouped under it (by city),
 * single locations on their own, all ordered by name. `matches` is the
 * search and filters; a business with no matching location is hidden.
 */
export function groupRoster(
  entries: RosterEntry[],
  businesses: RosterBusiness[],
  matches: (entry: RosterEntry) => boolean,
): RosterGroup[] {
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const locations = new Map<string, RosterEntry[]>();
  const groups: RosterGroup[] = [];

  for (const entry of entries) {
    if (!matches(entry)) continue;
    const businessId = entry.member.business_id;
    if (businessId && byId.has(businessId)) {
      const list = locations.get(businessId) ?? [];
      list.push(entry);
      locations.set(businessId, list);
    } else {
      groups.push({ kind: "single", entry });
    }
  }
  for (const [id, list] of locations) {
    groups.push({
      kind: "business",
      business: byId.get(id)!,
      entries: [...list].sort((a, b) => a.member.city.localeCompare(b.member.city)),
    });
  }

  const nameOf = (g: RosterGroup) => (g.kind === "single" ? g.entry.member.business_name : g.business.name);
  return groups.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/guild/roster-groups.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Load businesses in `getRoster`**

In `src/lib/guild/roster.server.ts`: import `type RosterBusiness` from `@/lib/guild/roster-groups` and `type BusinessRow` from types; add `export type RosterData = { entries: RosterEntry[]; businesses: RosterBusiness[] };`; change the handler's return type to `Promise<RosterData>`; after building `entries`, add:

```ts
  const { data: businessRows, error: businessesError } = await supabase.from("businesses").select("*").order("name");
  if (businessesError) throw new Error(businessesError.message);

  const businesses: RosterBusiness[] = [];
  for (const row of (businessRows ?? []) as BusinessRow[]) {
    let managerEmail: string | null = null;
    let managerSignedIn = false;
    if (row.manager_user_id) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(row.manager_user_id);
      managerEmail = userData?.user?.email ?? null;
      managerSignedIn = Boolean(userData?.user?.last_sign_in_at);
    }
    businesses.push({ id: row.id, name: row.name, mode: row.management_mode, managerEmail, managerSignedIn });
  }

  return { entries, businesses };
```

In `src/routes/guild.roster.tsx`: `const { entries, businesses } = Route.useLoaderData();` and pass `businesses={businesses}` to `RosterTable` (Task 5 adds the prop; until then add `businesses: RosterBusiness[]` to `RosterTable`'s props and ignore it so the type check passes).

- [ ] **Step 6: Type check and commit**

Run: `npx tsc --noEmit` and `npx vitest run src/lib/guild`
Expected: pass (survey error only).

```bash
git add src/lib/guild/roster.server.ts src/lib/guild/roster-groups.ts src/lib/guild/roster-groups.test.ts src/routes/guild.roster.tsx src/components/guild/RosterTable.tsx
git commit -m "feat(roster): load businesses and group locations under them"
```

---

### Task 5: Roster screens and Part of on Add member

**Files:**
- Create: `src/components/guild/BusinessRow.tsx`, `src/components/guild/PartOfDialog.tsx`
- Modify: `src/components/guild/RosterTable.tsx`, `src/components/guild/InviteEmailDialog.tsx`, `src/components/guild/CreateMemberDialog.tsx`, `src/lib/guild/create-member.server.ts`
- Test: `src/components/guild/BusinessRow.test.ts`, `src/lib/guild/create-member.server.test.ts` (new, only if the pure part below is extracted — see Step 5)

**Interfaces:**
- Consumes: `groupRoster`, `RosterBusiness` (Task 4); `setBusinessMode`, `setMemberBusiness`, `inviteBusinessManager`, `applyMemberBusiness` (Task 3).
- Produces: UI only.

Match artboard BZ1 (`docs/design/artboards/BizRoster.dc.html`) for look: the business row with its name and "· N locations", the Managed by segmented control, one Invite, indented location rows; the Part of select in Add member.

- [ ] **Step 1: Write the failing BusinessRow render test**

Create `src/components/guild/BusinessRow.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BusinessRow } from "./BusinessRow";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

const base: RosterBusiness = { id: "b1", name: "Hangar 24 Brewing Co.", mode: "one_manager", managerEmail: null, managerSignedIn: false };
const render = (business: RosterBusiness) =>
  renderToStaticMarkup(createElement(BusinessRow, { business, locationCount: 4, busy: false, onModeChange: vi.fn(), onInvite: vi.fn() }));

describe("BusinessRow (artboard BZ1)", () => {
  it("names the business and its location count", () => {
    expect(render(base)).toContain("Hangar 24 Brewing Co.");
    expect(render(base)).toContain("4 locations");
  });

  it("Managed by shows both choices with the current one pressed", () => {
    const html = render(base);
    expect(html).toMatch(/aria-pressed="true"[^>]*>One manager/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Each location separately/);
  });

  it("one-manager with no manager yet: one Invite button", () => {
    expect(render(base)).toContain(">Invite<");
  });

  it("one-manager with a manager: shows who, no Invite", () => {
    const html = render({ ...base, managerEmail: "boss@x.com", managerSignedIn: true });
    expect(html).toContain("boss@x.com");
    expect(html).not.toContain(">Invite<");
  });

  it("separate: no business-level Invite", () => {
    expect(render({ ...base, mode: "separate" })).not.toContain(">Invite<");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/guild/BusinessRow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `BusinessRow.tsx`**

```tsx
import type { BusinessManagementMode } from "@/lib/supabase/types";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

const segmentClass = (active: boolean) =>
  `inline-flex h-10 items-center px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
    active ? "bg-ink text-canvas" : "bg-white text-ink hover:bg-canvas-2"
  }`;

/**
 * A multi-location business's header row on the roster (artboard BZ1): its
 * name and location count, Managed by, and -- one-manager with no manager
 * yet -- the business's single Invite. Its locations render under it.
 */
export function BusinessRow(props: {
  business: RosterBusiness;
  locationCount: number;
  busy: boolean;
  onModeChange: (mode: BusinessManagementMode) => void;
  onInvite: () => void;
}) {
  const { business } = props;
  const oneManager = business.mode === "one_manager";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#E6E0D6] bg-[#FCFAF6] px-4 py-3.5 md:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="truncate text-[15px] font-semibold text-ink">
          {business.name} <span className="font-normal text-ink-muted">· {props.locationCount} locations</span>
        </div>
        {oneManager && (
          <div className="text-xs text-ink-muted">
            {business.managerEmail
              ? `Manager: ${business.managerEmail}${business.managerSignedIn ? "" : " · invited, not signed in"}`
              : "no manager yet"}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Managed by</span>
        <div role="group" aria-label="Managed by" className="inline-flex overflow-hidden rounded-lg border border-canvas-border">
          <button
            type="button"
            aria-pressed={oneManager}
            disabled={props.busy}
            onClick={() => !oneManager && props.onModeChange("one_manager")}
            className={segmentClass(oneManager)}
          >
            One manager
          </button>
          <button
            type="button"
            aria-pressed={!oneManager}
            disabled={props.busy}
            onClick={() => oneManager && props.onModeChange("separate")}
            className={`${segmentClass(!oneManager)} border-l border-canvas-border`}
          >
            Each location separately
          </button>
        </div>
        {oneManager && !business.managerEmail && (
          <button
            type="button"
            onClick={props.onInvite}
            disabled={props.busy}
            className="inline-flex h-10 items-center rounded-lg border border-canvas-border bg-canvas px-[13px] text-xs font-medium text-ink hover:bg-canvas-2 disabled:opacity-60"
          >
            Invite
          </button>
        )}
      </div>
    </div>
  );
}
```

Run: `npx vitest run src/components/guild/BusinessRow.test.ts` — PASS (5 tests).

- [ ] **Step 4: Wire the roster**

In `src/components/guild/InviteEmailDialog.tsx`, add optional props `title?: string` and `description?: string`, used as `{title ?? \`Invite ${businessName}\`}` and `{description ?? "There's no email on file for this member. Enter the address they should sign in with."}`.

In `src/components/guild/RosterTable.tsx`:
- Accept `businesses: RosterBusiness[]`.
- Replace `filtered` with `const groups = useMemo(() => groupRoster(entries, businesses, matches), [...])`, where `matches(entry)` is today's filter body (type, claim state, search on business name or city).
- Extract today's `<li>` body into a local `MemberRow({ entry, indented })` component inside the file (same markup; `indented` adds `md:pl-12` and hides the logo box), and render: for a `single` group, `<MemberRow entry={g.entry} />`; for a `business` group, `<li>` containing `<BusinessRow …/>` followed by a nested `<ul>` of `<MemberRow indented …/>`.
- In a one-manager business, a location's own **Invite** is hidden (`entry.claimState === "unclaimed" && !(inOneManagerBusiness)`).
- `onModeChange(mode)` → `runAction(() => setBusinessMode({ data: { businessId, mode } }), mode === "one_manager" ? \`${name}: one manager\` : \`${name}: each location separately\`)`. Errors from the SQL function (the Part 2 limits) show as the toast via `runAction`'s existing catch.
- `onInvite` → open `InviteEmailDialog` with `title={\`Invite ${business.name}'s manager\`}` and `description="They'll manage every location. Enter the address they should sign in with."`, sending via `inviteBusinessManager({ data: { businessId, email } })`, then `router.invalidate()` and `toast.success(\`Invite sent to ${email}\`)`.
- Row "More" menu: add an item **Part of…** (after "Change member type") that opens `PartOfDialog` for that entry.
- The empty-state text stays.

Create `src/components/guild/PartOfDialog.tsx`: a `Dialog` titled "Part of" with one `<select id="part-of-target">` labeled "Part of", options: `None — a single location` (value `""`), every business by name (value = business id), then every single-location member other than this one as `Group with {name} ({city})` (value = member id); current value preselected (the entry's `business_id ?? ""`). **Save** calls `setMemberBusiness({ data: { memberId, target: value || null } })`, then `router.invalidate()`, `toast.success("Saved")`, close; errors show in a `role="alert"` paragraph (same pattern as `CreateMemberDialog`). Props: `{ entry: RosterEntry | null; businesses: RosterBusiness[]; singles: RosterEntry[]; open: boolean; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 5: Part of on Add member**

`src/lib/guild/create-member.server.ts`: extend `CreateMemberInput` with `partOf?: string | null` (`undefined` = leave it to the name rule; `null` = "None"; a string = business id). After the insert succeeds:

```ts
    if (data.partOf !== undefined) {
      const current = (member as MemberRow).business_id ?? null;
      if (data.partOf !== current) await applyMemberBusiness(supabase, (member as MemberRow).id, data.partOf);
    }
```

(import `applyMemberBusiness` from `@/lib/guild/businesses.server`). Re-select the row afterward (`.from("members").select("*").eq("id", id).single()`) so the returned `MemberRow` has the final `business_id`.

`src/components/guild/CreateMemberDialog.tsx`: accept `businesses: RosterBusiness[]` (RosterTable passes it). Add, after Member type, a `<select id="new-member-part-of">` labeled "Part of" with `None — a single location` (value `""`) and each business by name. Default: the business whose `name` equals the typed business name after trimming (case-sensitive, matching the database's name rule), else `""`; once the admin changes the select by hand, stop auto-following the name. Send `partOf: value === "" ? null : value`.

Note: the name rule no longer joins a one-manager business (Task 1), so a new location joins one only through this select, which links and emails the manager. Choosing **None** for any name therefore always works.

- [ ] **Step 6: Full checks**

Run: `npm test`, `npx tsc --noEmit`
Expected: all pass; only the survey type error.

- [ ] **Step 7: Commit**

```bash
git add src/components/guild src/lib/guild/create-member.server.ts
git commit -m "feat(roster): business rows with Managed by, one Invite, and Part of"
```

---

### Task 6: Docs, apply, and review on staging

**Files:**
- Modify: `docs/member-profiles.md` (roster section; the Transactional email table gains `business_invited` and `business_location_added` rows, worded like the spec's Emails table)

- [ ] **Step 1: Docs and commit**

Add to the roster description: "Multi-location businesses show as one row with their locations under it, a **Managed by** choice (One manager / Each location separately) and, for a one-manager business with no manager yet, one **Invite**. Part 2 limits: switching to one manager only before anyone is invited; switching back only before a manager is invited; a location can't leave a one-manager business. **Part of** is on Add member and in each row's menu." Commit: `docs: roster business rows, Managed by, Part of, business emails`.

- [ ] **Step 2: Ask the owner before applying the migration**

Plain words: "This adds the Guild-only functions for business mode, Part of and the business invite. Nothing members or visitors see changes. OK to apply?" Wait for yes, then `npx supabase migration list --linked` (only `20261016100000` pending) and `npx supabase db push --linked`; then `npm run test:db -- --no-pending supabase/tests/business_functions.test.sql`.

- [ ] **Step 3: Push to staging after the owner's OK**

`git push origin staging`; confirm the staging Worker deployed after the push (`npx wrangler deployments list --name ie-brewers-guild-staging`). Owner checks on staging: `/guild/roster` shows the five businesses as grouped rows (all "Each location separately"); Part of on a sample member; Add member's Part of. **Do not invite a real member's manager yet** — the location switcher is Part 3.
