# Tap Card: bartender QR, staying signed in, draft testing on staging (short design)

*Agreed with the owner in conversation, 2026-11-18, after walkthrough Section D.*

## Why
The counter plate works but has too much friction: a sign-in email, a reward
choice, and the bartender typing a code on the customer's phone. Bar phones
are not the answer: bartenders would use their own phones, and a new phone
means a new setup link.

## What changes
1. **Bartender QR (the main way to confirm at a plate).** Each brewery gets a
   second QR code, kept behind the counter: `/s/<token>` (random 43-character
   token, stored on `tap_card_plates.staff_qr`). Flow:
   - Customer scans the plate, picks **Check in** or **Check in + use a reward**,
     taps Continue. The choice is held on their phone's session row
     (`tap_card_sessions.pending_*`, server-side, not editable) for 10 minutes.
   - The bartender holds up the bartender QR; the customer scans it.
   - Plain check-in records at once. Using a reward asks "Use it now? This
     can't be undone." first.
   - The success screen is "live" (running clock, moving check mark, brewery
     name) so an old screenshot is easy to spot.
   - Both scans are needed for anything to be recorded; the bartender QR
     must belong to the same brewery as the plate.
2. **The 4-digit staff code stays as the backup** ("Enter the staff code
   instead") and still turns the plate on. Undo still takes the staff code.
3. **Make a new bartender QR** on Portal/Admin > Tap Card > Counter plate:
   the old one stops working at once. No automatic expiry (owner's lean).
4. **Stay signed in while used.** Card sessions last 400 days (the browser
   cap) and are renewed at most once a day when used.
5. **Draft testing on staging.** On the staging site only, a draft producer
   on the trail can take plate and bar-device check-ins. The live site still
   requires published.

## Approaches considered
- Bar device for every brewery: rejected (personal phones, re-setup pain).
- Static bartender QR with a client-side cookie for the pending choice:
  rejected; the cookie could be edited to stretch the 10-minute window.
  The session row holds it instead.
- Rotating QR on a screen: needs a device behind the bar again.

## Later (owner agreed order)
The "universal card" (loyalty at any member, not just trail stops) is a
separate step after the walkthrough.
