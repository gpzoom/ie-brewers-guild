# Beer Trail sign-up at the counter (Zeffy) — design

*Brainstormed with the owner 2026-11-18/19. Staging first; live only on the owner's go.*

## Why
Plastic cards are set aside: the QR check-in works. The Guild now sells a yearly **Beer Trail Pass** through Zeffy
(the owner's choice: no fees). Breweries earn **50% commission** on every pass sold at their counter, which is the
reason for a brewery to push the program. Breweries also want their own list of customers they may email.

## Goals
1. A new customer scans a counter plate, taps **Join the Beer Trail**, pays on Zeffy, comes back signed in, and checks in on the spot.
2. Every pass is credited to the brewery whose plate started the sign-up, so the Guild can pay commission (50%).
3. Each brewery gets its own opt-in subscriber list (owner chose option A: opt-in checkbox, send through the site, no downloads).
4. The counter-plate QR image shows its plate code under the QR.
5. The bartender QR gets its own 8-character code, like the plate, shown under the QR and in the portal.

## Non-goals (this release)
- Plastic cards (kept in the code, not promoted). Bar devices stay for anyone who has one.
- Breweries **sending** email to their list — this release collects opt-ins and shows the count; the send tool is a later release *(my call: sending needs unsubscribe handling, rate limits and the no-test-emails safeguards; worth its own design)*.
- Paying commission through the site. The Guild pays breweries itself; the site reports what is owed.

## Anti-goals
- No email sent from testing (staging shares the live database).
- A customer never has to pick "which brewery sent me".
- Someone paying with another person's email must not get into that person's existing account.

## Approaches considered
- **Join from the plate (chosen by the owner).** The plate already knows the brewery, so credit is automatic.
- Separate sales page, disconnected from the plate: simpler, but the brewery has to hand out its own link and credit is unreliable.
- Stripe instead of Zeffy: standard metadata pass-through, but ~2.9% + 30¢ per sale. Owner prefers Zeffy.

## How it works

**Plate, signed out.** The signed-out plate screen shows two buttons: **Join the Beer Trail** and
**I have a Tap Card: sign in** (today's email-a-code flow). A scan cannot tell a new customer from an existing one
on a new phone, so the customer chooses.

**Join page (our site).** Brewery name at the top. Asks for **email**, the existing 21+ confirmation, and an
unchecked box: "Let [brewery] email me news and offers." Saves a pending sign-up (plate's brewery, email, opt-in,
time) and a cookie on this browser naming it, then sends the customer to the Zeffy form. If Zeffy accepts a
prefilled email in the form link, use it; otherwise the customer types it again on Zeffy *(builder checks)*.

**Zeffy.** Customer pays (name + email per pass). Zeffy redirects to `/trail/joined` and also sends a webhook to
`/api/zeffy/webhook` (events: payment.completed, payment.updated, payment.deleted).

**Recording a sale.** Never trust a webhook body: take the payment id and **fetch the payment from the Zeffy API**
(read-only key), so a forged webhook can do nothing. Process only payments for the Beer Trail campaign id. For each
pass (`items[]`, rate "Beer Trail Pass"): find or create the cardholder by that pass's email (name from the pass's
Full Name answer); record a sale row (Zeffy payment id + item id, unique, so retries are harmless), amount, pass
year, and the brewery — taken from the newest pending sign-up with the same email (case-insensitive) made before
the payment. Buyer email is the fallback when a pass has no email answer. No match = sale with no brewery; Guild can
assign one by hand.

**Coming back.** `/trail/joined` reads the cookie. It does not wait for the webhook: it looks the payment up through
the API itself (by the sign-up's email, Beer Trail campaign, made after the sign-up), records it the same way, and
then:
- **New cardholder** → signs this browser in and opens the brewery's plate screen, ready to check in.
- **Email already had a card before this sign-up** → no automatic sign-in; shows the 6-digit email code step
  (stops someone paying with another person's email to get into their account).
- **Payment not found yet** → "Finishing up…" and retries for about a minute, then "We'll email you a sign-in code."

**Refunds.** payment.updated / payment.deleted → re-fetch; a refunded or deleted pass is marked refunded, drops out
of commission, and that pass no longer counts as paid *(my call)*.

**Commission report.** Guild screen (`/guild/tap-card`): per brewery per month — passes sold, gross, commission
(rate stored as a setting, 50%), refunds, and a list of unassigned sales to credit by hand. Each brewery sees its own
numbers on its Tap Card tab (portal and /admin). Counts and money only; brewery sees subscriber names only via the
future send tool, never as a download.

**Subscriber lists.** A row per (brewery, cardholder) when the box was checked, with opt-in time and an
unsubscribed time. Brewery's Tap Card tab shows "N people agreed to get your emails."

**Plate QR image.** The downloaded PNG gets the plate code printed under the QR (e.g. `ABCD-1234`), matching the
portal.

**Bartender QR.** Its secret becomes an 8-character code in the plate alphabet (`/s/XXXXXXXX`), printed under the
QR and shown in the portal; "Make a new bartender QR" issues a new code. Safe: the code is only as visible as the
QR itself, and 32^8 combinations plus rate limiting rule out guessing. Existing long tokens are replaced (none
printed yet).

## What the pass pays for (owner, 2026-11-19)
- The pass pays **only for the Beer Trail of its year**. Trail stops, trail offers and trail milestones need a paid,
  unrefunded pass for the current trail year.
- **Brewery loyalty is free** for anyone with an account: visits count and loyalty rewards work with or without a
  current pass, and visit counts never reset.
- Each year's trail is its own Zeffy campaign. Not buying next year's pass leaves the card working as a loyalty
  card with everything it had.
- A signed-in cardholder without this year's pass sees **Join this year's Beer Trail** on the plate screen; buying
  from there credits that brewery too.
- *(My call)* Accounts are created by buying a pass. A free "loyalty only" sign-up can be added later if wanted.

## Settings / secrets
- Worker secrets: `ZEFFY_API_KEY`, `ZEFFY_WEBHOOK_SECRET` (verify the signature too if Zeffy documents the format;
  the API re-fetch is the real check).
- Settings: Zeffy form link, Beer Trail campaign id and the trail year it sells, commission rate (50%).
  A new year = a new campaign id + year.
- One Zeffy form can redirect to only one site: staging now, switched to the live address at launch.

## Data
New tables (server-only, RLS on, no policies, like the other Tap Card tables): pending sign-ups, sales (Zeffy
payment id + item id unique, holder, brewery, amount, pass year, refunded time), brewery subscribers. Bartender QR
column format changes to 8 characters. Migrations pushed only on the owner's "yes".

## Also in this release
Privacy Policy + Terms update (Zeffy payments, brewery email opt-in), Member Guide section, `LEGAL.effectiveDate`.

## Left to the builder
Exact screens (follow the existing Tap Card look), webhook signature details, prefill test, page names.

## Verification
Unit tests: sale recording from a real-shaped payment (one pass, two passes, wrong campaign, retry, refund),
brewery matching, existing-email no-auto-sign-in, bartender code format. Staging walkthrough with a $0 pass:
scan plate → Join → Zeffy → back signed in → check in; commission report shows the sale.
