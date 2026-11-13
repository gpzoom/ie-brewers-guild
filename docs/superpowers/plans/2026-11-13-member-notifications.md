# Member Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A general member notification system: a type registry, problems (open/resolved) and messages (unread/read), emails, a portal Notifications area, and a Guild Member alerts page. It starts with two problem types: closed-day conflicts, which also hide events from the public, and UTC calendars.

**Architecture:**
- **Storage:** one table, `member_notifications`. Each row carries the facts its type's registry entry gave it when it was created: recipient roles, email mode and reminder days.
- **Problems:** pure decision functions (closed-day, UTC) are run by a never-throwing server wrapper. It is called by the 15-minute cron and after event saves, draft publishes and calendar syncs, and it applies its decisions through a security-definer RPC.
- **Messages:** created by `notify()`.
- **Emails:** one claim-and-send pipeline, in the same shape as the guest-stop visit emails, split by site (staging handles Sample-only rows, live handles the rest), with quiet mode and a pause switch.
- **Hiding:** public readers drop events returned by `open_conflict_event_ids()`.

**Tech Stack:** TanStack Start + React on Cloudflare Workers, Supabase Postgres (RLS, security-definer RPCs, pgTAP), Vitest (`src/**/*.test.ts` only), Resend via `sendRawEmail`.

**Spec:** `docs/superpowers/specs/2026-11-13-member-alerts-design.md`

## Global Constraints

- **No email to a real member from building, testing or launching.** Staging handles only rows whose members are all Sample (`business_name like 'Sample %'`) and sends only to `STAGING_GUILD_NOTIFICATION_EMAIL`. Live never touches Sample-only rows.
- **Closed day:** `special_hours.is_closed = true` on a **published producer or allied** member, in that member's time zone. No weekly closed days, no shortened hours, and Mobile members are never closed.
- **Conflicts are checked 60 days ahead**, using `GUEST_LINK_DAYS`.
- **Recipients:** `owner`, `co_owner`, `editor`, `media_events`, for both problem types.
- **Reminder:** one, 3 days before `due_date`, only if the problem is still open. **UTC: no reminder.** No "resolved" email.
- **Quiet at launch:** while `emails_enabled = false`, new rows are `quiet` (never emailed). **Sample rows are never quiet.** Hiding starts straight away.
- **Retention:** resolved and read items show for **30 days**.
- **Weekly Guild summary:** Monday morning (Pacific), to Guild admins and super admins. It shows found, resolved and still-open counts, **skips empty weeks**, and counts a shared conflict once.
- **Guild visibility:** `guildSees = true` for every type for now.
- **Text:** all site and email text in US English.
- **Before any staging push:** run `npm run build`, with placeholder `VITE_*` values in the command only.
- **`supabase db push` needs the owner's go-ahead.** Migrations must be additive and safe for the currently deployed code.
- Every new member-mutation server file goes in `MEMBER_MUTATION_FILES` (`src/lib/guild/audit-log-coverage.test.ts`) and calls `recordAuditLogIfImpersonating`.
- **UI:** the screens follow the Claude Design artboards if they're in `docs/design/` by Task 9. Otherwise use the existing `AdminShell`, portal and Guild patterns, and note it for restyling.

## Review Focus

- **The closed date is read in the closed member's time zone.** An event starting at 11:30 PM the night before, or at 12:30 AM after, isn't on the date. Pinned in Task 3.
- **Both sites run the check.** Staging's decision must never open or resolve a row involving a real member. Pinned by the `forSite` tests in Task 3.
- **A deleted event or link resolves its open conflict, without cascading away the history.** `event_id` uses `on delete set null`. Pinned in Tasks 1 and 3.
- **A problem that returns after resolving is a new row**, emailed if emails are on. Pinned in Tasks 1 (unique open index) and 3.
- **A member with no matching recipients** is marked sent with `last_error = 'no recipient'` and isn't retried forever. Pinned in Task 7.

---

### Task 1: Database: tables, RPCs, RLS

**Files:**
- Create: `supabase/migrations/20261116100000_member_notifications.sql`
- Create: `supabase/tests/member_notifications.test.sql`

**Interfaces:**
- **Produces, tables:**
  - `member_notifications`:
    - `id uuid pk`
    - `type text`
    - `kind text check in ('problem','message')`
    - `member_id uuid` (FK to `members`, on delete cascade)
    - `dedupe_key text null`
    - `details jsonb not null default '{}'`
    - `event_id uuid null` (FK to `events`, **on delete set null**)
    - `due_date date null`
    - `recipient_roles text[] not null`
    - `email_mode text check in ('batched','none')`
    - `reminder_days int null`
    - `status text check in ('open','resolved','unread','read')`
    - `created_at`, `resolved_at`, `read_at`
    - `quiet boolean not null`
    - `notice_sent_at`, `reminder_sent_at`, `claimed_at`, `attempts int default 0`, `last_error`
  - A unique index on `(dedupe_key) where status = 'open'`.
  - `member_notification_settings` singleton: `emails_enabled boolean default false`, `paused boolean default false`, `launch_summary_sent_at timestamptz null`, `updated_at`.
  - `calendar_connections` gets `feed_time_zone text null` and `feed_has_timed_events boolean null`.
- **Produces, RPCs:**
  - `apply_member_problems(p_opens jsonb, p_resolve_ids uuid[]) returns int`, service role only. It inserts opens with `on conflict do nothing` and sets `quiet = not emails_enabled and member not Sample`. It resolves ids that are still open (`status='resolved', resolved_at=now()`).
  - `insert_member_message(p_row jsonb) returns uuid`, service role only, with the same quiet rule and `status 'unread'`.
  - `claim_member_notification_emails(p_limit int, p_sample_only boolean) returns table(... all columns ..., send_kind text)`, service role only. It returns nothing while `paused`. The `'notice'` set is `not quiet, email_mode='batched', notice_sent_at is null, status in ('open','unread')`. The `'reminder'` set is `kind='problem', status='open', notice_sent_at not null, reminder_sent_at null, reminder_days not null, due_date - reminder_days <= today in the member's time zone <= due_date`. Rows are filtered by `(every involved member is Sample) = p_sample_only`, where the involved members are `member_id` plus `details->>'other_member_id'`. It uses the same claim and attempt rules as `claim_guest_stop_notices` (10-minute reclaim, under 5 attempts, `skip locked`).
  - `open_conflict_event_ids(p_event_ids uuid[]) returns setof uuid`, security definer, granted to anon and authenticated. It returns only ids of open `closed_day_conflict` rows.
  - `mark_member_notification_read(p_id uuid) returns void`. It is allowed for a member's people whose role is in `recipient_roles`, or for a Guild admin, and only on messages.
- **Produces, RLS on `member_notifications`:** select is allowed when `public.member_role(member_id) = any(recipient_roles)` or `public.is_guild_admin()`. There are no write policies, and `member_notification_settings` gets RLS with no policies.

- [ ] **Step 1: Write the pgTAP test** (`plan(14)`), using the fixtures (m1 producer, m4 mobile, users f0..01–06). Assertions:
  - the tables exist;
  - an open with the same `dedupe_key` twice yields one row;
  - after resolving, the same key opens a second row;
  - `quiet` is true while `emails_enabled = false`, and false for a member renamed `'Sample X'` inside the test;
  - deleting the event keeps the row with `event_id` null;
  - `open_conflict_event_ids` returns the conflicting id to anon, and nothing for a resolved row;
  - the claim returns nothing while paused;
  - the claim returns a `'reminder'` row only when due;
  - the claim with `p_sample_only = true` skips a row involving m1;
  - the owner (f0..01) reads m1's rows and a stranger (f0..06) reads none;
  - the Guild admin (f0..04) reads all;
  - `mark_member_notification_read` works for the editor (f0..02) and is refused (42501) for f0..06;
  - anon can't select `member_notifications` (42501).
- [ ] **Step 2: Write the migration** as specified in Interfaces. Header comment: why (spec), the quiet and Sample rules, and that it's additive.
- [ ] **Step 3: Ask the owner for the `db push` go-ahead.** Then run `npx supabase db push --dry-run` (expected: only this file), then `npx supabase db push`.
- [ ] **Step 4: Run** `npm run test:db -- supabase/tests/member_notifications.test.sql`. Expected: `PASS (14/14)`.
- [ ] **Step 5: Commit.** Message: `feat(db): member notifications table, RPCs and RLS`

---

### Task 2: Types and the notification type registry

**Files:**
- Create: `src/lib/notifications/types.ts`, `src/lib/notifications/registry.ts`, `src/lib/notifications/registry.test.ts`
- Modify: `src/lib/supabase/types.ts` (add `MemberNotificationRow`, `MemberNotificationSettingsRow`, and the two `CalendarConnectionRow` fields)

**Interfaces:**
- `NotificationKind = "problem" | "message"`
- `NotificationTypeDef<D>`:
  ```ts
  {
    type: string;
    kind: NotificationKind;
    recipientRoles: MemberRole[];
    guildSees: boolean;
    countsInGuildSummary: boolean;
    emailMode: "batched" | "none";
    reminderDaysBefore: number | null;
    portal(d: D, ctx: NoticeContext): { title: string; body: string; buttons: Array<{ label: string; to: string }> };
    email(d: D, ctx: NoticeContext, sendKind: "notice" | "reminder"): { heading: string; lines: string[]; button: { label: string; path: string } | null };
    afterSend?: (row: MemberNotificationRow) => Promise<void>;
  }
  ```
- `NoticeContext = { memberName: string; otherMemberName: string | null; eventTitle: string | null; timezone: string }`
- `typeDef(type: string): NotificationTypeDef<unknown>` throws on an unknown type. `registerNotificationType(def)` adds a type, for tests and future features.
- `rowFields(def): { kind; recipient_roles; email_mode; reminder_days }`: what an insert copies from the registry.
- Registered types:
  - `closed_day_conflict`: problem, the 4 roles, `guildSees: true`, `countsInGuildSummary: true`, batched, `reminderDaysBefore: 3`.
  - `utc_calendar`: problem, the 4 roles, `guildSees: true`, `countsInGuildSummary: true`, batched, `reminderDaysBefore: null`.
- **Conflict details:** `{ role: "own" | "host" | "guest"; event_id; other_member_id: string | null; closed_date: string; closed_note: string | null }`.
- **UTC details:** `{ calendar_connection_id; purpose: "events" | "food"; feed_time_zone }`.

- [ ] **Step 1: Write the failing tests:**
  - `typeDef("closed_day_conflict").reminderDaysBefore === 3`, and UTC is `null`.
  - `typeDef("nope")` throws.
  - A type registered in the test is returned by `typeDef`.
  - Portal wording:
    - **own:** the title contains "closed day", the body contains the event title and "Thu, Nov 26", and the buttons are `Edit in Events` and `Check Special hours`;
    - **guest:** the body names the taproom and suggests contacting it; there's no Special hours button;
    - **UTC:** the body contains "UTC" and "Pacific", plus "food calendar" when `purpose = "food"`.
  - The email reminder heading contains "Reminder".
- [ ] **Step 2: Run** `npx vitest run src/lib/notifications/registry.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** as in Interfaces. Dates use `Intl` in `ctx.timezone`, with no new dependency.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): types and type registry`

---

### Task 3: Closed-day conflict decision (pure)

**Files:**
- Create: `src/lib/notifications/closed-day.ts`, `src/lib/notifications/closed-day.test.ts`, `src/lib/notifications/site-split.ts`, `src/lib/notifications/site-split.test.ts`

**Interfaces:**
- **Input:** `ClosedDayInputs = { closedDays: Array<{ member_id; date; note }>; members: Map<id, { id; name; type: MemberType; timezone; published: boolean }>; events: GuestStop[]; links: Array<{ event_id; host_member_id }>; openRows: MemberNotificationRow[] }`. Only open `closed_day_conflict` rows. `GuestStop` is from `src/lib/events/guest-links.ts`.
- **Main function:** `decideClosedDayProblems(i: ClosedDayInputs, now: Date): { opens: ProblemOpen[]; resolveRows: MemberNotificationRow[] }`.
  - `ProblemOpen = { type; member_id; dedupe_key; details; event_id; due_date } & rowFields(def)`.
  - `dedupe_key = closed_day_conflict:<member_id>:<event_id>:<date>`.
- **Rules:**
  - An event is "on" a date when its effective start (the rescheduled start if set) falls on that date in the **closed member's** time zone. All-day events count on their own date.
  - Only live events count (not hidden, canceled or postponed).
  - The window runs from now to now + 60 days.
  - **own:** the closed member's own event.
  - **host + guest:** an event linked in `links` to the closed member (any link status).
  - Only published producers and allied members can be closed.
  - Open rows not reproduced by the decision resolve. This includes rows whose `event_id` is null.
- **Site split:** `forSite(d: { opens: ProblemOpen[]; resolveRows: MemberNotificationRow[] }, isSample: (memberId: string) => boolean, staging: boolean): { opens: ProblemOpen[]; resolveIds: string[] }`. A row belongs to staging only if every involved member is Sample. `isSampleName(name: string): boolean` is `/^Sample /.test(name)`.

- [ ] **Step 1: Write the failing tests:**
  - **own conflict:** Mars Happy Hour on 11/26 with Mars closed on 11/26 opens one `own` row with `due_date` 2026-11-26;
  - **shared conflict:** Tipzy's linked stop opens two rows, `host` for Mars and `guest` for Tipzy, each with `other_member_id`;
  - **time zone edges:** a stop at 11:30 PM Pacific on 11/25 and one at 12:30 AM on 11/27 are not conflicts;
  - **all-day:** an all-day event on 11/26 is a conflict;
  - **rescheduled:** an event rescheduled onto 11/26 is a conflict; one rescheduled off 11/26 resolves its open row;
  - **not live:** canceled, postponed or hidden events aren't conflicts;
  - **window:** day 61 isn't a conflict;
  - **who can be closed:** a Mobile member's closed day is ignored; a draft producer is ignored; an allied member gives an own conflict only;
  - **resolving:** removing the closed day resolves both shared rows; an open row with `event_id` null resolves;
  - **returning problem:** after resolve, the same facts open again (the caller passes no open row);
  - **no duplicates:** an existing open row is neither re-opened nor resolved;
  - **forSite:**
    - staging keeps a Sample-only row and drops a Sample-plus-real one;
    - live keeps Sample-plus-real and drops Sample-only;
    - resolves follow the same split.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the effective-start rule from `startOf` in `guest-links.ts` (export it, don't copy it). For the local date, use `Intl.DateTimeFormat("en-CA", { timeZone })`.
- [ ] **Step 4: Run** `npx vitest run src/lib/notifications`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): closed-day conflict decision and site split`

---

### Task 4: UTC calendar detection

**Files:**
- Create: `src/lib/notifications/utc-calendar.ts`, `src/lib/notifications/utc-calendar.test.ts`
- Modify: `src/lib/events/calendar-connection.server.ts` (`syncOneIcsConnection`: after the parse, write `feed_time_zone` and `feed_has_timed_events` alongside the success update)

**Interfaces:**
- `feedTimeZone(icsText: string): string | null` reads the `X-WR-TIMEZONE` line (unfolded).
- `isUtcZone(tz: string | null): boolean` is true for `UTC`, `GMT`, `Etc/UTC`, `Etc/GMT`, `Etc/UCT`, `UCT`, `Zulu` (case-insensitive).
- `decideUtcProblems(i: { connections: Array<{ id; member_id; purpose; feed_time_zone; feed_has_timed_events }>; members: Map<id, { timezone; published }>; openRows: MemberNotificationRow[] }): { opens: ProblemOpen[]; resolveRows: MemberNotificationRow[] }`.
  - It opens when `isUtcZone(feed)`, the member's time zone isn't a UTC zone, `feed_has_timed_events` is true and the member is published.
  - `dedupe_key = utc_calendar:<member_id>:<connection_id>`, `due_date null`.
  - A removed connection, or a fixed time zone, resolves.

- [ ] **Step 1: Write the failing tests:**
  - `feedTimeZone` reads `UTC` from the Left Coast header, reads `America/Los_Angeles` from the Mars header, and returns null without the line;
  - `isUtcZone` handles the variants;
  - decide: Left Coast-shaped input opens one row;
  - decide: no timed events doesn't open; a member in UTC doesn't open; a fixed time zone resolves; the food purpose is carried in `details`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `syncOneIcsConnection`, set `feed_has_timed_events` to whether any parsed event has `allDay === false`. This is computed from the parse result, not the raw text.
- [ ] **Step 4: Run** `npx vitest run src/lib/notifications src/lib/events`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): detect calendars set to UTC`

---

### Task 5: The problem check (server) and its triggers

**Files:**
- Create: `src/lib/notifications/problems.server.ts`, `src/lib/notifications/problems-load.ts`, `src/lib/notifications/problems-load.test.ts`
- Modify: `src/server.ts` (15-minute chain), `src/lib/events/events.server.ts` (after each `relinkGuestStops`), `src/lib/drafts/drafts.server.ts` (`publishDraft`, beside `geocodeMemberAfterPublish`), `src/lib/events/calendar-connection.server.ts` (`refreshIcsConnectionNow`, after `relinkGuestStops`)

**Interfaces:**
- `loadProblemInputs(db: SupabaseClient, now: Date): Promise<ClosedDayInputs & { connections; utcOpenRows }>` reads, on the service client:
  - published producers and allied members' `special_hours` (`is_closed`, date from today to +60 days);
  - all members;
  - live events in the window, of any member type, `kind = 'event'`;
  - `event_hosts` for those events;
  - `calendar_connections`;
  - open problem rows.
- `refreshMemberProblems(): Promise<void>` never throws. It resolves the site role with `siteRole(env.SITE_ORIGIN)` and returns if that's null. It decides both types, applies `forSite`, and calls `apply_member_problems`. It always runs a full check (the data is small). The per-save triggers just call it.
- `src/server.ts`: `refreshAllIcsConnections().finally(relinkGuestStops).finally(refreshMemberProblems).finally(sendGuestStopNotices).finally(sendMemberNotifications)`. `sendMemberNotifications` comes from Task 7. Until Task 7, leave that last link out.

- [ ] **Step 1: Write the failing test** for `loadProblemInputs`, using `fake-supabase.test-helper.ts`: it requests only `is_closed` special hours in the window and `kind = 'event'` events, and maps the rows into `ClosedDayInputs`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then wire the four triggers. Each trigger is `await refreshMemberProblems()` placed after the existing relink or geocode call. It never throws, so a save never fails.
- [ ] **Step 4: Run** `npx vitest run` (full suite). Expected: all pass, including `audit-log-coverage.test.ts`.
- [ ] **Step 5: Dry run against live data, read only.** Copy the earlier dry-run approach: a temporary `src/zz-problems-dryrun.test.ts` run with `node --env-file=.env node_modules/vitest/vitest.mjs run`. It calls `loadProblemInputs` and both decide functions and prints the opens with their members, events and dates, **without** calling the RPC. Delete the file afterwards. Expected: it includes the Mars Thanksgiving own conflicts, the Tipzy "Mars Karaoke" host and guest pair, and Left Coast's UTC calendar. Show the list to the owner.
- [ ] **Step 6: Commit.** Message: `feat(notifications): problem check and its triggers`

---

### Task 6: Hide conflicting events from the public

**Files:**
- Create: `src/lib/notifications/hidden-events.ts`, `src/lib/notifications/hidden-events.test.ts`
- Modify: `src/lib/home/homepage.server.ts` (`loadCards`), `src/lib/members/member-profile.server.ts` (own events at line ~139, and `loadGuestEventsForHost` / `loadShownHostsForGuest` results), `src/lib/members/members-v2.server.ts` (map stop events)

**Interfaces:**
- `withoutHidden<T extends { id: string }>(rows: T[], hiddenIds: Set<string>): T[]` (pure)
- `loadHiddenEventIds(client: SupabaseClient, ids: string[]): Promise<Set<string>>` calls the `open_conflict_event_ids` RPC. On error it returns an empty set and logs it: a failed read must not blank a page.

- [ ] **Step 1: Write the failing tests:**
  - `withoutHidden` drops listed ids and keeps the order;
  - `loadHiddenEventIds` with a fake client returns the RPC ids, and an empty set on error.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement, and apply in each reader before shaping:**
  - the homepage rows, before `selectCarouselEvents`;
  - the profile's own events, and the guest events for a host (this also covers Food this week, which uses them);
  - the guest's host links;
  - the map stop events.

  The profile preview (`loadMemberPreviewData`) also hides them: the preview shows what the public sees.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): hide events with an open closed-day conflict`

---

### Task 7: Email pipeline, messages and `notify()`

**Files:**
- Create: `src/lib/notifications/email.ts`, `src/lib/notifications/email.test.ts`, `src/lib/notifications/send-run.ts`, `src/lib/notifications/send-run.test.ts`, `src/lib/notifications/send.server.ts`, `src/lib/notifications/notify.server.ts`, `src/lib/notifications/notify.test.ts`
- Modify: `src/server.ts` (add `sendMemberNotifications` to the chain)

**Interfaces:**
- `buildNotificationEmail(args: { memberName: string; items: Array<{ row: MemberNotificationRow; sendKind: "notice" | "reminder"; ctx: NoticeContext }>; origin: string; staging: boolean }): { subject: string; html: string; text: string }`.
  - One email covers all of a member's items.
  - It uses the existing visual style (`#241F1A` text, `#BE5A0A` button).
  - The subject gets a `[Staging] ` prefix on staging.
  - Each item's button URL is `origin + path`.
- `SendDeps` follows the shape of `RunDeps` in `guest-stop-run.ts`:
  - `claim`;
  - `loadMember(memberId) → { name; timezone; recipientsByRole: Map<MemberRole, string[]> }`;
  - `loadContext(row) → NoticeContext`;
  - `send`;
  - `markSent(rows: Array<{ id; sendKind }>, lastError: string | null)`;
  - `markFailed(id, msg)`;
  - `role`;
  - `now`.
- `runNotificationSend(d: SendDeps): Promise<void>`:
  - group by member;
  - recipients are the union of each row's `recipient_roles`;
  - staging sends to `[STAGING_GUILD_NOTIFICATION_EMAIL]`;
  - with no recipient, `markSent(..., "no recipient")`;
  - after a send, `markSent` sets `notice_sent_at` or `reminder_sent_at`, then each type's `afterSend`.
- `sendMemberNotifications(): Promise<void>` never throws. It wires the production deps and calls the claim RPC with `p_sample_only = role.staging`.
- `notify(memberId: string, type: string, details: Record<string, unknown>, opts?: { dedupeKey?: string; eventId?: string; dueDate?: string }): Promise<void>` calls `insert_member_message` with `rowFields(typeDef(type))`. It is for messages only and throws if the type is a problem.

- [ ] **Step 1: Write the failing tests:**
  - **grouping:** two rows for one member give one email; three members give three emails;
  - **staging:** recipients are the test inbox only;
  - **no recipient:** marked `"no recipient"`;
  - **send error:** `markFailed` per row, and the other members still sent;
  - **reminder:** the email says "Reminder" and marks `reminder_sent_at`;
  - **afterSend** is called once per sent row;
  - **notify:** with a test-registered message type, it calls the RPC with `kind = 'message'`, the registry's roles and email mode; it throws for `closed_day_conflict`;
  - **extensibility:** a test type defined only in the test goes through `notify` → claim fake → `runNotificationSend` → one email, with no change outside the test.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and add it to the cron chain.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): email pipeline, notify() and messages`

---

### Task 8: Weekly Guild summary and launch summary

**Files:**
- Create: `src/lib/notifications/guild-summary.ts`, `src/lib/notifications/guild-summary.test.ts`, `src/lib/notifications/guild-summary.server.ts`
- Modify: `src/server.ts` (the `0 13 * * *` branch: Mondays in Pacific time; and after `refreshMemberProblems` on live, the launch summary check)

**Interfaces:**
- `countWeek(rows: MemberNotificationRow[], now: Date): { found: number; resolved: number; open: number }`.
  - It counts only types with `countsInGuildSummary`.
  - A shared conflict counts once, keyed by `event_id + due_date`; other problems by `dedupe_key`.
  - "Found" means created in the last 7 days, and "resolved" means resolved in the last 7 days.
- `buildWeeklySummaryEmail(counts, origin, staging)` returns null when all three counts are 0.
- `buildLaunchSummaryEmail(rows, names, origin, staging)` lists the quiet open problems and says "not emailed".
- `isMondayPacific(now: Date): boolean`
- `sendWeeklyGuildSummary()` and `maybeSendLaunchSummary()` never throw.
  - Recipients come from the `listAdmins()` query pattern in `guild-admins.server.ts`.
  - On staging both go only to the test inbox, and the launch summary is skipped on staging.
  - The launch summary is sent once: when `launch_summary_sent_at` is null and `emails_enabled` is false. It then sets `launch_summary_sent_at`.

- [ ] **Step 1: Write the failing tests:**
  - a shared pair counts as 1;
  - a resolved-this-week row counts in `resolved`;
  - an empty week returns null;
  - `isMondayPacific` is true on Monday 2026-11-16 at 13:00Z and false on Sunday;
  - the launch summary lists the Mars and Tipzy rows and contains "not emailed".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and wire both into `src/server.ts`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(notifications): weekly Guild summary and launch summary`

---

### Task 9: Portal and /admin: Notifications screen, menu count, banner, Events flag

**Files:**
- Create: `src/lib/notifications/portal.server.ts`, `src/lib/notifications/portal-view.ts`, `src/lib/notifications/portal-view.test.ts`, `src/components/portal/NotificationsView.tsx`, `src/components/portal/NotificationsBanner.tsx`, `src/routes/admin.notifications.tsx`
- Modify:
  - `src/lib/portal/portal-sections.ts`: add `"notifications"` first in `PORTAL_SECTIONS`, label `Notifications` / short `Alerts`, open to every role (add it to `MEDIA_EVENTS_SECTIONS`).
  - `src/components/admin/AdminShell.tsx`: optional `badge?: number` on `ShellNavItem`; a `banner?: ReactNode` prop rendered above `children`.
  - `src/routes/portal._sections.tsx` and `src/routes/admin.tsx`: load the summary and pass the badge and banner.
  - `src/lib/portal/portal-shell.server.ts`: a `notifications` case in `getPortalSectionData`.
  - `src/components/portal/PortalSectionView.tsx`: a `notifications` case.
  - `adminNavItemsFor`: add `/admin/notifications`.
  - `src/components/admin/EventsEditor.tsx`: a "Closed day: hidden from the public" pill.
  - `src/lib/guild/audit-log-coverage.test.ts`: add `portal.server.ts`.

**Interfaces:**
- `getNotificationSummary` server function: session client, `requireMemberSession`. It returns `{ openProblems: number; unreadMessages: number; bannerText: string | null }`.
- `listMemberNotifications` server function: session client. It returns rows shaped by `shapeNotifications(rows, now, ctxFor)`: groups **Open**, **Unread**, then **Resolved / Read** (last 30 days), newest first, with each row's portal wording from the registry.
- `markNotificationRead` server function `({ id })`: calls the RPC, then `recordAuditLogIfImpersonating({ memberId, tableName: "member_notifications", rowId: id, action: "update" })`.
- `conflictEventIds(memberId)` gives the Events editor its pill set.
- Banner text: `"N of your events are on a day you've marked closed."` or `"Your calendar is set to UTC."`, each with **Review →**. Shown only when `openProblems > 0`.

- [ ] **Step 1: Write the failing tests** (`portal-view.test.ts`):
  - the grouping order;
  - items older than 30 days are dropped;
  - the banner text for 1 and 2 conflicts, the UTC text, and null when only messages are unread;
  - `canOpenPortalSection("notifications", { role: "media_events", ... })` is true.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Opening a message, or clicking its button, marks it read.
- [ ] **Step 4: Run** `npx vitest run`, then `npm run build` with placeholder env values. Expected: PASS, and the build succeeds.
- [ ] **Step 5: Commit.** Message: `feat(portal): Notifications area, banner, menu count and Events flag`

---

### Task 10: Guild Member alerts page

**Files:**
- Create: `src/routes/guild.alerts.tsx`, `src/lib/guild/member-alerts.server.ts`, `src/lib/guild/member-alerts.ts`, `src/lib/guild/member-alerts.test.ts`, `src/components/guild/MemberAlertsTable.tsx`
- Modify:
  - `src/components/guild/GuildShell.tsx`: a "Member alerts" link with a count, after Inquiries.
  - `src/lib/guild/guild-shell.server.ts`: an `openMemberAlerts` count in `GuildShellSummary`.

**Interfaces:**
- `getMemberAlerts` server function: session client, `requireGuildAdminSession`. It returns rows for types with `guildSees`, in the open and unread groups plus the last 30 days of resolved and read.
- `shapeMemberAlerts(rows, names, now)` (pure) gives per row: the member, the other member, the type label, the date, the event, an age like "open 3 days", **"Found at launch, not emailed"** when `quiet`, and an "Edit as them" target of `/admin/notifications`.
- The "Edit as them" button reuses `handleEditAsThem` from `RosterTable.tsx` (extract it into a shared helper, don't copy it), and navigates to `/admin/notifications`.

- [ ] **Step 1: Write the failing tests** for `shapeMemberAlerts`: a quiet row gets the launch label; the age text; types with `guildSees: false` (registered in the test) are excluded.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`, then `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(guild): Member alerts page and count`

---

### Task 11: Member Guide, staging test and launch (owner-gated)

**Files:**
- Modify: `docs/member-guide/member-profile-guide.html` (a new "Part 7: Notifications" for all types: the menu item and banner, closed-day conflicts and Special hours, the UTC calendar fix steps), plus the regenerated PDFs.

- [ ] **Step 1: Write Part 7 and rebuild.** Use the established structure (`<section class="page">`, `step-h`). Screenshots use generic sample data only: example.com and the sample logo. Run `npm run build:guides`, and confirm the text is in all three PDFs with `pdftotext`.
- [ ] **Step 2: Commit.** Message: `docs(member-guide): Part 7, Notifications`
- [ ] **Step 3: Ask the owner before pushing staging.** Once they agree, push `staging` and confirm the deploy with `npx wrangler deployments list`.
- [ ] **Step 4: Staging test by hand.** This needs the owner's **Sample Mobile member**, plus Sample Brewery published briefly with the owner's OK.
  1. Mark a closed day on Sample Brewery.
  2. Add a Sample Brewery event on that day.
  3. Add a Sample Mobile stop at Sample Brewery on that day.
  4. Within 15 minutes, check:
     - the events are hidden on the staging homepage and profiles;
     - the portal count, banner and list show the conflicts;
     - the Events pill shows;
     - the Guild page lists them;
     - **only the test inbox** receives an email.
  5. Un-mark the closed day. Check that both rows resolve and the events come back.
  6. Then unpublish Sample Brewery and remove the test events.
- [ ] **Step 5: Ask the owner before merging to `main`.** At launch, `emails_enabled` is false, so the first live check records quiet rows, hides the events and sends the one-time launch summary to Guild admins. Confirm by audit that no member email was claimed: `member_notifications` rows with `notice_sent_at` set and `quiet = false` since the deploy must be 0.
- [ ] **Step 6: After the owner reviews Member alerts,** set `emails_enabled = true`, with the owner's go.
