# Scan Pass: one-scan check-in and location flags (design)

Owner request 2026-11-24. Status: approved by the owner 2026-11-24.

## Why

A check-in takes two scans today: the counter plate, then the staff QR. The
counter plate is public, so the first scan adds friction without adding
protection. At a busy bar the customer wants one scan and one tap, staff want
to show a code and look at a screen, and the owner wants odd visits to stand
out. Scan Pass isn't live, so this is the time to change it.

## Goals

- A returning customer checks in with one scan of a staff QR and one tap, at
  any member, with the phone's regular camera or the pass's own scanner.
- The counter plate is for getting a pass (free or Beer Trail), signing in,
  and the 4-digit backup.
- A saved, reloaded or reopened page can't record a visit by itself.
- Each check-in records whether the phone was near the taproom, and the
  activity list flags the ones that weren't.

## Non-goals

No blocking on location, no rotating codes, no staff logins. No change to
rewards, loyalty, milestones, named staff codes, the 4-digit lockout, undo,
or the one-visit-a-day rule.

## Anti-goals

- A real customer refused at the bar because of location, a slow phone or a
  declined permission.
- The customer's coordinates stored, or shown to a member.
- A flag that reads as an accusation.

## Approaches considered

1. **Today: plate, then staff QR.** Slowest; "scan the counter plate first"
   and "wrong brewery" errors; no real protection from the public plate.
2. **A: staff QR only through the pass's scanner.** Keeps the staff code out
   of any link, but customers who use the regular camera get an extra step.
3. **B: staff QR with any camera (owner's choice, 2026-11-24).** The scanned
   link is swapped at once for a short-lived, one-time check-in on a page
   with no code in its address. Equal to A against deliberate fraud (a photo
   of the QR works in both), and the quickest for everyone.

Location was considered as a block and rejected: permission can be declined,
indoor readings are off by a block or more, and it can be faked. It is a
flag only (owner, 2026-11-24).

## How a check-in works

1. The customer scans a staff QR (`/s/<token>`, unchanged, so printed codes
   keep working).
2. **Signed in, code working:** the server notes the scan on the phone's
   session row (member, the staff code scanned, the time) and sends the
   browser to `/card` with a replace, so the token isn't the page's address.
3. `/card` opens a **check-in modal** whenever this session has a scan less
   than **5 minutes** old: the member's name, then **Check in** and each
   waiting reward as choices (same wording as the plate today). Close drops
   the scan.
4. The tap confirms. Using a reward asks "Use it now? This can't be undone
   without a staff member." first. The server takes the scan once (the same
   claim-by-time pattern as `claimPlatePending`), checks the staff code is
   still on, and records the visit and its source exactly as today.
5. The confirmation is the existing full-screen success screen with the live
   clock and "Confirmed at"; staff look at it.

The pass's own scanner (on `/card` and on the plate page) reads a staff QR
without leaving the page: it notes the scan through a server function and
opens the same modal.

Other cases:

- **Signed out:** the `/s/<token>` page shows "Sign in to your Scan Pass"
  (the emailed code form, in place) and, below it, "Get a pass" linking to
  the free-pass and Beer Trail pages for that member's plate. After signing
  in, the page reloads and step 2 happens.
- **Turned-off code:** today's message and activity row. No scan is noted.
- **Member not taking check-ins:** today's "isn't taking Scan Pass check-ins
  right now".
- **Scan older than 5 minutes, or already used:** the modal doesn't open; a
  late tap says "Scan the staff QR code again."
- **Already checked in today:** the modal says so; a reward can still be used
  (unchanged rule).

Removed: the plate's Continue step, the held choice, and the
"scan the counter plate first" and "wrong brewery" screens.

## The counter plate (`/t/<code>`)

- **Signed out:** unchanged (get a free pass, join the Beer Trail, sign in).
- **Signed in:** "To check in, scan the staff QR code" with the in-page
  scanner button, the rewards waiting here (to read, not to choose), Join the
  Beer Trail when it applies, and "Enter the staff code instead", which keeps
  today's 4-digit form with its reward choice.
- A new pass holder lands here after signing up, so the first visit is: get
  the pass, tap Scan, scan the staff QR, tap Check in.

## Location flags

- On the confirming tap (QR modal and the 4-digit form), the page asks the
  phone for its position, waits at most 4 seconds, and sends the result with
  the confirmation. Declined, unavailable or late: the check-in goes ahead.
- The server compares it with the member's saved latitude and longitude and
  stores only one word on the activity row: `near`, `far` or `none`. `far`
  means the distance minus the phone's stated accuracy is more than
  **400 meters** (about a quarter mile). Coordinates are never stored.
- Nothing is stored (null) for Mobile members and members with no saved
  coordinates; they never get a location flag.
- Flags, with the limits in `FLAG_LIMITS`:
  - **Far from the taproom:** any `far` check-in.
  - **No location:** a customer with 3 or more check-ins at this member in
    the range, none of them `near`.
- **Red dot** (owner, 2026-11-25): the green confirmation screen shows a red
  dot in its upper right corner when the visit's check-in or reward was far
  away, had no location (one is enough here), or was outside open hours. It
  never stops the check-in.
- The activity list shows near / far / no location on each row. The existing
  line above it stays: a flag means it's worth a look, not proof.
- "Outside open hours" already exists; add a test that a check-in on a
  closed day is flagged.

## Database (only on the owner's go-ahead, before the code)

Adds only; live doesn't read these tables' new columns.

- `tap_card_sessions.pending_staff_code text`: the staff QR scanned, held
  with the existing `pending_member_id` and `pending_at`.
  `pending_plate_code` and `pending_choice` stop being written.
- `tap_card_staff_activity.location text` (`near`, `far`, `none`, or null).

## Before live

- Privacy Policy: the phone's location is checked at check-in, only
  near/far is kept, and members see it without the customer's name. The
  owner approves the wording; the effective date moves with the Scan Pass
  launch.
- Print kit copy, counter card, table tent and staff cards: one scan, not
  two.
- Member Guide (HTML and PDFs) and screenshots.

## Left to the builder

File layout, the modal's markup (reuse the plate's choice list and
`PlateSuccess`), and tests in the existing style. `decideStaffQrView` loses
its plate cases; keep its tests in step.

## Claude's calls (owner can change any)

- 5-minute window between scan and tap.
- The modal appears on `/card`, so both scanning routes end on one screen.
- "No location" covers both a declined permission and a phone that couldn't
  answer in time, and is flagged only as a pattern (3 or more, none near),
  because many honest customers decline.
- 400 meters, less the phone's stated accuracy.
- Location is asked on the 4-digit path too.
