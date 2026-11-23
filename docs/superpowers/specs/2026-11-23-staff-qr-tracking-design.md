# Named staff QR codes with activity tracking: design

Owner request 2026-11-23. Status: draft for owner approval.

## Why

A photographed staff QR can be used for check-ins and rewards without a real visit. Today each member has one staff QR, and a visit doesn't record what confirmed it. An owner who notices something odd can't tell where it came from, and replacing the code disrupts everyone. This gives owners and co-owners information to trace a problem to one code and shut off only that code. It helps them mitigate fraud; it does not prove or prevent it.

## Goals

- One behind-the-counter QR, plus one active QR and one active 4-digit code per named staff member.
- Owners can turn off the shared 4-digit code, so every check-in and undo made with a 4-digit code has a name.
- A name is typed once, then chosen from a drop-down when a new code is needed.
- Activity is recorded per code and kept when a code is replaced or turned off.
- Flags mark patterns worth a look.

## Non-goals

No location checks, blocking, automatic emails, staff logins, or rotating codes. No change to the customer's steps.

## Anti-goals

- A flag that reads as an accusation.
- Losing history when a code is replaced.
- A tracking failure that stops a real customer's check-in.
- The customer's name, email or phone shown to members.

## Constraints

- Staging and live share one database, and live runs the old code until merge. The migration must only add. `tap_card_plates.staff_qr` stays and keeps holding the behind-the-counter code, so printed codes and live keep working.
- Named codes made on staging won't work on live until merge.
- Scan Pass tables are server-only (row-level security on, no policies). Same for new ones.
- Works in the portal and /admin (Edit as them), which share `TapCardSection`.
- **Privacy Policy conflict.** It says Guild members see pass and email-consent totals "but not your name, email address or visits". Activity shows visits under an anonymous label, so the policy must be updated (visits seen without a name or email, which staff code confirmed them, and staff names kept) before this goes live. The owner must approve the wording.
- Owner-level permission already exists: `is_member_owner_level()` (owner, co-owner, Guild admin).
- US spelling. Member Guide (HTML and PDFs) updated before live.
- Database push only on the owner's go-ahead, before the code.

## Approaches considered

1. Activity log only. Simplest; problems surface only if someone reads it.
2. **Activity log plus flags (owner's choice, 2026-11-23).** Points owners at what's worth a look; flags can be false alarms.
3. Flags plus a phone location check. Goes further, but needs customer permission, is unreliable indoors, can be faked, and needs a Privacy Policy change.

## Codes

- **Behind the counter:** `tap_card_plates.staff_qr`, unchanged in use. "Make a new one" replaces it at once.
- **Named staff:** table `tap_card_staff` (member, name, created, removed). Names are unique per member ignoring case and extra spaces, 1-40 characters. Names can be renamed or removed from the drop-down; history stays. Removing a person turns off their code. Typing a removed name again brings that person back.
- **Codes:** table `tap_card_staff_codes` (member, staff person or null for the counter, kind `qr` (8 characters, existing format) or `pin` (4 digits), created, turned off). Each person has at most one active code of each kind. Both are made together; each can be replaced alone, which turns off the old one. Turn off stops both.
- Named codes use the same `/s/<token>` page. A token is looked up in the named codes, then in `tap_card_plates.staff_qr`. Generation checks both so they can't clash.
- When the counter code is replaced, the old token is kept in `tap_card_staff_codes` as a turned-off counter code, so later use of it can be recognized. A replacement made on live before merge isn't kept; that is acceptable.
- A turned-off code shows customers: "This staff code no longer works. Ask the staff for the current one." Nothing is recorded as a visit.

## 4-digit codes (owner decision 2026-11-23: option B)

- The site picks each person's code at random. It must differ from every personal code that member has ever issued and from its shared code. Saving a shared code that matches any of those is refused.
- The shared code stays in `tap_card_plates.staff_code`. An owner may turn it off once at least one staff member has an active personal code, and back on at any time. Turning it off is a separate column; the stored code is kept, because live still uses it until merge. The screen says this until then.
- On staging and after merge, a typed code is checked against active personal codes and, if it's on, the shared code. If one matches both (possible only through a change made on live before merge), it's recorded as the shared code, so nobody is wrongly named.
- A turned-off personal code or turned-off shared code counts as a wrong try. The lockout (5 tries in 15 minutes per customer and plate) is unchanged.
- The plate is on when it has a shared code (even if turned off) or an active personal code. If the shared code is off and the last personal code is turned off, the staff QRs still work but codes and undo don't; the screen warns before and after, and it doesn't turn the shared code back on by itself.
- Considered: A, always keep the shared code (leaves an untraceable way in); C, remove it for everyone (every taproom must set up staff first). B lets each taproom choose.
- Never printed on staff cards.

## What is recorded

Table `tap_card_staff_activity`, one row per event:

- member, customer (holder), time, visit, event: `check-in`, `reward-used`, `reward-undone`, `turned-off-code`
- source: `staff` (with the person, the code, and whether QR or 4-digit), `counter` (with the code text), or `staff-code` (the shared 4-digit code)
- reward text at the time, for reward events

Rules:

- A second confirm on the same day adds no second check-in, but a reward used then is its own event with its own source.
- Undo needs a 4-digit code, so an undo shows under the person whose code was typed, or under "Shared code".
- A turned-off QR is recorded only for a signed-in customer, once per customer, code and day. Looking at the page records nothing else.
- If writing activity fails, the check-in still succeeds and the error is logged on the server.
- Deleting a customer deletes their activity (as with visits). Deleting a member deletes all of theirs.
- Plastic-card bar devices (hidden) aren't tracked here.
- "Reset demo visits" also clears activity for the Samples.

## Who can do what

- **Owner, co-owner, Guild admin (Edit as them):** make, replace, turn off, rename and remove staff codes; see, download and print them; see, replace and turn off 4-digit codes (personal and shared); see activity.
- **Full editor:** keeps the counter plate and its printing (counter card, table tent). No longer sees or prints staff QR codes or any 4-digit code, and can't see activity. A full editor could be the person being looked into.
- Enforced on the server. `getCounterPlate` currently returns the staff secrets to full editors, so it must be split; hiding them on screen isn't enough.

## Screens

Within Scan Pass, in this order: Beer Trail, Print kit, Counter plate (plate only), **Staff QR codes**, **Staff activity**, pass sales, offers. The shared code moves into the Staff QR codes box.

```
Staff QR codes
  Behind the counter     7K2M-9QX4   [Download] [Make a new one]
  Maria   QR 3F8A-1TTP  Code 4816   [Download] [New QR] [New code] [Turn off] [...]
  Jake    off                       [Make codes] [...]
  Shared 4-digit code    2580        [Save] [Turn off]

  New staff codes
  Staff member [ Choose a name   v ]   (or: Add a name...)   [Make codes]

Staff activity        [ Last 30 days v ]
  Maria              42 check-ins   9 rewards   1 undone   ! 6 outside open hours
  Jake               38 check-ins   7 rewards
  Behind the counter 55 check-ins  11 rewards
  Shared code         4 check-ins   1 reward    2 undone
  Before tracking    210 visits
  (choose a row to see its list: date, time, Customer 4F2, event, reward, flags)
```

- Activity range: last 7, 30 (default) or 90 days, or all time. Newest first, 50 at a time.
- "Before tracking" counts visits in the range that have no activity row.
- Choosing a name that has an active code asks first: "Maria's current QR and 4-digit code will stop working right away."
- Customer label: the same customer gets the same label within one member and a different label at another, derived on the server from a hash; no customer id reaches the browser.
- Print kit "Staff cards" asks which code: behind the counter or a named person. A named card also prints the person's name. Four per sheet, as today.
- A short line above activity: "A flag means it's worth a look. It isn't proof of anything. Busy nights and private events can cause one."

## Flags

Computed when the page is read, over the chosen range. Times use the member's time zone. Limits live in one tested file:

- **Outside open hours:** a check-in or used reward more than 60 minutes before opening or after closing. Uses today's posted weekly hours and the special hours for that date. Members with no hours posted are never flagged. Past weekly hours aren't kept, so changing hours can change old flags; the screen says so.
- **Several at once:** 4 or more different customers checked in on one source within 5 minutes. Not applied to the behind-the-counter QR or the shared code.
- **Same customer, same code:** a customer with 5 or more check-ins at this member in the range, at least 80% on one person's QR or 4-digit code.
- **Turned-off QR used:** any.
- **Wrong code tries:** 5 or more by one customer in a day, shown in its own row, not under a person.

Turned-off codes count toward the row of the person (or counter) they belonged to.

## Smaller calls (Claude's)

- "Same customer, same code" counts all of one person's codes together, so a replacement doesn't reset the pattern.
- Rewards are counted as used; undos are counted separately.
- Any activity on a posted closed day is flagged, apart from the 60 minutes after a late close the night before.
- The customer label is made longer if two customers would share it.
- Until merge, visits on live have no activity row, so they count as "Before tracking".

## Testing

Pure rules (names, code lookup, 4-digit matching and clashes, flags, labels) get unit tests. Server permission tests cover full editors being refused. Manual check on Sample Brewery on staging.

## Left to the builder

File layout, exact wording beyond what's quoted, styling within the existing cards, migration details.
