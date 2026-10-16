# Multi-location Businesses, Part 5: Hand-off, Take-back and Mode Switching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business manager can hand one location to its own location manager (by email invite) and take it back later. A Guild admin can switch any business between One manager and Each location separately, even when its locations already have owners, choosing the manager and whose look to keep. A location can leave a one-manager business. The People page shows the business manager, whom no one there can remove.

**Architecture:** As in Parts 2–4, the database decides. New SECURITY DEFINER functions are `hand_off_location`, `accept_location_handoff` (service role only, called when the invitee signs in), `take_back_location` and `_release_location_from_manager`. `set_business_mode` gains `p_manager_user_id` and loses its Part 2 refusals. `set_member_business` and the delete trigger release a location from its manager instead of refusing. `member_invites.role` may now be `owner`, but only for hand-offs. The app adds business context to the People page, a business-manager flag to the portal session, two dialogs on the roster, and one email.

**Tech Stack:** Supabase Postgres + pgTAP (`npm run test:db`), TanStack Start (createServerFn), React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md`: Roles in `member_users`, Database functions 5–7, Screens → Guild roster (the two boxes) and People page, Emails (`location_handoff_invited`), Error handling. Rollout step 5. Parts 1–4 are on staging.

**Look and layout:** BZ4 `docs/design/artboards/BizPeople.dc.html` (People: "Business manager · all 4 locations" with "You"; "Photos & events editor · Riverside" with Remove; the **Hand off this location** card with "Their email", **Send invite** and "They'll manage Riverside only. You keep access, and the logo, cover and theme stay shared."; after a hand-off, "Location manager · Riverside" and the card "Riverside is handed off / [EMAIL] manages Riverside. You still have access." with **Take back this location**, which confirms "Take back Riverside? / [EMAIL] will no longer be able to edit Riverside, and you'll manage it again." with Cancel / Take back). BZ1 `docs/design/artboards/BizRoster.dc.html` (the boxes "Switch Hangar 24 to one manager" and "Switch to each location separately", copy below).

## Global Constraints

- Who the business manager is comes only from `businesses.manager_user_id`, never from a role. A handed-off location has the location manager as `owner` and the business manager as `editor`.
- Exactly one `owner` per location at all times (the `member_users_one_owner_per_member` index). Every function that changes roles demotes before it promotes.
- Hand-off invites (`member_invites.role = 'owner'`) are created only by `hand_off_location`, by the business manager or a Guild admin. They last 14 days, can be resent no sooner than 5 minutes after the last send, and are accepted only through `accept_location_handoff`.
- Mode switches are refused while a hand-off invite is pending for any of the business's locations, with the message `Cancel the pending hand-off first.`
- To separate: every location keeps its current look and its current owner. The business manager's links on handed-off locations are removed, and `manager_user_id` is cleared.
- The People page never removes the business manager. Only a Guild admin can, by switching the business to separate or taking the location out of it.
- Members outside a one-manager business behave exactly as today. When redefining a function, copy its current definition from the named migration and change only what the task shows.
- Staging and production share one database. Run migrations only after the owner says yes, and run `npm run build` before every push. Production waits for the owner's "go" and the Member Guide update (Part 6).
- Site text is in US English, and touch targets are at least 44px. Every email has one link and `replyTo: MEMBER_INVITE_REPLY_TO`.

### Rulings this plan makes within the spec

1. **Choosing the manager when switching to one manager.** The box lists the locations' current owners' emails plus "Invite someone new". Both paths run the same server function. It finds or creates the account (the rules of `inviteBusinessManagerCore`), then calls `set_business_mode(…, 'one_manager', look_source, manager_user_id)`, which does the mode, the look and the links in one transaction. The `business_invited` email goes to the manager either way. A newly created account is deleted again if the switch fails.
2. **What the manager's links become.** A location with no owner (or one the manager already owns) gets the manager as `owner`. A location someone else owns becomes handed off: the manager is linked as `editor`, and an existing `media_events` link is raised to `editor`.
3. **Leaving a one-manager business** (Part of → another business or None, and the last-but-one location leaving, which dissolves the business) works like switching that location to separate. It keeps its look and owner. The manager's link is removed only where the location was handed off, and a pending hand-off for it is canceled.
4. **The invitee already has access to the location** (for example a Full editor being promoted): accepting raises their existing link to `owner`. An open editor invite to the same address becomes the hand-off invite, since the database allows one open invite per address per location.
5. **The business manager on a handed-off location** (where they are `editor`) still sees and uses the People page. People opens for `role = 'owner'` or the business manager.
6. **A location manager's setup** is the short setup (no Welcome, Type or Theme; logo and cover read-only) even when no other location has finished setup yet. Pre-fill still runs only when another location is set up. Confirm type still opens while the type isn't confirmed (today's short-setup rule).
7. **Where an admin hands off or takes back:** Guild admins use **Edit as them** → `/portal/people`, where they have owner rights. Nothing new on `/admin`, which has no People page today.

## Review Focus

1. **Inviting a Full editor at an address that has a hand-off invite waiting** would turn the hand-off back into an editor invite (invitePerson refreshes an open invite with the new role). Expected: refused with "That address has a hand-off waiting. Cancel it first to invite them as an editor." The test is in Task 3.
2. **The invitee signs in after the Guild switched the business to separate, or after the manager took the location back.** Expected: no owner change, and the stale hand-off invite is canceled. The test is in Task 1 (pgTAP: accept after take-back returns false and cancels).
3. **The business manager tries Remove on themselves, or the location manager tries Remove on the business manager.** Expected: refused by `removePerson`, and no Remove button is shown. The test is in Task 3.
4. **Two hand-offs of the same location to different addresses.** Expected: the second is refused with "A hand-off to x is already waiting. Cancel it first." The test is in Task 1.
5. **A one-manager business of two where one location is taken out.** Expected: the business dissolves, the remaining location keeps its owner, and the manager's editor link on a handed-off remaining location is removed. The test is in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261018100000_location_handoff.sql` (new) | owner role on invites; `_business_audit_as`, `_release_location_from_manager`, `hand_off_location`, `accept_location_handoff`, `take_back_location` |
| `supabase/migrations/20261018110000_business_mode_switching.sql` (new) | `_link_manager_to_location` upgrade rule; `set_business_mode` with a manager; `set_member_business` leaving; delete-trigger release |
| `supabase/tests/location_handoff.test.sql`, `supabase/tests/mode_switching.test.sql` (new); `supabase/tests/business_functions.test.sql` (modify) | pgTAP |
| `src/lib/portal/people.ts` (+ `people.test.ts`), `src/lib/portal/people-store.server.ts` | People rules: business context, labels, who can be removed, hand-off guards |
| `src/lib/portal/portal-access.ts` (+ test), `src/lib/portal/portal-session.server.ts`, `src/lib/portal/portal-sections.ts` (+ test) | `businessManagerUserId` on memberships; `isBusinessManager` on the portal member; People gate; accept hand-offs at sign-in |
| `src/lib/portal/portal-people.server.ts`, `src/lib/email/build-email-content.ts` (+ test), `src/lib/email/resolve-recipient.server.ts` (+ test) | `handOffLocation`, `takeBackLocation`, resend of a hand-off, the `location_handoff_invited` email |
| `src/lib/portal/portal-setup.server.ts` | short setup for a location manager |
| `src/components/portal/PeopleSection.tsx` | BZ4 |
| `src/lib/guild/business-invite-core.ts` (+ test), `src/lib/guild/businesses.server.ts`, `src/lib/guild/roster.server.ts`, `src/lib/guild/roster-groups.ts`, `src/lib/guild/roster-detail.ts` (+ test), `src/components/guild/BusinessModeDialog.tsx` (new), `src/components/guild/RosterTable.tsx`, `src/components/guild/PartOfDialog.tsx`, `src/lib/guild/audit-log-coverage.test.ts` | BZ1 boxes, handed-off line |
| `docs/member-profiles.md` | document, plus the Part 6 Member Guide to-do |

---

### Task 1: Hand-off and take-back in the database

**Files:**
- Create: `supabase/migrations/20261018100000_location_handoff.sql`
- Test: `supabase/tests/location_handoff.test.sql`

**Interfaces:**
- Produces:
  - `hand_off_location(p_member_id uuid, p_email text) returns jsonb {invite_id, email, refreshed}` (authenticated).
  - `accept_location_handoff(p_invite_id uuid, p_user_id uuid) returns boolean` (service_role only).
  - `take_back_location(p_member_id uuid) returns void` (authenticated).
  - `_release_location_from_manager(p_member_id uuid, p_manager uuid) returns void` (internal, used by Task 2).
  - `_business_audit_as(p_actor, p_member_id, p_table, p_row_id, p_action)` (internal).

- [ ] **Step 1: Write the failing pgTAP test**

Fixtures: `_fixtures.psql` users f0..01–06; f0..06 ("nobody") is the business manager here, and f0..05 ("other") is the future location manager. Create `supabase/tests/location_handoff.test.sql`:

```sql
-- Hand-off and take-back (20261018100000_location_handoff.sql): the
-- business manager hands one location to its own manager by invite; the
-- invitee becomes owner and the manager editor; take-back reverses it.
-- Runs inside one transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(25);

insert into public.members (id, slug, member_type, business_name, city, status) values
  ('f1000000-0000-4000-8000-000000000101', 'pgtap-ho-a', 'producer', 'PgTap Hand', 'Redlands', 'draft'),
  ('f1000000-0000-4000-8000-000000000102', 'pgtap-ho-b', 'producer', 'PgTap Hand', 'Riverside', 'draft');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-000000000101';
grant select on _biz to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_business_mode((select id from _biz), 'one_manager');
select public.link_business_manager((select id from _biz), 'f0000000-0000-4000-8000-000000000006');

-- Someone else can't hand off.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-other@example.test') $$,
  '42501', null, 'a member who isn''t the business manager can''t hand off');

-- The manager hands Riverside off.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'not-an-email') $$,
  'P0001', 'Enter a valid email address.', 'a bad address is refused');
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'PGTAP-NOBODY@example.test') $$,
  'P0001', 'You already manage this location.', 'the manager can''t hand off to themselves');
insert into _tap (line) select is(
  public.hand_off_location('f1000000-0000-4000-8000-000000000102', '  PgTap-Other@Example.test ') ->> 'refreshed',
  'false', 'the manager hands off Riverside');
reset role;
insert into _tap (line) select is(
  (select role || ' ' || email from public.member_invites
    where member_id = 'f1000000-0000-4000-8000-000000000102' and accepted_at is null and cancelled_at is null),
  'owner pgtap-other@example.test', 'a pending owner invite, address trimmed and lower-cased');
insert into _tap (line) select ok(
  exists (select 1 from public.audit_log where table_name = 'member_invites'
          and member_id = 'f1000000-0000-4000-8000-000000000102'
          and actor_user_id = 'f0000000-0000-4000-8000-000000000006'),
  'the hand-off is audit-logged against the manager');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') $$,
  'P0001', 'A hand-off to pgtap-other@example.test is already waiting. Cancel it first.',
  'a second hand-off to someone else is refused');
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-other@example.test') $$,
  'P0001', 'An invite just went to pgtap-other@example.test. You can send it again in a few minutes.',
  'resending within five minutes is refused');
reset role;

-- Accepting: wrong user is refused; the right user becomes owner, the manager editor.
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
    'f0000000-0000-4000-8000-000000000001'),
  false, 'someone with a different address can''t accept');
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
    'f0000000-0000-4000-8000-000000000005'),
  true, 'the invitee accepts');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 'owner', 'the invitee is the location''s owner');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'editor', 'the business manager is now its editor');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
  1, 'exactly one owner');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000101'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'owner', 'the manager still owns Redlands');
insert into _tap (line) select ok(
  (select accepted_at is not null from public.member_invites
    where member_id = 'f1000000-0000-4000-8000-000000000102' and role = 'owner'),
  'the invite is marked accepted');

-- A handed-off location can't be handed off again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') $$,
  'P0001', 'PgTap Hand · Riverside is already handed off. Take it back first.',
  'a handed-off location can''t be handed off again');

-- Take-back: the location manager can't; the business manager can.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000102') $$,
  '42501', null, 'the location manager can''t take it back');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000101') $$,
  'P0001', 'PgTap Hand · Redlands isn''t handed off.', 'a location that isn''t handed off can''t be taken back');
insert into _tap (line) select lives_ok(
  $$ select public.take_back_location('f1000000-0000-4000-8000-000000000102') $$,
  'the business manager takes Riverside back');
reset role;
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000006'), 'owner', 'the manager owns Riverside again');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000102'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 0, 'the location manager''s link is gone');

-- An open editor invite to the same address becomes the hand-off; a stale
-- hand-off accepted after a take-back changes nothing and is canceled.
insert into public.member_invites (member_id, email, role, invited_by_user_id, updated_at)
values ('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test', 'editor',
        'f0000000-0000-4000-8000-000000000006', now() - interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into _tap (line) select is(
  public.hand_off_location('f1000000-0000-4000-8000-000000000102', 'pgtap-editor@example.test') ->> 'refreshed',
  'true', 'an open editor invite to the same address becomes the hand-off');
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
     and accepted_at is null and cancelled_at is null and role = 'owner'), 1, 'one open hand-off, no duplicate');
-- The Guild's take-back would refuse (not handed off), so simulate the race: someone else became owner.
update public.member_users set role = 'editor'
  where member_id = 'f1000000-0000-4000-8000-000000000102' and user_id = 'f0000000-0000-4000-8000-000000000006';
insert into public.member_users (member_id, user_id, role)
  values ('f1000000-0000-4000-8000-000000000102', 'f0000000-0000-4000-8000-000000000001', 'owner');
insert into _tap (line) select is(
  public.accept_location_handoff(
    (select id from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
       and role = 'owner' and accepted_at is null and cancelled_at is null),
    'f0000000-0000-4000-8000-000000000002'),
  false, 'a hand-off whose location is already someone else''s is not accepted');
insert into _tap (line) select is(
  (select count(*)::int from public.member_invites where member_id = 'f1000000-0000-4000-8000-000000000102'
     and role = 'owner' and cancelled_at is not null), 1, 'and it is canceled');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:db -- location_handoff`. If the script doesn't take a filter, run `npm run test:db` and read this file's lines.
Expected: FAIL. `function public.hand_off_location(uuid, unknown) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261018100000_location_handoff.sql`:

```sql
-- Multi-location businesses, part 5 (spec 2026-10-15): hand-off and take-back.
--
-- * member_invites.role may be 'owner' -- only for a hand-off, written by
--   hand_off_location (the Worker's People store still writes editor and
--   media_events invites only).
-- * hand_off_location: the business manager (or a Guild admin) invites
--   someone to manage one location. One open hand-off per location; the
--   same address is refreshed (no sooner than 5 minutes after the last
--   send); an open editor invite to that address becomes the hand-off.
-- * accept_location_handoff: run by the Worker (service role) when the
--   invitee signs in. In one transaction the business manager's link
--   becomes editor and the invitee becomes owner. A hand-off that no
--   longer fits (business switched, location taken back or owned by
--   someone else) is canceled instead.
-- * take_back_location: the business manager (or a Guild admin) removes
--   the location manager and owns the location again.

alter table public.member_invites drop constraint member_invites_role_check;
alter table public.member_invites add constraint member_invites_role_check
  check (role in ('owner', 'editor', 'media_events'));

-- Audit with an explicit actor: accept runs on the service role, where
-- auth.uid() is null. Nothing is written without an actor (audit_log
-- requires one).
create or replace function public._business_audit_as(p_actor uuid, p_member_id uuid, p_table text, p_row_id uuid, p_action text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_user_id, member_id, table_name, row_id, action)
  select p_actor, p_member_id, p_table, p_row_id, p_action
  where p_actor is not null;
$$;
revoke all on function public._business_audit_as(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- A location leaving its manager (the business switched to separate, or
-- the location left the business): where it was handed off, the business
-- manager's link goes; a pending hand-off is canceled. A location the
-- manager owns stays theirs.
create or replace function public._release_location_from_manager(p_member_id uuid, p_manager uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.member_users
    where member_id = p_member_id and role = 'owner' and user_id <> p_manager
  ) then
    delete from public.member_users where member_id = p_member_id and user_id = p_manager;
    if found then
      perform public._business_audit_as(auth.uid(), p_member_id, 'member_users', p_member_id, 'delete');
    end if;
  end if;
  update public.member_invites set cancelled_at = now()
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null;
  if found then
    perform public._business_audit_as(auth.uid(), p_member_id, 'member_invites', p_member_id, 'update');
  end if;
end;
$$;
revoke all on function public._release_location_from_manager(uuid, uuid) from public, anon, authenticated;

create or replace function public.hand_off_location(p_member_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_member public.members;
  v_business public.businesses;
  v_owner uuid;
  v_manager_email text;
  v_open public.member_invites;
  v_invite_id uuid;
  v_refreshed boolean := false;
begin
  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'That location no longer exists';
  end if;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found or v_business.management_mode <> 'one_manager' or v_business.manager_user_id is null then
    raise exception 'Only a location of a business with one manager can be handed off.';
  end if;
  if auth.uid() is distinct from v_business.manager_user_id and not public.is_guild_admin() then
    raise exception 'Only the business manager can hand off a location.' using errcode = '42501';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select user_id into v_owner from public.member_users where member_id = p_member_id and role = 'owner';
  if v_owner is not null and v_owner <> v_business.manager_user_id then
    raise exception '% · % is already handed off. Take it back first.', v_business.name, v_member.city;
  end if;
  select lower(btrim(email)) into v_manager_email from auth.users where id = v_business.manager_user_id;
  if v_email = v_manager_email then
    raise exception 'You already manage this location.';
  end if;

  select * into v_open from public.member_invites
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null
  for update;
  if found and lower(v_open.email) <> v_email then
    raise exception 'A hand-off to % is already waiting. Cancel it first.', v_open.email;
  end if;
  if not found then
    -- One open invite per address per location: an editor invite to this
    -- address becomes the hand-off.
    select * into v_open from public.member_invites
    where member_id = p_member_id and lower(email) = v_email and accepted_at is null and cancelled_at is null
    for update;
  end if;

  if v_open.id is not null then
    if v_open.role = 'owner' and v_open.updated_at > now() - interval '5 minutes' then
      raise exception 'An invite just went to %. You can send it again in a few minutes.', v_open.email;
    end if;
    update public.member_invites
    set role = 'owner', expires_at = now() + interval '14 days', invited_by_user_id = auth.uid()
    where id = v_open.id;
    v_invite_id := v_open.id;
    v_refreshed := true;
  else
    insert into public.member_invites (member_id, email, role, invited_by_user_id)
    values (p_member_id, v_email, 'owner', auth.uid())
    returning id into v_invite_id;
  end if;

  perform public._business_audit(p_member_id, 'member_invites', v_invite_id,
    case when v_refreshed then 'update' else 'insert' end);
  return jsonb_build_object('invite_id', v_invite_id, 'email', v_email, 'refreshed', v_refreshed);
end;
$$;

create or replace function public.accept_location_handoff(p_invite_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.member_invites;
  v_member public.members;
  v_business public.businesses;
  v_user_email text;
begin
  select * into v_invite from public.member_invites where id = p_invite_id for update;
  if not found or v_invite.role <> 'owner' or v_invite.accepted_at is not null
     or v_invite.cancelled_at is not null or v_invite.expires_at <= now() then
    return false;
  end if;
  select lower(btrim(email)) into v_user_email from auth.users where id = p_user_id;
  if v_user_email is distinct from lower(btrim(v_invite.email)) then
    return false;
  end if;

  select * into v_member from public.members where id = v_invite.member_id;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found
     or v_business.management_mode <> 'one_manager'
     or v_business.manager_user_id is null
     or v_business.manager_user_id = p_user_id
     or exists (
       select 1 from public.member_users
       where member_id = v_member.id and role = 'owner' and user_id <> v_business.manager_user_id
     ) then
    update public.member_invites set cancelled_at = now() where id = p_invite_id;
    return false;
  end if;

  -- Demote before promoting: one owner per location.
  update public.member_users set role = 'editor'
  where member_id = v_member.id and user_id = v_business.manager_user_id;
  if not found then
    insert into public.member_users (member_id, user_id, role)
    values (v_member.id, v_business.manager_user_id, 'editor');
  end if;
  insert into public.member_users (member_id, user_id, role)
  values (v_member.id, p_user_id, 'owner')
  on conflict (member_id, user_id) do update set role = 'owner';

  update public.member_invites set accepted_at = now(), accepted_user_id = p_user_id where id = p_invite_id;
  perform public._business_audit_as(p_user_id, v_member.id, 'member_users', v_member.id, 'update');
  return true;
end;
$$;

create or replace function public.take_back_location(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_business public.businesses;
  v_owner uuid;
begin
  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'That location no longer exists';
  end if;
  select * into v_business from public.businesses where id = v_member.business_id for update;
  if not found or v_business.management_mode <> 'one_manager' or v_business.manager_user_id is null then
    raise exception 'Only a location of a business with one manager can be taken back.';
  end if;
  if auth.uid() is distinct from v_business.manager_user_id and not public.is_guild_admin() then
    raise exception 'Only the business manager can take back a location.' using errcode = '42501';
  end if;

  select user_id into v_owner from public.member_users where member_id = p_member_id and role = 'owner';
  if v_owner is null or v_owner = v_business.manager_user_id then
    raise exception '% · % isn''t handed off.', v_business.name, v_member.city;
  end if;

  delete from public.member_users where member_id = p_member_id and user_id = v_owner;
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'delete');
  update public.member_users set role = 'owner'
  where member_id = p_member_id and user_id = v_business.manager_user_id;
  if not found then
    insert into public.member_users (member_id, user_id, role)
    values (p_member_id, v_business.manager_user_id, 'owner');
  end if;
  perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');

  update public.member_invites set cancelled_at = now()
  where member_id = p_member_id and role = 'owner' and accepted_at is null and cancelled_at is null;
end;
$$;

revoke all on function public.hand_off_location(uuid, text) from public, anon;
revoke all on function public.take_back_location(uuid) from public, anon;
revoke all on function public.accept_location_handoff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hand_off_location(uuid, text) to authenticated;
grant execute on function public.take_back_location(uuid) to authenticated;
grant execute on function public.accept_location_handoff(uuid, uuid) to service_role;
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test:db`
Expected: `location_handoff.test.sql` reports 25/25 ok, and every other file still passes (pending migrations are spliced in; nothing is committed).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261018100000_location_handoff.sql supabase/tests/location_handoff.test.sql
git commit -m "feat(db): hand off a location and take it back"
```

---

### Task 2: Full mode switching and leaving a one-manager business

**Files:**
- Create: `supabase/migrations/20261018110000_business_mode_switching.sql`
- Create: `supabase/tests/mode_switching.test.sql`
- Modify: `supabase/tests/business_functions.test.sql` (the two Part 2 refusals)

**Interfaces:**
- Consumes: `_release_location_from_manager`, `_business_audit_as` (Task 1); `_copy_shared_look`, `_shared_look_source` (Part 4).
- Produces: `set_business_mode(p_business_id uuid, p_mode text, p_look_source uuid default null, p_manager_user_id uuid default null) returns void`. The 3-argument version is dropped.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/mode_switching.test.sql`:

```sql
-- Mode switching with existing owners, and leaving a one-manager business
-- (20261018110000_business_mode_switching.sql). Runs inside one
-- transaction that is rolled back.
begin;
\ir _fixtures.psql

insert into _tap (line) select plan(21);

-- Three locations: Redlands owned by f0..01, Riverside owned by f0..05
-- (with f0..03 as its Photos & events editor), Irvine unclaimed.
insert into public.members (id, slug, member_type, business_name, city, status, theme) values
  ('f1000000-0000-4000-8000-000000000201', 'pgtap-sw-a', 'producer', 'PgTap Switch', 'Redlands', 'draft', 'forest'),
  ('f1000000-0000-4000-8000-000000000202', 'pgtap-sw-b', 'producer', 'PgTap Switch', 'Riverside', 'draft', 'garnet'),
  ('f1000000-0000-4000-8000-000000000203', 'pgtap-sw-c', 'producer', 'PgTap Switch', 'Irvine', 'draft', 'olive');
insert into public.member_users (member_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-000000000001', 'owner'),
  ('f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000005', 'owner'),
  ('f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000001', 'media_events');
create temp table _biz on commit drop as
  select business_id as id from public.members where id = 'f1000000-0000-4000-8000-000000000201';
grant select on _biz to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager', null, 'f0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a member can''t switch the mode');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate', null, 'f0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'A manager is chosen only when switching to one manager.', 'a manager with separate is refused');

-- Redlands' owner becomes the manager; Riverside's look is kept.
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager',
       'f1000000-0000-4000-8000-000000000202', 'f0000000-0000-4000-8000-000000000001') $$,
  'guild admin: switches a business with owners to one manager');
reset role;
insert into _tap (line) select is(
  (select manager_user_id from public.businesses where id = (select id from _biz)),
  'f0000000-0000-4000-8000-000000000001'::uuid, 'the manager is recorded');
insert into _tap (line) select is(
  (select string_agg(theme, ',' order by city) from public.members where business_id = (select id from _biz)),
  'garnet,garnet,garnet', 'every location takes the chosen look');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000201'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager keeps owning Redlands');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000005'), 'owner', 'Riverside''s owner stays its owner (handed off)');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'editor', 'the manager''s Photos & events link is raised to editor');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager owns the unclaimed Irvine');

-- A pending hand-off blocks switching back.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.hand_off_location('f1000000-0000-4000-8000-000000000203', 'pgtap-editor@example.test');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$,
  'P0001', 'Cancel the pending hand-off first.', 'a pending hand-off blocks the switch');
reset role;
update public.member_invites set cancelled_at = now()
  where member_id = 'f1000000-0000-4000-8000-000000000203' and role = 'owner';

-- Back to separate: owners and looks stay; the manager's handed-off link goes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$,
  'guild admin: switches back to each location separately');
reset role;
insert into _tap (line) select is(
  (select management_mode || ' ' || coalesce(manager_user_id::text, 'none') from public.businesses where id = (select id from _biz)),
  'separate none', 'separate, no manager');
insert into _tap (line) select is(
  (select count(*)::int from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 0, 'the manager''s link on handed-off Riverside is removed');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager still owns Irvine');
insert into _tap (line) select is(
  (select theme from public.members where id = 'f1000000-0000-4000-8000-000000000201'), 'garnet',
  'each location keeps its current look');

-- Leaving a one-manager business: back to one manager (f0..01), Riverside leaves.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_business_mode((select id from _biz), 'one_manager', null, 'f0000000-0000-4000-8000-000000000001');
insert into _tap (line) select lives_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-000000000202', null) $$,
  'a handed-off location can leave a one-manager business');
reset role;
insert into _tap (line) select is(
  (select business_id from public.members where id = 'f1000000-0000-4000-8000-000000000202'), null,
  'Riverside is a single location');
insert into _tap (line) select is(
  (select string_agg(role, ',') from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000202'),
  'owner', 'Riverside keeps its owner and loses the manager''s link');

-- Two left; Redlands is handed off; Irvine leaves, so the business dissolves.
update public.member_users set role = 'editor'
  where member_id = 'f1000000-0000-4000-8000-000000000201' and user_id = 'f0000000-0000-4000-8000-000000000001';
insert into public.member_users (member_id, user_id, role)
  values ('f1000000-0000-4000-8000-000000000201', 'f0000000-0000-4000-8000-000000000002', 'owner');
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.set_member_business('f1000000-0000-4000-8000-000000000203', null);
reset role;
insert into _tap (line) select is(
  (select count(*)::int from public.businesses where id = (select id from _biz)), 0, 'the business dissolves');
insert into _tap (line) select is(
  (select string_agg(user_id::text || ':' || role, ',') from public.member_users
    where member_id = 'f1000000-0000-4000-8000-000000000201'),
  'f0000000-0000-4000-8000-000000000002:owner',
  'the remaining handed-off location keeps its owner and loses the manager''s link');
insert into _tap (line) select is(
  (select role from public.member_users where member_id = 'f1000000-0000-4000-8000-000000000203'
     and user_id = 'f0000000-0000-4000-8000-000000000001'), 'owner', 'the manager keeps the location that left');

insert into _tap (line) select * from finish();
select line as tap from _tap order by n;
rollback;
```

In `supabase/tests/business_functions.test.sql`, replace the two Part 2 refusals:

```sql
-- Part 2 limits: back to separate refused once a manager exists.
insert into _tap (line) select throws_ok(
  $$ select public.set_business_mode((select id from _biz), 'separate') $$, 'P0001', null,
  'switching back after a manager is invited is refused in part 2');
```

with

```sql
-- Since part 5, switching back is allowed (mode_switching.test.sql covers it); the
-- manager isn't changed by a no-op switch to the same mode.
insert into _tap (line) select lives_ok(
  $$ select public.set_business_mode((select id from _biz), 'one_manager') $$,
  'switching to the mode it already has is a no-op');
```

and

```sql
-- Leaving a one-manager business is refused in part 2.
insert into _tap (line) select throws_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', null) $$, 'P0001', null,
  'leaving a one-manager business is refused in part 2');
```

with

```sql
-- Since part 5 a location can leave a one-manager business; the manager keeps the one they own.
insert into _tap (line) select lives_ok(
  $$ select public.set_member_business('f1000000-0000-4000-8000-0000000000b4', null) $$,
  'a location can leave a one-manager business');
```

Keep `plan(26)`, since the count doesn't change. Update the file's header comment to say part 5 lifts these limits.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:db`
Expected: FAIL in `mode_switching.test.sql`. `function public.set_business_mode(uuid, unknown, unknown, unknown) does not exist` (or the old "already have people signed up" refusal).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261018110000_business_mode_switching.sql`:

```sql
-- Multi-location businesses, part 5 (spec 2026-10-15): full mode switching.
--
-- * _link_manager_to_location: an existing link is raised (to owner where
--   the location has no other owner, else media_events -> editor).
-- * set_business_mode gains p_manager_user_id: to one manager it now also
--   works when locations already have owners (they keep them; those
--   locations become handed off), sets the manager and links them in the
--   same transaction. To separate it clears the manager and releases each
--   location (_release_location_from_manager). Both refuse while a
--   hand-off is pending.
-- * set_member_business: a location may leave a one-manager business; it
--   is released from the manager first (and so is the last location of a
--   business that dissolves).
-- * The delete trigger releases a dissolving business's last location too.

create or replace function public._link_manager_to_location(p_member_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_other_owner boolean;
begin
  select role into v_role from public.member_users where member_id = p_member_id and user_id = p_user_id;
  v_other_owner := exists (
    select 1 from public.member_users
    where member_id = p_member_id and role = 'owner' and user_id <> p_user_id
  );
  if v_role is null then
    insert into public.member_users (member_id, user_id, role)
    values (p_member_id, p_user_id, case when v_other_owner then 'editor' else 'owner' end);
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'insert');
  elsif v_role <> 'owner' and not v_other_owner then
    update public.member_users set role = 'owner' where member_id = p_member_id and user_id = p_user_id;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');
  elsif v_role = 'media_events' then
    update public.member_users set role = 'editor' where member_id = p_member_id and user_id = p_user_id;
    perform public._business_audit(p_member_id, 'member_users', p_member_id, 'update');
  end if;
end;
$$;
revoke all on function public._link_manager_to_location(uuid, uuid) from public, anon, authenticated;

drop function public.set_business_mode(uuid, text, uuid);

create or replace function public.set_business_mode(
  p_business_id uuid,
  p_mode text,
  p_look_source uuid default null,
  p_manager_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses;
  v_source uuid;
  v_member uuid;
begin
  perform public._require_guild_admin();
  if p_mode not in ('separate', 'one_manager') then
    raise exception 'Unknown management mode: %', p_mode;
  end if;
  if p_mode = 'separate' and p_manager_user_id is not null then
    raise exception 'A manager is chosen only when switching to one manager.';
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'That business no longer exists';
  end if;
  if v_business.management_mode = p_mode then
    return;
  end if;
  if exists (
    select 1 from public.member_invites i
    join public.members m on m.id = i.member_id
    where m.business_id = p_business_id and i.role = 'owner'
      and i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
  ) then
    raise exception 'Cancel the pending hand-off first.';
  end if;

  if p_mode = 'separate' then
    update public.businesses set management_mode = 'separate', manager_user_id = null where id = p_business_id;
    perform public._business_audit(null, 'businesses', p_business_id, 'update');
    if v_business.manager_user_id is not null then
      for v_member in select id from public.members where business_id = p_business_id loop
        perform public._release_location_from_manager(v_member, v_business.manager_user_id);
      end loop;
    end if;
    return;
  end if;

  -- One manager: every location takes one location's look -- the one the
  -- Guild chose, else the first set up, else the oldest (part 4).
  if p_look_source is not null
     and not exists (select 1 from public.members where id = p_look_source and business_id = p_business_id) then
    raise exception 'Choose a location of this business for the logo, cover and theme.';
  end if;
  update public.businesses set management_mode = 'one_manager', manager_user_id = p_manager_user_id
  where id = p_business_id;
  perform public._business_audit(null, 'businesses', p_business_id, 'update');

  v_source := coalesce(
    (select id from public.members where id = p_look_source and business_id = p_business_id),
    (select id from public.members where business_id = p_business_id and setup_completed_at is not null order by setup_completed_at limit 1),
    (select id from public.members where business_id = p_business_id order by created_at limit 1)
  );
  if v_source is not null then
    for v_member in select id from public.members where business_id = p_business_id and id <> v_source loop
      perform public._copy_shared_look(v_source, v_member);
      perform public._business_audit(v_member, 'members', v_member, 'update');
    end loop;
  end if;

  if p_manager_user_id is not null then
    for v_member in select id from public.members where business_id = p_business_id loop
      perform public._link_manager_to_location(v_member, p_manager_user_id);
    end loop;
  end if;
end;
$$;

revoke all on function public.set_business_mode(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.set_business_mode(uuid, text, uuid, uuid) to authenticated;
```

Then, in the same file, redefine `public.set_member_business(p_member_id uuid, p_target uuid) returns jsonb`. Copy its whole definition from `supabase/migrations/20261017110000_shared_look_publish.sql` and make exactly two changes:

1. Replace the "Leaving the current business" block:

```sql
  -- Leaving the current business.
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' then
      raise exception 'Switch the business to each location separately first';
    end if;
  end if;
```

with

```sql
  -- Leaving the current business: a one-manager business lets the
  -- location go the way switching to separate would (part 5).
  if v_member.business_id is not null then
    select * into v_current from public.businesses where id = v_member.business_id for update;
    if v_current.management_mode = 'one_manager' and v_current.manager_user_id is not null then
      perform public._release_location_from_manager(p_member_id, v_current.manager_user_id);
    end if;
  end if;
```

2. In the dissolve loop, release each remaining location before clearing its business:

```sql
      for v_left in select id from public.members where business_id = v_member.business_id loop
        if v_current.management_mode = 'one_manager' and v_current.manager_user_id is not null then
          perform public._release_location_from_manager(v_left, v_current.manager_user_id);
        end if;
        update public.members set business_id = null where id = v_left;
        perform public._business_audit(v_left, 'members', v_left, 'update');
      end loop;
```

End with the same `revoke all … from public, anon;` and `grant execute … to authenticated;` lines for `set_member_business(uuid, uuid)`.

Last, redefine `public.members_dissolve_business_after_delete()`. Copy it from `20261016100000_business_functions.sql` and add, right before the `for v_left` loop:

```sql
  select * into v_business from public.businesses where id = old.business_id;
```

with `v_business public.businesses;` declared. Inside the loop, first:

```sql
    if v_business.management_mode = 'one_manager' and v_business.manager_user_id is not null then
      perform public._release_location_from_manager(v_left, v_business.manager_user_id);
    end if;
```

Keep `revoke all on function public.members_dissolve_business_after_delete() from public, anon, authenticated;`. The trigger itself stays, since `create or replace function` keeps it attached.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test:db`
Expected: `mode_switching.test.sql` reports 21/21, `business_functions.test.sql` 26/26, `shared_look.test.sql` (which calls `set_business_mode` with 2 and 3 positional arguments) still 80/80, and every other file passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261018110000_business_mode_switching.sql supabase/tests/mode_switching.test.sql supabase/tests/business_functions.test.sql
git commit -m "feat(db): switch a business's mode with owners in place; locations can leave"
```

---

### Task 3: People rules: business manager, location manager, hand-off guards

**Files:**
- Modify: `src/lib/portal/people.ts`
- Modify: `src/lib/portal/people-store.server.ts`
- Test: `src/lib/portal/people.test.ts`

**Interfaces:**
- Produces (people.ts):
  - `export type OpenInviteRole = InviteRole | "owner"`; `InviteRecord.role` and `InviteView.role` become `OpenInviteRole`; `isOpenInviteRole(value)`.
  - `export type PeopleBusiness = { name: string; city: string; locationCount: number; managerUserId: string | null }`.
  - `PeopleStore.businessFor(memberId: string): Promise<PeopleBusiness | null>` (one-manager businesses only).
  - `PersonView` gains `label: string` (`"Business manager · all 4 locations"`, `"Location manager · Riverside"`, `"Full editor · Riverside"`, `"Photos & events editor · Riverside"`; outside a business, `"Owner"`, `"Full editor"` or `"Photos & events"` as today) and `isBusinessManager: boolean`.
  - `PeopleView` gains `business: PeopleBusinessView | null`, where `PeopleBusinessView = { name; city; locationCount; viewerIsManager: boolean; locationManagerEmail: string | null; handOffPending: boolean; canHandOff: boolean; canTakeBack: boolean }`.
  - `loadPeople(store, memberId, viewerUserId, now?, options?: { viewerIsGuildAdmin?: boolean })`.
  - `removePerson` refuses the business manager. `invitePerson` refuses an address with an open hand-off.

- [ ] **Step 1: Write the failing tests**

`people.test.ts` already has a fake store. Read it first and extend that fake with `businessFor` (default `null`), so the existing tests are unchanged. Add:

```ts
describe("People in a one-manager business (spec 2026-10-15, BZ4)", () => {
  const business = { name: "Hangar 24", city: "Riverside", locationCount: 4, managerUserId: "u-boss" };

  function storeWith(users: MemberUserRecord[], invites: InviteRecord[] = []) {
    return fakeStore({
      users,
      invites,
      emails: { "u-boss": "boss@x.com", "u-loc": "loc@x.com", "u-ed": "ed@x.com" },
      business,
    });
  }

  it("labels the business manager and can't remove them", async () => {
    const store = storeWith([
      { userId: "u-boss", role: "owner", createdAt: "2026-01-01" },
      { userId: "u-ed", role: "media_events", createdAt: "2026-01-02" },
    ]);
    const view = await loadPeople(store, "m1", "u-boss");
    expect(view.people.map((p) => [p.label, p.canRemove])).toEqual([
      ["Business manager · all 4 locations", false],
      ["Photos & events editor · Riverside", true],
    ]);
    expect(view.business).toMatchObject({ viewerIsManager: true, canHandOff: true, canTakeBack: false });
  });

  it("after a hand-off: location manager first-ranked after the manager, Take back offered", async () => {
    const store = storeWith([
      { userId: "u-boss", role: "editor", createdAt: "2026-01-01" },
      { userId: "u-loc", role: "owner", createdAt: "2026-02-01" },
    ]);
    const view = await loadPeople(store, "m1", "u-boss");
    expect(view.people.map((p) => p.label)).toEqual([
      "Business manager · all 4 locations",
      "Location manager · Riverside",
    ]);
    expect(view.business).toMatchObject({
      locationManagerEmail: "loc@x.com",
      canHandOff: false,
      canTakeBack: true,
    });
  });

  it("the location manager sees no hand-off or take-back", async () => {
    const store = storeWith([
      { userId: "u-boss", role: "editor", createdAt: "2026-01-01" },
      { userId: "u-loc", role: "owner", createdAt: "2026-02-01" },
    ]);
    const view = await loadPeople(store, "m1", "u-loc");
    expect(view.business).toMatchObject({ viewerIsManager: false, canHandOff: false, canTakeBack: false });
  });

  it("a Guild admin editing as them acts as the manager", async () => {
    const store = storeWith([{ userId: "u-boss", role: "owner", createdAt: "2026-01-01" }]);
    const view = await loadPeople(store, "m1", "u-admin", new Date(), { viewerIsGuildAdmin: true });
    expect(view.business?.canHandOff).toBe(true);
  });

  it("a pending hand-off hides the hand-off form and shows as Location manager", async () => {
    const store = storeWith(
      [{ userId: "u-boss", role: "owner", createdAt: "2026-01-01" }],
      [{ id: "i1", email: "new@x.com", role: "owner", expiresAt: "2099-01-01", createdAt: "2026-03-01", updatedAt: "2026-03-01" }],
    );
    const view = await loadPeople(store, "m1", "u-boss");
    expect(view.business).toMatchObject({ handOffPending: true, canHandOff: false });
    expect(view.invites[0].role).toBe("owner");
  });

  it("removePerson refuses the business manager", async () => {
    const store = storeWith([
      { userId: "u-boss", role: "editor", createdAt: "2026-01-01" },
      { userId: "u-loc", role: "owner", createdAt: "2026-02-01" },
    ]);
    await expect(removePerson(store, { memberId: "m1", userId: "u-boss" })).rejects.toThrow(
      "The business manager can't be removed here. To change who manages Hangar 24, contact the Guild.",
    );
  });

  it("invitePerson refuses an address that has a hand-off waiting", async () => {
    const store = storeWith(
      [{ userId: "u-boss", role: "owner", createdAt: "2026-01-01" }],
      [{ id: "i1", email: "new@x.com", role: "owner", expiresAt: "2099-01-01", createdAt: "2026-03-01", updatedAt: "2026-03-01" }],
    );
    await expect(
      invitePerson(store, { memberId: "m1", email: "NEW@x.com", role: "editor", invitedByUserId: "u-boss" }),
    ).rejects.toThrow("That address has a hand-off waiting. Cancel it first to invite them as an editor.");
  });
});
```

If the existing fake has a different shape, adapt `fakeStore` once (for example an options object with `users`, `invites`, `emails`, `business`) and keep every existing test's expectations the same.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/portal/people.test.ts`
Expected: FAIL (`label` undefined, `business` undefined, no refusal).

- [ ] **Step 3: Implement**

In `people.ts`:

```ts
/** Open invites may also be a hand-off (owner), made by the business manager in SQL. */
export type OpenInviteRole = InviteRole | "owner";

export function isOpenInviteRole(value: unknown): value is OpenInviteRole {
  return value === "owner" || isInviteRole(value);
}

/** The one-manager business a location is part of, as People needs it. */
export type PeopleBusiness = { name: string; city: string; locationCount: number; managerUserId: string | null };

export type PeopleBusinessView = {
  name: string;
  city: string;
  locationCount: number;
  /** The business manager, or a Guild admin editing as them. */
  viewerIsManager: boolean;
  /** Set once the location is handed off. */
  locationManagerEmail: string | null;
  handOffPending: boolean;
  canHandOff: boolean;
  canTakeBack: boolean;
};
```

Change `InviteRecord.role`, `InviteView.role` and `InvitePatch.role` to `OpenInviteRole`. `invitePerson` still only creates `InviteRole` and keeps its return type. Add to `PeopleStore`:

```ts
  /** The location's business when it is managed by one manager; null otherwise. */
  businessFor(memberId: string): Promise<PeopleBusiness | null>;
```

Labels:

```ts
const PLAIN_LABEL: Record<PortalRole, string> = { owner: "Owner", editor: "Full editor", media_events: "Photos & events" };

function personLabel(role: PortalRole, isManager: boolean, business: PeopleBusiness | null): string {
  if (!business) return PLAIN_LABEL[role];
  if (isManager) return `Business manager · all ${business.locationCount} locations`;
  if (role === "owner") return `Location manager · ${business.city}`;
  return `${role === "editor" ? "Full editor" : "Photos & events editor"} · ${business.city}`;
}
```

`loadPeople`: read `store.businessFor(memberId)` alongside the users and invites. Sort the business manager first, then by `ROLE_ORDER`, then by `createdAt`. Each person gets `isBusinessManager = business?.managerUserId === user.userId`, `label`, and `canRemove: user.role !== "owner" && !isBusinessManager`. Then:

```ts
  let businessView: PeopleBusinessView | null = null;
  if (business) {
    const owner = users.find((user) => user.role === "owner");
    const handedOff = Boolean(owner && business.managerUserId && owner.userId !== business.managerUserId);
    const handOffPending = invites.some((invite) => invite.role === "owner");
    const viewerIsManager =
      Boolean(options.viewerIsGuildAdmin) || (business.managerUserId !== null && business.managerUserId === viewerUserId);
    businessView = {
      name: business.name,
      city: business.city,
      locationCount: business.locationCount,
      viewerIsManager,
      locationManagerEmail: handedOff ? (people.find((p) => p.userId === owner!.userId)?.email ?? null) : null,
      handOffPending,
      canHandOff: viewerIsManager && business.managerUserId !== null && !handedOff && !handOffPending,
      canTakeBack: viewerIsManager && handedOff,
    };
  }
```

`removePerson`: after finding the target, check the manager before the owner:

```ts
  const business = await store.businessFor(input.memberId);
  if (business?.managerUserId === target.userId) {
    throw new Error(`The business manager can't be removed here. To change who manages ${business.name}, contact the Guild.`);
  }
```

`invitePerson`: after the `open` lookup, before the cooldown:

```ts
  if (open?.role === "owner") {
    throw new Error("That address has a hand-off waiting. Cancel it first to invite them as an editor.");
  }
```

Update the file's header comment with the new rules (the business manager, the hand-off invites written in SQL, and no Remove for the business manager).

In `people-store.server.ts`: `toInvite` uses `isOpenInviteRole`. `deleteMemberUser` keeps `.neq("role", "owner")`. Add:

```ts
    async businessFor(memberId) {
      const { data, error } = await service
        .from("members")
        .select("city, business_id, businesses(name, management_mode, manager_user_id)")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as {
        city: string;
        business_id: string | null;
        businesses: { name: string; management_mode: string; manager_user_id: string | null } | null;
      } | null;
      const business = Array.isArray(row?.businesses) ? row?.businesses[0] : row?.businesses;
      if (!row?.business_id || !business || business.management_mode !== "one_manager") return null;
      const { count, error: countError } = await service
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", row.business_id);
      if (countError) throw new Error(countError.message);
      return { name: business.name, city: row.city, locationCount: count ?? 0, managerUserId: business.manager_user_id };
    },
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/lib/portal/people.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors. Fix any `InviteRole`/`OpenInviteRole` mismatches that tsc reports in `PeopleSection.tsx` by widening its `ROLE_LABEL` lookups; Task 5 restyles the component.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/people.ts src/lib/portal/people-store.server.ts src/lib/portal/people.test.ts
git commit -m "feat(portal): People knows the business manager and hand-offs"
```

---

### Task 4: Portal plumbing: the business-manager flag, server actions, accepting at sign-in, the email

**Files:**
- Modify: `src/lib/portal/portal-access.ts` (+ `portal-access.test.ts`)
- Modify: `src/lib/portal/portal-session.server.ts`
- Modify: `src/lib/portal/portal-sections.ts` (+ `portal-sections.test.ts`)
- Modify: `src/lib/portal/portal-shell.server.ts` (People loader)
- Modify: `src/lib/portal/portal-people.server.ts`
- Modify: `src/lib/portal/portal-setup.server.ts`
- Modify: `src/lib/email/build-email-content.ts` (+ test), `src/lib/email/resolve-recipient.server.ts` (+ test)

**Interfaces:**
- Consumes: `hand_off_location`, `take_back_location`, `accept_location_handoff` (Task 1); `loadPeople(…, { viewerIsGuildAdmin })` (Task 3).
- Produces:
  - `PortalMembership.businessManagerUserId: string | null`; `PortalState.ready.isBusinessManager: boolean`.
  - `canOpenPortalSection(section, viewer: { role; memberType; isBusinessManager?: boolean })`.
  - `handOffLocation({ email }) → { email, refreshed, emailSent }` and `takeBackLocation() → { ok: true }` (server fns in `portal-people.server.ts`).
  - The email payload `{ trigger: "location_handoff_invited"; memberId; businessName; city; email; managerLabel: string }`.

- [ ] **Step 1: Write the failing tests**

`portal-sections.test.ts`:

```ts
it("People opens for the business manager on a handed-off location (editor role)", () => {
  expect(canOpenPortalSection("people", { role: "editor", memberType: "producer", isBusinessManager: true })).toBe(true);
  expect(canOpenPortalSection("people", { role: "editor", memberType: "producer" })).toBe(false);
});
```

`portal-access.test.ts`: there is an `acceptPendingInvites` fake client. Add a case where the pending invite has `role: "owner"`. It must call `client.rpc("accept_location_handoff", { p_invite_id, p_user_id })`, must not insert into `member_users`, and reports it as accepted only when the rpc returns `true`:

```ts
it("accepts a hand-off through accept_location_handoff, never a direct insert", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const client = fakeInviteClient({
    invites: [{ id: "i1", member_id: "m1", role: "owner", email: "loc@x.com", expires_at: "2099-01-01T00:00:00Z" }],
    rpc,
  });
  const result = await acceptPendingInvites(client, { id: "u1", email: "LOC@x.com" }, new Date("2026-10-17"));
  expect(rpc).toHaveBeenCalledWith("accept_location_handoff", { p_invite_id: "i1", p_user_id: "u1" });
  expect(client.insertedMemberUsers).toEqual([]);
  expect(result.accepted).toEqual([{ memberId: "m1", role: "owner" }]);
});

it("a refused hand-off isn't reported as accepted", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
  const client = fakeInviteClient({
    invites: [{ id: "i1", member_id: "m1", role: "owner", email: "loc@x.com", expires_at: "2099-01-01T00:00:00Z" }],
    rpc,
  });
  expect((await acceptPendingInvites(client, { id: "u1", email: "loc@x.com" })).accepted).toEqual([]);
});
```

Extend the existing fake (whatever it is named) with `rpc` and a record of inserted `member_users` rows. Keep the existing tests unchanged.

`build-email-content.test.ts`:

```ts
describe("buildEmailContent: location_handoff_invited (spec 2026-10-15)", () => {
  const payload = {
    trigger: "location_handoff_invited" as const,
    memberId: "m2",
    businessName: "Hangar 24 Brewing Co.",
    city: "Riverside",
    email: "loc@hangar24.example",
    managerLabel: "boss@hangar24.example",
  };

  it("names the manager, the business and the city; one sign-in link; 14 days", () => {
    const content = buildEmailContent(payload);
    expect(content.subject).toBe("You're invited to manage Hangar 24 Brewing Co. · Riverside");
    expect(content.text).toContain(
      "boss@hangar24.example asked you to manage Hangar 24 Brewing Co. · Riverside on the ISC Brewers Guild member directory.",
    );
    expect(content.text).toContain("The invitation lasts 14 days.");
    expect(content.text).toContain(`${SITE_URL}/signin?next=/portal`);
    expect(content.html.match(/<a /g)).toHaveLength(1);
    expect(content.replyTo).toBe(MEMBER_INVITE_REPLY_TO);
  });

  it("escapes the names in the HTML", () => {
    const content = buildEmailContent({ ...payload, businessName: "<b>Bad</b>" });
    expect(content.html).toContain("&lt;b&gt;Bad&lt;/b&gt;");
  });
});
```

Check how ORG_SHORT_NAME renders in the existing business_invited test ("ISC Brewers Guild" or otherwise) and match it exactly.

`resolve-recipient.server.test.ts`: `location_handoff_invited` goes to `payload.email`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/portal src/lib/email`
Expected: the new cases FAIL.

- [ ] **Step 3: Implement**

`portal-sections.ts`: change the viewer type to `{ role: PortalRole; memberType: MemberType; isBusinessManager?: boolean }` in both `canOpenPortalSection` and `portalSectionsFor`. Change the People line to `if (section === "people") return viewer.role === "owner" || viewer.isBusinessManager === true;`. Add a row note to the header table: "people: also the business manager on a handed-off location".

`portal-access.ts`:
- Select `businesses(name, management_mode, manager_user_id)`, and add `businessManagerUserId: row.members.businesses?.manager_user_id ?? null` to `PortalMembership` and `MembershipRow`.
- In `acceptPendingInvites`, before the editor/media check:

```ts
    if (invite.role === "owner") {
      // A hand-off: the owner swap happens in one transaction in SQL.
      const { data: ok, error: rpcError } = await client.rpc("accept_location_handoff", {
        p_invite_id: invite.id,
        p_user_id: user.id,
      });
      if (!rpcError && ok === true) accepted.push({ memberId: invite.member_id, role: "owner" });
      continue;
    }
```

Update the doc comment to cover this.

`portal-session.server.ts`: the ready state gains `isBusinessManager: boolean`. In the impersonation branch set it to `false` (the role is already `"owner"`). Otherwise set it to `chosen.businessManagerUserId === user.id`. Find every place that builds `canOpenPortalSection` / `portalSectionsFor` viewers from a `PortalMember` (grep both names in `src/`) and pass `isBusinessManager: member.isBusinessManager`. Also update every typed fixture of the ready state that tsc flags.

`portal-shell.server.ts`, People case: `loadPeople(store, id, member.userId, new Date(), { viewerIsGuildAdmin: member.isImpersonating })`.

`portal-people.server.ts`:
- `requireOwner` becomes `requirePeopleAccess`: `member.role === "owner" || member.isBusinessManager`, else throw "Only the profile's owner or the business manager can manage people." Rename it at every call site.
- `emailInvite(member, invite)`: when `invite.role === "owner"`, send the hand-off email instead:

```ts
async function emailHandOff(member: PortalMember, email: string): Promise<boolean> {
  try {
    const business = await (await peopleStore()).businessFor(member.memberId);
    if (!business) return false;
    await sendTransactionalEmail({
      trigger: "location_handoff_invited",
      memberId: member.memberId,
      businessName: business.name,
      city: business.city,
      email,
      managerLabel: (await inviterEmail(member)) ?? `The ${ORG_NAME}`,
    });
    return true;
  } catch (err) {
    console.error("People: couldn't send the hand-off email", err);
    return false;
  }
}
```

  Import `ORG_NAME` from wherever `build-email-content.ts` imports it. Resend routes owner-role invites to `emailHandOff`. `resendInvite`'s return type becomes `{ email: string; role: OpenInviteRole }`.
- New actions. Both run on the caller's own session, so the SQL checks the right person and audits against them, which covers a Guild admin editing as them:

```ts
export const handOffLocation = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => ({ email: data?.email }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    const supabase = await getSupabaseServerClientForRequest();
    const { data: result, error } = await supabase.rpc("hand_off_location", {
      p_member_id: member.memberId,
      p_email: typeof data.email === "string" ? data.email : "",
    });
    if (error) throw new Error(error.message);
    const invite = result as { invite_id: string; email: string; refreshed: boolean };
    const emailSent = await emailHandOff(member, invite.email);
    return { email: invite.email, refreshed: invite.refreshed, emailSent };
  });

export const takeBackLocation = createServerFn({ method: "POST" }).handler(async () => {
  const member = await requirePeopleAccess();
  const supabase = await getSupabaseServerClientForRequest();
  const { error } = await supabase.rpc("take_back_location", { p_member_id: member.memberId });
  if (error) throw new Error(error.message);
  return { ok: true as const };
});
```

  Add a comment that these two are audited in SQL (`_business_audit`), so they don't call `recordAuditLogIfImpersonating`. The file keeps calling it elsewhere, so the coverage test still passes.

`build-email-content.ts`: add the payload variant (with a doc comment "People: the business manager handed off one location; to the invitee") and:

```ts
    case "location_handoff_invited": {
      const signInUrl = `${siteUrl}/signin?next=/portal`;
      const place = `${payload.businessName} · ${payload.city}`;
      const intro = `${payload.managerLabel} asked you to manage ${place} on the ${ORG_SHORT_NAME} member directory.`;
      const howTo = `Sign in with this email address (${payload.email}) to get started. The invitation lasts 14 days.`;
      return {
        subject: `You're invited to manage ${place}`,
        replyTo: MEMBER_INVITE_REPLY_TO,
        text: `${intro}\n\n${howTo}\n\n${signInUrl}`,
        html: wrapHtml([escapeHtml(intro), `${escapeHtml(howTo)} <a href="${signInUrl}">${signInUrl}</a>`]),
      };
    }
```

`resolve-recipient.server.ts`: add `case "location_handoff_invited":` to the `payload.email` group.

`portal-setup.server.ts` (ruling 6): replace `shortSetup = otherSetUp;` with

```ts
      // A location manager can't change the shared look, so their setup
      // skips it even before another location is set up (spec, Setup).
      shortSetup = otherSetUp || !sharedLook.canChange;
```

and guard the prefill with `if (otherSetUp && !setupCompleted)`. Update the `shortSetup` doc comment on the shell type to match.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: every test passes, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal src/lib/email
git commit -m "feat(portal): hand off and take back from People; accept hand-offs at sign-in; hand-off email"
```

---

### Task 5: The People page (artboard BZ4)

**Files:**
- Modify: `src/components/portal/PeopleSection.tsx`
- Test: `src/components/portal/PeopleSection.test.tsx` (create if none exists; follow the render-test setup used by other component tests, e.g. `src/components/admin/SharedLookNote.test.ts*`)

**Interfaces:**
- Consumes: `PeopleView` with `business` and `PersonView.label`/`isBusinessManager` (Task 3); `handOffLocation`, `takeBackLocation` (Task 4).

- [ ] **Step 1: Write the failing test**

Mock `@/lib/portal/portal-people.server` and `@tanstack/react-router`'s `useRouter` (`{ invalidate: vi.fn() }`), the same way other component tests mock server functions. Cases:

```tsx
const business = {
  name: "Hangar 24", city: "Riverside", locationCount: 4, viewerIsManager: true,
  locationManagerEmail: null, handOffPending: false, canHandOff: true, canTakeBack: false,
};
const manager = { userId: "u-boss", email: "boss@x.com", role: "owner" as const, isYou: true, canRemove: false,
  isBusinessManager: true, label: "Business manager · all 4 locations" };

it("shows the business manager line and the Hand off card", () => {
  render(<PeopleSection people={[manager]} invites={[]} business={business} />);
  expect(screen.getByText("Business manager · all 4 locations")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Hand off this location" })).toBeInTheDocument();
  expect(screen.getByText("They'll manage Riverside only. You keep access, and the logo, cover and theme stay shared.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
});

it("after a hand-off shows Take back and confirms first", async () => {
  render(
    <PeopleSection
      people={[{ ...manager, role: "editor" }]}
      invites={[]}
      business={{ ...business, locationManagerEmail: "loc@x.com", canHandOff: false, canTakeBack: true }}
    />,
  );
  expect(screen.getByText("Riverside is handed off")).toBeInTheDocument();
  expect(screen.getByText("loc@x.com manages Riverside. You still have access.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Take back this location" }));
  expect(screen.getByText("Take back Riverside?")).toBeInTheDocument();
  expect(screen.getByText("loc@x.com will no longer be able to edit Riverside, and you'll manage it again.")).toBeInTheDocument();
});

it("outside a business, the page is unchanged (no hand-off card)", () => {
  render(<PeopleSection people={[{ ...manager, isBusinessManager: false, label: "Owner" }]} invites={[]} business={null} />);
  expect(screen.queryByRole("heading", { name: "Hand off this location" })).toBeNull();
});
```

If the repo has no React Testing Library set up (check `package.json` for `@testing-library/react`), skip this test file. Instead, put the copy into a small pure helper `peopleBusinessCopy(business)` in `src/lib/portal/people.ts`, returning `{ handOffHelp, handedOffTitle, handedOffBody, takeBackTitle, takeBackBody }`, test that helper in `people.test.ts` with the exact strings above, and use it in the component.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/portal/PeopleSection.test.tsx` (or `people.test.ts`)
Expected: FAIL.

- [ ] **Step 3: Implement**

In `PeopleSection.tsx` (props become the full `PeopleView`, including `business`):
- **Intro:** when `business` is set, the h1 stays "People" and the lede reads `Who can edit ${business.name} · ${business.city}.` Otherwise keep today's lede.
- **Person rows in a business:** a two-line left column, the email (+ " · you") and then `person.label` in `text-[12px] text-ink-muted`. No RolePill. Remove only when `canRemove`. Outside a business, keep today's row with the RolePill.
- **Invite rows:** `ROLE_LABEL` gains `owner: "Location manager"` for the pill. For a role-`owner` invite, the pill reads "Location manager", with the usual Resend and Cancel invite.
- **Hand off card** (`business.canHandOff`): a white rounded card like the invite form. Heading `Hand off this location` (h2, `font-sans text-base font-semibold`), label "Their email", an email input (id `handoff-email`), a primary **Send invite** button, and the help line "They'll manage {city} only. You keep access, and the logo, cover and theme stay shared." On submit, call `handOffLocation({ data: { email } })`, clear the field, `router.invalidate()`, and show the notice `Hand-off invite sent to ${email}.` (or `…saved for ${email}, but the email didn't go out. Try Resend.`). Errors go to the existing alert line.
- **Handed-off card** (`business.locationManagerEmail && business.viewerIsManager`): the title `${city} is handed off` (semibold), the body `${email} manages ${city}. You still have access.`, and a secondary button **Take back this location** (`rowButtonClass` look with a border, h-11). It opens an `AlertDialog` titled `Take back ${city}?`, described `${email} will no longer be able to edit ${city}, and you'll manage it again.`, with **Cancel** (`AlertDialogCancel`) and **Take back** (brand primary). Confirming calls `takeBackLocation()` through `run(...)` and shows the notice `You manage ${city} again.`
- Order on the page: header, "On this profile" list, Hand off card or handed-off card, "Invite someone" form, notices, dialogs.

Also update the component's doc comment to cite BZ4 and the new rules.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/PeopleSection.tsx src/components/portal/PeopleSection.test.tsx src/lib/portal/people.ts src/lib/portal/people.test.ts
git commit -m "feat(portal): People shows the business manager, Hand off and Take back (BZ4)"
```

---

### Task 6: Roster: the two mode boxes (artboard BZ1) and the handed-off line

**Files:**
- Modify: `src/lib/guild/business-invite-core.ts` (+ `business-invite-core.test.ts`)
- Modify: `src/lib/guild/businesses.server.ts`
- Modify: `src/lib/guild/roster.server.ts`, `src/lib/guild/roster-groups.ts`, `src/lib/guild/roster-detail.ts` (+ `roster-detail.test.ts`)
- Create: `src/components/guild/BusinessModeDialog.tsx`
- Modify: `src/components/guild/RosterTable.tsx`, `src/components/guild/PartOfDialog.tsx` (doc comment only)
- Modify: `src/lib/guild/audit-log-coverage.test.ts` (no change expected; run it)

**Interfaces:**
- Consumes: `set_business_mode(p_business_id, p_mode, p_look_source, p_manager_user_id)` (Task 2).
- Produces:
  - `inviteBusinessManagerCore(deps, { businessId, email, switching?: boolean })`. With `switching`, the business must be `separate` ("This business already has one manager."), and `deps.linkManager` is the switch.
  - `switchBusinessToOneManager({ businessId, email, lookSource }) → { ok: true }`.
  - `setBusinessMode` stays and is used for the switch to separate.
  - `RosterEntry.ownerUserId: string | null`; `RosterBusiness.managerUserId: string | null`.

- [ ] **Step 1: Write the failing tests**

`business-invite-core.test.ts` (use the existing deps fake):

```ts
it("switching: needs a separate business and links through the switch", async () => {
  const linkManager = vi.fn().mockResolvedValue({ ok: true });
  const deps = fakeDeps({ business: { mode: "separate", managerUserId: null }, linkManager });
  await inviteBusinessManagerCore(deps, { businessId: "b1", email: "Owner@X.com", switching: true });
  expect(linkManager).toHaveBeenCalledWith("b1", expect.any(String));
  expect(deps.sendInviteEmail).toHaveBeenCalled();
});

it("switching: refuses a business that is already one manager", async () => {
  const deps = fakeDeps({ business: { mode: "one_manager", managerUserId: null } });
  await expect(
    inviteBusinessManagerCore(deps, { businessId: "b1", email: "a@x.com", switching: true }),
  ).rejects.toThrow("This business already has one manager.");
});

it("switching: an existing owner's account is linked, never deleted when the switch fails", async () => {
  const deps = fakeDeps({
    business: { mode: "separate", managerUserId: null },
    createUser: async () => ({ ok: false, emailTaken: true, message: "taken" }),
    findUserIdByEmail: async () => "u-owner",
    linkManager: async () => ({ ok: false, message: "Cancel the pending hand-off first." }),
  });
  await expect(
    inviteBusinessManagerCore(deps, { businessId: "b1", email: "owner@x.com", switching: true }),
  ).rejects.toThrow("Cancel the pending hand-off first.");
  expect(deps.deleteUser).not.toHaveBeenCalled();
});
```

`roster-detail.test.ts`:

```ts
it("a handed-off location in a one-manager business names its location manager", () => {
  const business = { id: "b", name: "H24", mode: "one_manager" as const, hasManager: true,
    managerEmail: "boss@x.com", managerSignedIn: true, managerUserId: "u-boss" };
  const entry = makeEntry({ ownerUserId: "u-loc", ownerEmail: "loc@x.com", claimState: "claimed" });
  expect(resolveDetailLine(entry, NOW, { business, withoutCity: true })).toBe("handed off to loc@x.com");
});
```

Use the file's existing entry builder, adding `ownerUserId` to it.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/guild`
Expected: FAIL.

- [ ] **Step 3: Implement**

`business-invite-core.ts`: add `switching?: boolean` to the input. The checks become:

```ts
  if (input.switching) {
    if (business.mode !== "separate") throw new Error("This business already has one manager.");
  } else {
    if (business.mode !== "one_manager") throw new Error("Set this business to One manager first.");
    if (business.managerUserId) throw new Error("This business already has a manager.");
  }
```

Update the doc comment, which now covers both the roster Invite and the switch box.

`businesses.server.ts`: extract the deps object in `inviteBusinessManager` into a local `businessInviteDeps(supabase, service, linkManager)` helper and reuse it in:

```ts
export const switchBusinessToOneManager = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; email: string; lookSource: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    const service = await getSupabaseServiceRoleClient();
    await inviteBusinessManagerCore(
      businessInviteDeps(supabase, service, async (businessId, userId) => {
        // Mode, shared look and the manager's links in one transaction.
        const { error } = await supabase.rpc("set_business_mode", {
          p_business_id: businessId,
          p_mode: "one_manager",
          p_look_source: data.lookSource,
          p_manager_user_id: userId,
        });
        return error ? { ok: false as const, message: error.message } : { ok: true as const };
      }),
      { businessId: data.businessId, email: data.email, switching: true },
    );
    return { ok: true as const };
  });
```

`setBusinessMode` keeps its signature, and the roster now calls it only for `separate`. Update its comment. The file must keep exporting only createServerFn results (it is in the vite `importProtection` allowlist), so `businessInviteDeps` is a non-exported function.

`roster.server.ts`: set `ownerUserId: owner?.user_id ?? null` on each entry, typed in `RosterEntry`. Set `managerUserId: row.manager_user_id` on each business, typed in `RosterBusiness` (in `roster-groups.ts`). The owner pick must prefer `role === "owner"`, which it already does. Make `ownerUserId` the owner-role link only: `owners.find((row) => row.role === "owner")?.user_id ?? null`.

`roster-detail.ts` `signInDetail`: in one-manager mode, before the manager checks:

```ts
    if (entry.ownerUserId && business.managerUserId && entry.ownerUserId !== business.managerUserId) {
      return `handed off to ${entry.ownerEmail ?? "a location manager"}`;
    }
```

`BusinessModeDialog.tsx` (new). It uses the same Dialog parts and classes as `PartOfDialog.tsx`:

```tsx
/**
 * The roster's Managed by boxes (artboard BZ1, spec 2026-10-15). To one
 * manager: who manages the business (a location's current owner, or
 * someone new) and whose logo, cover and theme every location keeps; one
 * server call does the switch, the links and the invite email. To
 * separate: a confirmation. The database refuses what its rules don't
 * allow (e.g. a pending hand-off) and the message shows here.
 */
export function BusinessModeDialog(props: {
  business: RosterBusiness | null;
  entries: RosterEntry[];
  target: BusinessManagementMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) { … }
```

Behavior:
- **Target `one_manager`:**
  - Title `Switch ${business.name} to one manager`. Description `One person runs all ${n} locations and the logo, cover and theme are shared.`
  - Fieldset "Who manages the business?": one radio per distinct `entry.ownerEmail` (sorted), plus "Invite someone new", which reveals an email input (id `mode-new-email`, label "Their email"). The first owner is selected by default, or "Invite someone new" when there are none.
  - Fieldset "Keep the logo, cover and theme from:": one radio per location by city. The default is the location with the earliest `setup_completed_at`, else the first by city.
  - Submit **Switch** calls `switchBusinessToOneManager({ data: { businessId, email, lookSource } })`, then `router.invalidate()`, the toast `${business.name}: one manager. Invite sent to ${email}.`, and closes.
- **Target `separate`:**
  - Title `Switch to each location separately`. Description "Each location keeps its current logo, cover, theme and owner. To give a location to someone new, the manager hands it off first."
  - **Switch** calls `setBusinessMode({ data: { businessId, mode: "separate" } })`, then the toast `${business.name}: each location separately`.
- **Both:** a **Cancel** button; errors show in a `role="alert"` line; buttons are disabled while saving; the state is reset on open (the same `useEffect` pattern as PartOfDialog); radios are 44px rows like the People role picker.

`RosterTable.tsx`: `handleModeChange` no longer calls `setBusinessMode` directly. It opens `BusinessModeDialog` with the business, its entries and the target mode, keeping the "kept after closing" pattern the file uses for its other dialogs. Remove `businessBusyId` if nothing else uses it; otherwise keep it for the row's disabled state while the dialog saves.

`PartOfDialog.tsx`: the doc comment no longer cites leaving a one-manager business as refused. It now says that leaving one releases the location from its manager.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS. The build must succeed, since `businesses.server.ts` is under import protection.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guild src/components/guild
git commit -m "feat(guild): switch a business's mode with owners in place (BZ1 boxes); show handed-off locations"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/member-profiles.md`

- [ ] **Step 1: Update the multi-location section**

In `docs/member-profiles.md`'s multi-location section (added in Parts 2–4), add a "Hand-off, take-back and switching (Part 5)" subsection covering:
- the roles after a hand-off;
- who sees People (the owner, and the business manager on a handed-off location);
- that the business manager can't be removed from People;
- the hand-off invite's lifetime and resend rule;
- what accepting does;
- take-back;
- switching to one manager with owners in place (rulings 1–2);
- switching to separate;
- leaving a business;
- the pending-hand-off refusal;
- the `location_handoff_invited` email;
- that a location manager always gets the short setup.

Extend the existing line "Member Guide to-do (Part 6): …" with: "the People page as the business manager sees it (Hand off this location, Take back), and as a location manager sees it; the hand-off email."

- [ ] **Step 2: Commit**

```bash
git add docs/member-profiles.md
git commit -m "docs: hand-off, take-back and mode switching"
```

---

### Rollout (controller, not a subagent task)

1. Whole-branch review, then a fix wave.
2. Ask the owner before `supabase db push --linked`. Two migrations: `20261018100000_location_handoff.sql` and `20261018110000_business_mode_switching.sql`. After the push, run `npm run test:db` against the linked database: every file must pass.
3. `npm run build`, push to `staging`, and verify that the Cloudflare deploy time is after the push.
4. Give the owner a staging walk-through with the Sample Brewing Co. pair:
   1. On Corona's People page (as boblelle77+chain@gmail.com), hand off to a second test address.
   2. Sign in as that address: Corona opens with a short setup and the look read-only, and People shows the Business manager row with no Remove.
   3. As the manager, Take back.
   4. On the roster, switch Sample Brewing to separate, then back to one manager, picking an owner and a look.
