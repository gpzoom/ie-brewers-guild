# Member notifications: a general system, starting with closed-day conflicts and UTC calendars

**Approved in conversation:** owner, 13 November 2026. Marked *(owner)* where the owner decided; everything else is a proposal the owner accepted, or a builder's call (last section).

## Why

Members' calendars collide, mostly through **recurring events**. Tipzy Entertainment's weekly "Mars Karaoke" lands on Thanksgiving, a day Mars Brewing Co. has marked closed. Mars's own weekly Happy Hour lands there too, and Mars also posted a "CLOSED For Thanksgiving" event that shows on the homepage as if it were something to attend. Visitors see events at a taproom that's closed.

Separately, a member's Google Calendar can be set to **UTC** (Left Coast Brewing Co., Ontario). Their "2 PM Happy Hour" then shows as 6 AM. The owner chose to **tell the member** rather than convert times silently: less code, no guessing.

So the site should **find these problems, hide what's wrong from the public, and tell the members** so they fix their own calendars. The Guild should see it all too.

## Goals

- Detect **closed-day conflicts** and **UTC calendars** automatically.
- Hide conflicting events from the public until fixed.
- Tell the members involved, in a new **Notifications** area in the member portal, and by email.
- Give the Guild a **Member alerts** page and a **weekly summary email**.
- Everything **clears itself** when the members fix their calendars.

## Non-goals

- No "closed" setting for Mobile members. *(owner)* Their schedule is theirs; not listing stops means nothing.
- Weekly closed days (for example "closed Mondays") and shortened Special hours aren't conflicts, for now. *(owner)*
- No automatic time conversion for UTC calendars. *(owner)*
- No guessing from event wording (an event titled "Closed…" isn't treated as a closed day).
- Food calendar entries (`kind = 'food'`) aren't checked. Food this week already shows closed days as closed.

## Anti-goals

- **No email to a real member from building, testing or launching this.** *(owner rule, 2026-11-13)* Staging and live share one database, so this is designed in (see "Emails" and "Launch").
- A member must never be emailed about a conflict the public page doesn't hide, or the other way round. One source of truth (see "Approaches").

## What counts as closed, and as a conflict

**Closed day:** a date a **published Producer or Affiliate Member** has marked closed in **Special hours** (`special_hours.is_closed = true`), in that member's own time zone. *(owner: level 1 only)*

**An event "on" a closed day:** a live event (`kind = 'event'`, not hidden, not canceled or postponed) whose start falls on that date in the closed member's time zone. A rescheduled event counts at its new start. An all-day event counts on its own date.

**Conflicts**, checked 60 days ahead:

1. **Own conflict** *(owner)*: the closed member's own event on its closed day. Examples: Mars's Happy Hour on Thanksgiving; Mars's "CLOSED For Thanksgiving" event (the notice suggests removing it and relying on Special hours). **Notify:** that member only.
2. **Shared conflict** *(owner)*: a Guild member's stop **linked** to the closed taproom (an `event_hosts` row, whatever its status) on the taproom's closed day. Only producers host guest stops today. **Notify:** both members. This also covers the carousel's shared nights, which need a link.

**UTC calendar:** a connected calendar feed (an events calendar or a food calendar; the notice names which) whose time zone line (`X-WR-TIMEZONE`) is UTC or GMT (including `Etc/UTC`, `Etc/GMT`), when the member's time zone is different **and** the feed has at least one event with a time. A feed with no time zone line, or only all-day events, isn't flagged. **Notify:** that member.

## What happens

### Hiding

While a closed-day conflict is open, its event is hidden **everywhere the public sees events**:
- the homepage carousel;
- both members' profiles: Upcoming events, and, for a food vendor's stop, Food this week;
- the stop's pin on the Members map.

Members still see the event in their portal (Events page), marked as a conflict. A UTC alert hides nothing.

### Clearing

An alert **resolves by itself** when its cause is gone: the event is deleted, moved off the date, canceled or hidden; the closed day is un-marked; the link goes away; or the calendar's time zone is fixed. The cards come back and the notification shows as resolved. Nobody dismisses anything.

### Which site handles which members

Staging and live share one database, and both run the check. So that code under test on staging can never hide, unhide or email anything for a real member:
- **staging** checks, writes and emails only alerts whose members are all **Sample** test members (business name starting "Sample ");
- **live** handles every other alert and never touches Sample-only ones.

This mirrors how the visit emails already split the work (`claim_guest_stop_notices`, `p_sample_only`). A shared conflict between a Sample member and a real member belongs to live, so a staging test can't reach a real member.

### When the check runs

- Every 15 minutes, after the calendar refresh and the guest-stop relink, in the same cron.
- Right after a member **publishes** changes (Special hours go live only when published), saves or changes an **event**, or after a calendar **sync**, for that member and the members they share events with (like guest-stop relinking today).

## Approaches

How it's built *(owner chose A)*:

- **A. A stored record of alerts, kept current by the check (chosen).** One table holds every alert with its status. The check (a pure decision function plus a thin server wrapper, the same shape as guest-stop linking) adds, keeps or resolves rows. Public pages skip events with an open conflict. One answer to "is there a conflict?" drives hiding, emails, reminders, the Guild page and the weekly counts, and history comes for free. Cost: a change arriving by calendar sync takes up to 15 minutes to show, as calendar changes already do.
- **B. Work out conflicts on every page load.** Instant hiding, but a second code path for emails and history that must agree with the first, and extra work on every page view. Rejected: two definitions of a conflict is the bug the owner wants to avoid.

## A general notifications system *(owner: plenty of hooks for the future)*

Closed-day conflicts and UTC calendars are the **first two types** of a general member notification system. Planned later types include a **job inquiry** ("someone asked about your opening", which needs an inquiry form the Jobs board doesn't have yet) and **marketplace** offers and inquiries. Adding a type must not need a new table, a new sender or a new portal screen.

**Two kinds:**
- **Problems** clear themselves when the cause is gone: **Open** or **Resolved**. Closed-day conflicts and UTC calendars are problems.
- **Messages** tell the member something happened: **Unread** or **Read**. A job inquiry would be a message. Read state is per member for now (anyone on the team reading it marks it read); per-person read state can come later.

**The type registry:** one code file listing every type. Each entry defines:
- kind (problem or message);
- recipients, as member roles (for example everyone who can change events, or everyone who can post jobs);
- portal wording and email wording;
- email timing: right away, batched per run, with a reminder rule, or none;
- the button (for example **Edit in Events**, **Open in Jobs**);
- `guildSees`;
- whether it counts in the weekly Guild summary;
- for problems, the self-clearing rule.

**Hooks for future features:**
- **`notify(memberId, type, details)`**: one call a feature makes where the thing happens (for example when an inquiry form is submitted). Messages are created this way.
- Problems are created and cleared by their **check**: a pure decision function per problem type, run by the 15-minute cron and after the relevant saves.
- **Type-specific details** are stored with each notification (`details` JSON), so a future job id or marketplace listing needs no new columns.
- An **after-send hook** per type, for a feature that needs to react once its email has gone.
- Room for **per-person email preferences** later ("don't email me about job inquiries"): the sender asks the registry and, later, a preferences table, before choosing recipients.

Everything shared works for every type: the Notifications area, the banner and count, the email pipeline (live/staging split, quiet mode, pause switch, one email per member per run), the 30-day history and the Guild page.

## Data

**`member_notifications`**: one row per notification **per member told**. A shared conflict is two rows, one for each member, linked by the event and date.

| column | |
|---|---|
| `id` | |
| `type` | a registry type: `closed_day_conflict`, `utc_calendar` now; more later |
| `kind` | `problem` or `message` |
| `member_id` | the member this row tells |
| `dedupe_key` | what makes a problem the same problem (for a conflict: type, member, event and date; for UTC: type, member and connection) |
| `details` | type-specific facts as JSON. For a conflict: `role` (`own`, `host` or `guest`), `event_id`, `other_member_id`, `closed_date`. For UTC: `calendar_connection_id` and which calendar (events or food). |
| `event_id` | also as a column, because public hiding looks it up (conflicts only) |
| `status` | problems: `open` or `resolved`; messages: `unread` or `read` |
| `created_at`, `resolved_at`, `read_at` | |
| `quiet` | never emailed (see "Launch") |
| `notice_sent_at`, `reminder_sent_at` | email bookkeeping |

Only one **open** problem per `dedupe_key`. If a problem comes back after resolving, it's a new row (it was fixed, then broke again).

**Who can read it:**
- the member's people read their own member's rows, filtered by each type's recipient roles;
- Guild admins read all;
- the service role writes;
- a member's people can mark messages read.

Visitors can't read notifications, but public pages need to know which events are hidden: a narrow, public, read-only way to get the event ids with an open closed-day conflict (builder's call how).

## The member portal: Notifications

- **Notifications** in the portal menu, with a count of open alerts.
- While any alert is open, a short **banner on every portal screen**, for example "2 of your events clash with a closed day. Review".
- The same on the **/admin** screens, so Edit as them shows it.
- **Who sees it:** the owner, co-owners, full editors and Photos & events editors (everyone who can change events).
- **Each notification shows:**
  - what's wrong, in plain words ("Tipzy Entertainment's *Mars Karaoke* is on **Thu, Nov 26**, a day Mars Brewing Co. has marked closed (Thanksgiving)");
  - the other member, if shared;
  - what to do, with buttons: **Edit in Events**; for the closed member, **Check Special hours** (on Basics & hours); for a guest, "contact the taproom";
  - **Open** or **Resolved**. Resolved alerts stay listed for **30 days**.
- The list shows every type: problems (Open, Resolved) and messages (Unread, Read), with each type's wording and button from the registry.

## The Guild

- A **Member alerts** page in the Guild admin area (next to Roster and Inquiries). It lists notifications across all members:
  - for problems: who, the date, the event, and how long it's been open;
  - for messages: who, what, and when;
  - a link that opens **Edit as them** on the right screen;
  - resolved and read items for 30 days.
- **The Guild sees every type for now** *(owner)*, messages included: every type's `guildSees` is on. Trimming later means switching a type's `guildSees` off, with no other change.
- A count on the Guild admin home ("3 open member alerts", counting open problems).
- **Weekly summary email** *(owner)*: the number of conflicts **found** and **resolved** that week, plus how many are still open, with a link to Member alerts. It goes out **Monday morning** to the people on the Guild Admins page, and weeks with nothing to report are skipped. A shared conflict counts as one conflict, not two.

## Emails

- **When a conflict is found:** one email per member per check run, listing all of that member's new conflicts (for example Mars closing for Christmas week).
- **Reminder** *(owner)*: if a conflict is still open **3 days before the closed date**, one reminder to the members involved. At most 2 emails per conflict.
- **UTC calendar:** one email when found. No reminder; the banner and the Guild page stay until it's fixed.
- **Recipients:** the member's owner, co-owners, full editors and Photos & events editors.
- **No "resolved" email.**
- **Live vs. staging:** staging and live share the database and both run the check. As with the visit emails, **only the live site emails real members**; staging handles only Sample test members and sends to the test inbox (`STAGING_GUILD_NOTIFICATION_EMAIL`). Each email is sent once even though both sites run the check.
- **A pause switch** like `guest_stop_send_pause` holds all alert emails in place when needed.

## Launch: start quietly *(owner)*

Conflicts and UTC calendars that already exist at launch show **only in the portal and on the Guild page**: no email, and no reminder. Only alerts that appear after launch are emailed.

Mechanism: alert emails ship **switched off**. Every alert created while they're off is stored `quiet` and is never emailed. After the first check has recorded today's alerts, and the owner has reviewed them, the switch goes on.

**Hiding starts straight away** *(owner)*: the first live check hides today's conflicting events from the public at once, even though their members aren't emailed.

**The Guild is told** *(owner: the admin needs to know)*: when the first live check finishes, the people on the Guild Admins page get a **one-time launch summary email**. It says how many conflicts and UTC calendars were found, which events are now hidden, and that the members were not emailed, with a link to Member alerts. On that page, alerts from the launch are marked **"Found at launch, not emailed"**, so the Guild knows which members haven't been told and can contact them.

**Sample members are never quiet.** Their alerts are tests, and staging sends them only to the test inbox, so staging can test the emails before launch while real members' alerts stay quiet.

Before launch, a **dry run against the live data** (read only) lists every alert the first check would create.

## Testing

- **Registry and hooks:** a test type defined only in a test proves a new type works end to end through `notify()`, the portal list and the sender, with no other change.
- **Unit tests (pure decision function):**
  - own and shared conflicts, by date in the member's time zone;
  - rescheduled, canceled, hidden and all-day events;
  - 60-day window;
  - Affiliates (own only) and Mobile members (never closed);
  - resolving each way it can resolve;
  - a problem that returns makes a new alert;
  - reminder timing (3 days before, once);
  - quiet alerts never emailed;
  - UTC detection (UTC/GMT variants, no time zone line, all-day-only feeds, member already in UTC).
- **Hiding tests:** homepage carousel, both profiles, Food this week, map pins.
- **pgTAP:** who can read which rows; the public hidden-event list exposes nothing else; only the service role writes.
- **Emails:** the live/staging split; one email per member per run; the weekly Guild summary counts and skip-empty rule; the pause switch.
- **Staging by hand:** with **Sample Brewery** and a **Sample Mobile member** the owner creates. Mark a closed day, add a linked stop and an own event on it, and check hiding, the portal, the Guild page and the test-inbox emails. Then clear it and check it resolves. Never on a real member.

## Screens and emails to design (Claude Design)

1. Portal: **Notifications** screen (open and resolved), the **menu item with count**, and the **banner**.
2. The same on **/admin** (Edit as them).
3. Events page: how a conflicting event is marked.
4. Guild admin: **Member alerts** page, and the count on the Guild home.
5. Emails:
   - conflict found (own / host / guest wording);
   - reminder;
   - UTC calendar;
   - weekly Guild summary.

## Before going live

- Update the Member Guide (HTML and PDFs): the Notifications area, what a closed-day conflict is, and the UTC calendar alert.

## Builder's calls

- How public pages learn which events are hidden (a view, a security-definer function, or a column), as long as visitors learn nothing but the event ids.
- How the two sites avoid sending the same email twice (claiming rows, as the visit-email queue does, is the known-good pattern).
- Where the UTC check reads the feed (during the calendar sync, which already downloads it, is the natural place).
- The cron schedule for the Monday summary (for example inside the existing daily `0 13 * * *` run, on Mondays Pacific time).
