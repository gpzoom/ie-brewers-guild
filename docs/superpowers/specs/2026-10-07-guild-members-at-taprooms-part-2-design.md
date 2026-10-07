# Guild Mobile members at taprooms, Part 2: "Ask me first" and emails (design)

**Approved:** the design in conversation (owner, 7 October 2026). **Builds on:** Part 1, `docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md` (live on staging). **Artboard:** GV2 `GuildVendorEmails` (to be updated to match this spec: Events page instead of Food page, owner and full editors, the button pages); GV1 gains the setting and the new statuses.

## Goal

A taproom can choose whether Guild Mobile members' stops show on its page **right away** (today's behavior, the default) or only after it **approves** them. Either way, the taproom's owner and full editors get an **email** when a Guild member lists a visit there, changes it, or cancels it, with buttons that work without signing in.

## Owner decisions (7 October 2026)

- **Default:** "Show them on my page right away". A taproom opts into "Ask me first".
- **Recipients:** the taproom's **owner and full editors** (`member_users.role` in `owner`, `editor`).
- **Show right away still emails** every new visit, batched (one email per taproom per run).
- **Decline or Hide is quiet:** no email to the Mobile member. Their page still lists the stop, but without the taproom link.
- **A date or time change keeps the visit's status** (an approved visit stays approved) and emails the taproom. A stop moved to another taproom is a new visit there.
- **The pending label** in the box reads **"Waiting for approval"**.
- **Send queue (approach A):** notes in the database, claimed and sent by the 15-minute run, one email per taproom per run.

## The setting

- **Where:** the Events page box, "Guild members at your taproom" (portal and /admin), producers only:
  ○ **Show them on my page right away** (default) · ○ **Ask me first**.
- **Stored:** `members.guest_stops_mode text not null default 'show' check (guest_stops_mode in ('show','ask'))`.
- **Who changes it:** the owner and full editors, through a SECURITY DEFINER `set_guest_stops_mode(p_member_id uuid, p_mode text)`, and Guild admins through Edit as them. The server function audits a Guild admin's change, as other immediate saves do. It saves straight away (not drafted), like the kitchen switch. A Photos & events editor sees the setting but can't change it.
- **Switching "Ask me first" → "Show right away":** every **pending** link of that taproom becomes **shown**, in the same function. Switching the other way changes nothing already shown.

## Statuses

`event_hosts.status` gains `pending` and `declined` (check constraint widened):

| Status | On the taproom's page, food week, homepage | Box line | Buttons |
|---|---|---|---|
| shown | yes | "On your page" | Hide |
| hidden | no | "Hidden from your page" (faded) | Show |
| pending | no | "Waiting for approval" | **Approve** / **Decline** |
| declined | no | "Declined" (faded) | Show |

- `set_event_host_status` accepts `shown`, `hidden` and `declined` from the host's people (Approve is `shown`). Who may call it is unchanged: the host's owner, either editor role, or a Guild admin. `pending` is never set by people, only by the linker.
- **The linker:** a new link is `shown` when the taproom's mode is `show`, `pending` when it's `ask`. The same taproom as before keeps the status. A move to another taproom starts fresh under that taproom's mode.
- **Public reads** stay `status = 'shown'` only, so pending, hidden and declined visits show nowhere public.
- **The Mobile member's own page** links a stop to the taproom only while its link is **shown**. This replaces Part 1's live matching for that link (owner: no link to a taproom that declined, hid, or hasn't approved). A stop beyond the 60-day linking window has no link yet.
- **The Events box and the Food page list** show pending rows with Approve / Decline. The Food page's list covers food vendors, as in Part 1.

## Emails

### What sends one

Only visits whose link is **shown** or **pending**, and only upcoming ones (ending in the future, starting within 60 days). Nothing is sent about visits the taproom hid or declined, or about past ones.

| Change | Kind | Subject (one visit) | Body (as GV2) | Buttons |
|---|---|---|---|---|
| New link, mode show | `new` | "*Guest* is coming to *Taproom* · Fri, Oct 2" | "*Guest*, a Guild member, listed a stop at your taproom:" + day, time, taproom and street + "It's on your page now." | See your page · **Hide this visit** |
| New link, mode ask | `request` | "Approve a visit? *Guest* · Sat, Oct 3" | "…would like to be listed at your taproom:" + details + "Nothing shows on your page until you approve." | **Approve** · **Decline** |
| Start or end time changed (incl. rescheduled) | `changed` | "Changed: *Guest* moved to Sat, Oct 3" | old day and time → new day and time + "Your page already shows the new date." (pending: "It's still waiting for your approval.") | See your page · **Hide this visit** (pending: Approve · Decline) |
| Canceled, postponed, deleted, hidden by the member, or moved to another place | `canceled` | "Canceled: *Guest* · Fri, Oct 2" | "*Guest* canceled their stop at your taproom:" + details + "It's off your page." | See your page |

- The visit's title, when it has one, follows the guest's name ("Tacos El Gordo — Taco Tuesday").
- **Footer:** "You get this because you're an owner or editor of *Taproom* on the ISC Brewers Guild site. Choose Show right away or Ask me first on your Events page."
- **Several visits in one run** for the same taproom go in **one email**: subject "*N* Guild member visits at *Taproom*" (or "*N* visits to approve at *Taproom*" when all are requests). The body lists each visit with its own heading and buttons, in date order.
- Day and time are in the taproom's time zone, written like the profile ("Friday, October 2 · 5:00 – 9:00 pm").

### The send queue

- **`guest_stop_notices`**, one row per note: `id`, `host_member_id`, `event_id` (nullable: the event may be gone), `kind`, a snapshot of `guest_name`, `title`, `starts_at`, `ends_at`, `all_day`, and for `changed` the previous `old_starts_at`/`old_ends_at`, plus `created_at`, `claimed_at`, `sent_at`, `attempts`, `last_error`. Service role only (RLS on, no policies).
- **What was last told** lives on the link: `event_hosts.notified_starts_at`, `notified_ends_at`. The linker compares them to the stop's effective times to detect a change, writes a `changed` note, and updates them.
- **Written by the linker**, in the same run that creates or changes the link:
  - a new `shown` or `pending` link → `new` or `request`;
  - a linked `shown`/`pending` stop whose effective start or end differs from what was notified → `changed`;
  - a linked `shown`/`pending` stop that becomes canceled, postponed or member-hidden → `canceled` (once: a flag `event_hosts.cancel_notified`, cleared if it comes back).
- **A link that disappears** (the stop is deleted, or moved away from this taproom) while it was `shown` or `pending` and upcoming → a `canceled` note written by a database trigger on `event_hosts` delete, from the link's own snapshot. So the link also keeps `guest_name`, `title` and the notified times.
- **Sending:** the 15-minute job, after relinking:
  1. **Claims** unsent notes atomically (one SQL function, `claim_guest_stop_notices(p_limit int, p_host_filter uuid[])`: `update … set claimed_at = now() … where sent_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes') … for update skip locked returning *`). Two Workers never get the same note.
  2. Groups them by taproom, drops `changed`/`new` notes whose visit has since been canceled in the same batch (only the `canceled` goes), and builds one email per taproom.
  3. Looks up the recipients (owner and full editors' sign-in emails) and sends through Resend (`sendTransactionalEmail`).
  4. Marks the notes `sent_at`, or on failure clears `claimed_at`, increments `attempts` and keeps `last_error`. After 5 attempts it stops retrying.
  5. A taproom with no owner or editor email: the notes are marked sent with `last_error = 'no recipient'`.
- **Delay:** within about 15 minutes of the change.

### Staging and the live site

Both Workers share the database. To keep test mail away from real members:
- **The live site** sends every note, except those for the Sample test members (it leaves those to staging).
- **Staging** claims only notes whose taproom is a Sample test member (`business_name` starting "Sample "), and sends them only to the test inbox, **boblelle77+iscadmin@gmail.com** (`STAGING_GUILD_NOTIFICATION_EMAIL`). Links in staging's emails point to staging.
- The Worker knows which site it is from its site URL (`isStagingSite`).

## The email buttons

**Approve**, **Decline** and **Hide this visit** never act in one click (email scanners open links, as learned with sign-in). Each opens a page on the site, `/visit/$token`, built like "Finish signing in" (bare layout):

- It shows the visit: the guest, the day and time, the taproom.
- One button: **Approve this visit**, **Decline this visit**, or **Hide it from my page**.
- Opening the page changes nothing; only the button does.
- **After pressing:** "Approved. It's on your page now." / "Declined. It won't show on your page." / "Hidden. It's off your page." + "Changed your mind? Your Events page has every visit." (linked to the portal's Events page).
- **If the visit was already answered** (on the Events page or from another email), the page shows the current status ("This visit is already on your page.") with the same Events page link.
- **If the visit is over, deleted, or no longer at this taproom:** "This visit is no longer at your taproom."

**The token:**
- HMAC-signed, like the hours confirmation (`confirm-token.ts`): event id, host member id, action (`approve`, `decline`, `hide`), expiry. It uses a new secret, `GUEST_STOP_LINK_SECRET`, set in both Workers.
- It expires at the visit's end, or after 60 days at most.
- It is valid only while the link still belongs to that taproom.
- A choice made this way is applied by the page's server function, after it verifies the token, with the service role. It is one update, `where event_id = … and host_member_id = …`, setting `status_set_by_user_id = null`. The audit log isn't involved (nobody is signed in).

## Out of scope

- Emails to the Mobile member.
- Daily or weekly digests.
- Approving on behalf of a whole Mobile member ("always allow Tacos El Gordo"). This could come later.
- Changing who the emails go to per taproom.

## Testing

**Unit tests (pure):**
- the linker's status for a new link under each mode, for a same-taproom change and for a move;
- which notes a run writes: new, request, changed (start, end, rescheduled), canceled (canceled, postponed, member-hidden), nothing for hidden or declined, nothing for past visits, and a canceled note only once;
- grouping per taproom, dropping superseded notes, subjects for one visit and for several;
- each email's text and buttons;
- the token: valid, altered, expired, wrong action;
- the button page in each state;
- the box and Food list rows for pending and declined;
- the mobile profile linking only shown stops.

**pgTAP:**
- the widened status check;
- `set_event_host_status` accepts `declined` and refuses `pending` from people;
- `set_guest_stops_mode`: allowed for the owner and full editors and Guild admins, refused for a Photos & events editor and strangers; switching to `show` turns pending into shown;
- the delete trigger writes a `canceled` note only for an upcoming shown or pending link;
- the claim function never returns the same note to two claims, and respects the host filter;
- `guest_stop_notices` is unreadable by anon and authenticated.

**Audit:** the setting's server function is in the audit-log coverage test.

**By hand on staging** (with the owner's OK to publish the Samples briefly):
1. Turn on Ask me first for Sample Brewing.
2. As Sample Taco Truck, add a visit there.
3. The approval email arrives at the test inbox within 15 minutes.
4. Approve from the email's page.
5. Change the time: the "Changed" email arrives.
6. Cancel the visit: the "Canceled" email arrives.
7. Switch back to Show right away, and add another visit: the "coming" email arrives with Hide.
8. Clean up.
