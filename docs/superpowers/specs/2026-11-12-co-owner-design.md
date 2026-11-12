# Co-owner access level — design

Date: 2026-11-12. Status: approved by the site owner 2026-11-12.

## Why

Mars Brewing is run by a husband and wife who both need full admin access. One is the profile's
owner; the other could only be invited as a Full editor. When the wife tried to add a food calendar
she was blocked: "Only the profile's owner can connect one." Today the site allows exactly one owner
per profile (a unique `role = 'owner'` row per member in `member_users`), and several things are
owner-only: People, the events and food calendar connections, the "We have our own kitchen" switch,
and Guild emails about the profile.

Success: both partners can do everything on their profile, including connecting calendars and
managing People, without anyone having to think about who the "real" owner is. Both get the
Guild's emails about the profile.

## What a co-owner is

A new access level, **Co-owner**, alongside Owner, Full editor and Photos & events editor. A
co-owner has the owner's rights on that one profile, with the exceptions below.

### A co-owner can (same as the owner)

- Edit, publish, discard and unpublish every section; run the setup wizard.
- Connect, change, refresh and remove the events calendar and the food calendar.
- Turn "We have our own kitchen" on and off.
- Request a member-type change.
- Open People: invite, resend, cancel and remove **Full editors** and **Photos & events editors**.
- Everything else on the profile the owner can do today (if the builder finds another owner-only
  check, a co-owner passes it unless it's listed under "cannot" below).

### A co-owner cannot (the owner keeps these)

- Invite a co-owner, or remove or change another co-owner. Only the owner (or a Guild admin
  editing as them) does that. This covers pending invites too: a co-owner can't resend, cancel or
  re-invite (and so re-role) an address with a pending Co-owner invite. Enforced in `people.ts`
  and in the database write path.
- Remove or demote the owner. As today, only the Guild can change who the owner is.
- Hand off or take back a location (multi-location business-manager actions stay as they are).

### A co-owner can leave

People shows a "Leave this profile" action on the co-owner's own row. It ends their own access,
after confirmation.

### Disputes

The owner has the final say. Changing the owner stays a Guild action ("contact the Guild").

## Owner's People actions

- The role picker when inviting gets a **Co-owner** option, shown only to the owner and to a Guild
  admin editing as them. Description: "Everything the owner can do, including People and calendars.
  Only you can add or remove co-owners."
- The owner can remove a co-owner like any other person.
- **Change access**: each person on People gets a way to change their level (Photos & events ↔
  Full editor ↔ Co-owner) without removing and re-inviting. Who can make each change follows the
  rules above (only the owner can move someone to or from Co-owner).
- No limit on the number of co-owners.

## Emails

Every Guild email that today goes to "the member's account" (the owner) goes to **the owner and
every co-owner**. Today that is `creator_upload_pending` and `hours_stale` (resolved through
`pickAccountUserId` in `src/lib/email/resolve-recipient.server.ts`). Any future email of that kind
follows the same rule. Each person gets their own copy (not one email with everyone in To:).

Business managers on handed-off locations are still excluded, as today.

Invites: a new co-owner invite email, worded like the editor invite but naming the Co-owner level.

## Guild side

- The Guild roster shows co-owners alongside the owner for each member.
- "Edit as them" is unchanged: a Guild admin already acts with owner rights, so they can add or
  remove co-owners.
- **Every People change is audit-logged, whoever makes it** (owner's decision 2026-11-12): invites,
  resends, cancels, removals, access changes and leaves, by the owner, a co-owner, a location
  manager or a Guild admin. Today People actions are logged only while a Guild admin is editing as
  the member (`recordAuditLogIfImpersonating` in `portal-people.server.ts`); this needs a logging
  path for ordinary members' own actions, recording the real actor. The point is a record the
  Guild can check if partners ever disagree about who removed whom.

## Multi-location businesses

Co-owner applies to one profile (one location) only. The business manager role across all
locations is unchanged. On a handed-off location, the location manager (that location's owner)
can add co-owners for their location.

**Hand-off and take-back demote co-owners** (owner's decision 2026-11-12). The existing SQL
functions (`20261018100000_location_handoff.sql`) move only the owner row. They must also change
every co-owner of that location to Full editor when a location is handed off and when it is taken
back. Those people keep editing access but lose People, calendars and Guild emails, and whoever is
now in charge can promote them again. Pending Co-owner invites for the location are canceled at
the same moment.

**The business manager can never be a co-owner of a handed-off location.** Their editor row on
that location can't be moved to Co-owner, so they never receive that location's Guild emails.

## Constraints

- Enforcement lives in the database (RLS and SQL helpers such as `is_member_full_editor`,
  `calendar_connections_owner_writes`, `set_member_has_kitchen`), not just hidden buttons. Every
  owner-only check must be reviewed and widened to co-owner where this design says so.
- Database changes go to staging first. `supabase db push` needs the site owner's go-ahead.
- All on-screen text in US English.
- The Member Guide (web page and PDF) gets a co-owner section before this goes live.
- New editing features must also work through `/admin` (Edit as them).

## Left to the builder

- Whether "co-owner" is a new `role` value in `member_users` (most likely) or a flag.
- The exact UI for Change access and Leave this profile, following the existing People
  artboards' style.
- Labels on multi-location profiles (e.g. "Co-owner · {city}").
- Migration naming, tests, and the order of work.

## Member Guide notes

The guide (`docs/member-guide/member-profile-guide.html`, rebuilt to the three PDFs in `public/` by
`scripts/build-member-guides.mjs`) is updated when this feature is ready on staging, and before it
merges to main. Screenshots follow the usual rules: example.com addresses and the sample logo, never
real Guild or owner details. Changes:

1. **People paragraph (currently line ~232, "The owner can invite others under People...").**
   Rewrite to list the three levels an owner can give:
   - **Co-owner:** everything the owner can do, including People and both calendars, and gets the
     Guild's emails about the profile. Only the owner can add or remove co-owners. Good for
     partners who run the business together.
   - **Full editor:** everything except People and calendar connections.
   - **Photos & events:** just those two sections.
   Add one line: "Each person gets their own sign-in email."
2. **Change access.** A short note with a screenshot: on People, use **Change access** next to a
   person to move them between levels without re-inviting them. Only the owner can make someone a
   co-owner or change a co-owner.
3. **Leaving.** One line: a co-owner can leave a profile from their own row on People. (Editors
   don't see People; the owner removes them.)
4. **Calendars (Events and Food).** Where the guide covers connecting a calendar, say the owner
   **or a co-owner** connects it; editors see its status and can press **Refresh now**.
5. **Managing several locations (section "Managing several locations").** Add to the hand-off
   notes: when a location is handed off or taken back, its co-owners become Full editors; the new
   person in charge can make them co-owners again. Add to the Location manager card: "You can
   invite editors and co-owners for your location."
6. **Emails.** One line where the guide mentions Guild emails (or in the People paragraph): the
   owner and every co-owner each get the Guild's emails about the profile.
7. **History.** One line in the People paragraph: every change on People is recorded, so the
   Guild can see who invited or removed whom.

## Confirmed calls (owner approved 2026-11-12)

- Co-owners can use the "We have our own kitchen" switch and request type changes.
- No cap on the number of co-owners.
- Co-owners can't hand off or take back locations.
- "Change access" is part of this work rather than a separate change.

## Calls made while planning (Claude's)

- On a handed-off location, the business manager (an editor there) manages editors only, like a
  co-owner; adding or changing co-owners there is the location manager's.
- Only co-owners get "Leave this profile" (editors can't open People).
