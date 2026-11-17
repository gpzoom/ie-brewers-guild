# Inland Pint Passport — design

*Brainstormed with the owner 2026-11-17; approved the same day. Implementation plan: see docs/superpowers/plans/.*

## Context — why

The Guild wants the public to visit member taprooms they have never been to, and wants an incentive obvious enough that producers join the Guild to be on it. The site already reserves this: `docs/member-profiles.md` → "The Guild Trail" (deferred) and `members.trail_eligible` (true for producers). No visitor data is stored today. The privacy/terms release for analytics + wallet push is already scheduled to go live *with* this launch (memory: project_terms_privacy).

## Goals
- A customer carries one passport (plastic card and/or Wallet pass) and is rewarded for visiting new stops.
- Standard stop offer: **"Your first beer for a nickel."** A brewer may substitute their own offer if it is clearly stated on their stop.
- Works for a non-tech-savvy customer with a plastic card only — they never need a phone.
- Brewers see a clear benefit: new-customer counts, placement on the Trail map, slow-day boosts, and revenue from card sales.

## Non-goals
- No leaderboard and no prize drawing (contest/lottery law exposure, BA code on overconsumption).
- No points for beers bought. Guild rewards count **visits** only.
- No customer self-check-in from a posted QR/NFC sign (it allows remote check-ins and excludes card-only holders).
- No location tracking by the Guild. "Near a stop" alerts come from the Wallet pass's own location feature.

## Anti-goals (failure even if it works)
- Screenshot/sharing abuse: one pass used by many people for nickel beers.
- Slowing the bar on a busy night.
- Emails to anyone from testing (owner rule; staging shares the live database).
- A privacy policy that doesn't match what the site does.

## Decisions made by the owner
| Topic | Decision |
|---|---|
| Name | **Inland Pint Passport** (trademark search before launch) |
| Nickel deal | One redemption per person per brewery **per period**; the Guild sets the period (setting, not code) |
| Non-phone path | Credit-card-style plastic card with **QR code + NFC chip** |
| Check-in | **Staff scan the customer** (card tap/QR or Wallet pass QR) on a Guild web page on the brewery's own phone/tablet |
| Card distribution | Sold at taprooms for a **small fee**; taproom keeps sale revenue |
| Sign-up data | **Name + email required** to activate |
| Activation | **Either**: customer scans card QR and fills a short form, or staff type name/email on the scanner page |
| Guild rewards | **Milestone rewards** (e.g. 5 / 10 / all stops) + **time-limited challenges** |
| Brewer value | New-customer counts, Trail map listing + Wallet location alerts, slow-day boosts, card revenue |
| Build approach | **Guild site owns the trail; WalletPush (owner's existing account, has an API) issues and updates Wallet passes** |
| Reset period | **Calendar year** (Jan 1, Pacific time). Kept as a setting so it can change later |
| Brewer's own offer | **Guild approves first**; standard nickel offer shows until approved |
| Launch | **Cards first** (phase 1); Wallet passes follow in phase 2, linked to the same passports |

## Approaches considered
- **A. Build everything on the site, incl. signing Apple/Google passes ourselves.** Most control, but needs an Apple Developer account and pass signing/push service. Not chosen: owner already owns WalletPush.
- **B. Rent a trail platform.** Fastest, but yearly fee, data outside the site, rules not tailorable. Not chosen.
- **C. Site + pass platform — chosen**, using WalletPush (no extra fees; it holds Apple/Google certificates and push delivery).

## How it works

**One card, one link.** Each card's NFC chip and QR both hold `https://iscbrewersguild.org/p/<code>` (short random code, also printed). iPhones and Androids both open a URL when an NFC tag is tapped, so no app or Web NFC is needed. What the link shows depends on who opens it:
- Staff signed in on the brewery's scanner device → the **check-in screen** for that passport.
- Anyone else → the **passport page** (sign-up form if the card is new; otherwise the holder's progress after email sign-in).

**Wallet pass.** Created through the WalletPush API after sign-up ("Add to Apple/Google Wallet" button). Its barcode is the same `/p/<code>` link, so staff scan it with the camera on the scanner page. Pass fields (stops visited, current challenge) are updated through the API after every check-in. Stop locations are set on the pass for lock-screen "near a stop" alerts (Apple allows ~10 locations per pass — pick nearest unvisited, refreshed on update; confirm what the WalletPush API supports).

**Check-in screen (staff).** Shows holder first name, this brewery's offer, and either "Nickel offer available" or "Already redeemed this period (date)". Two buttons: **Record visit** and **Record visit + redeem offer**. One visit per passport per brewery per day counts. Redemption allowed once per passport per brewery per period.

**Staff sign-in.** No per-bartender accounts. A brewery's member user creates a **scanner device link** on their /admin screens (like the existing upload-token pattern); opening it on the bar tablet signs that device in for that brewery; revocable. *(My call — keeps the bar fast and fits the existing member_users model; per the "Edit as them opens /admin" memory, it must also appear on the Guild /admin screens.)*

**Cards.** Guild admin generates batches of card codes and exports a CSV for the card printer (QR + NFC encoding + printed code). Batches are assigned to a brewery. A card is "unsold" until activated. Lost card: holder signs in by email and links a replacement card; history stays with the person. *(My calls.)*

**Card money.** Guild supplies cards to breweries (at cost or free — owner to set); brewery sells them in its own POS at a Guild-suggested price and keeps the revenue. No payments run through the site. *(My call.)*

**Offers.** Each stop shows its offer on its profile and Trail map: the standard nickel offer by default, or the brewer's own text once a Guild admin approves it (submitted from /portal and /admin). The redemption period is the calendar year, stored as a `site_settings` column.

**Rewards.** Milestones = distinct stops visited within the period; Guild admin defines milestones (count + reward text) and marks rewards as handed out. Challenges = Guild-defined, time-boxed rules (e.g. "3 new stops in March", "any stop on a Tuesday" for slow-day boosts a brewer requests). Completion shows on the passport page and Wallet pass; push message via WalletPush.

**Brewer dashboard.** On the member's /admin: first-time passport visits and redemptions per month, cards activated from their batch. Counts only — no holder names or emails.

**Age.** Sign-up page includes the existing 21+ confirmation; staff check ID as they do for any pour.

**Emails.** Only transactional (sign-in link, card activation). Any marketing email needs a separate opt-in. All sends respect the existing pause switch / dry-run rules.

## Data (new tables, Supabase)
`passport_holders` (name, email, created), `passport_cards` (code, batch, brewery, holder, status), `passport_visits` (holder, member, visited_at, redeemed bool, card used, recorded_by device), `scanner_devices` (member, token hash, revoked_at), `passport_milestones`, `passport_challenges`, `wallet_passes` (holder, WalletPush pass id). Settings: redemption period, suggested card price. Brewer offer text on `members`. RLS: holders read only their own; members read aggregate counts only; staff writes only via a Worker route that checks the scanner token. Replaces the `trail_visits` sketch in member-profiles.md.

## Phases
1. **Core:** cards & batches, sign-up/activation, scanner device link + check-in screen, offers, redemption rule, milestones, passport page, Trail map on site, privacy/terms update, Member Guide section.
2. **Wallet:** WalletPush API — create pass, update after check-in, location alerts, push for milestones.
3. **Brewer extras:** challenges & slow-day boosts, brewer dashboard.

## Before launch (owner)
- Attorney / CA ABC review of the nickel offer and the reward rules.
- Trademark search on "Inland Pint Passport".
- Order printed NFC cards once the code format is final.

## Calls I made (owner to check)
- Members create scanner links and see their dashboard on **/portal** and on the matching **/admin** screen ("Edit as them" rule); Guild screens (card batches, offer approvals, milestones, challenges) go under **/guild**.
- Scanner link copies `src/lib/media/upload-tokens.ts` (random token shown once, hash stored); the device then stays signed in with a long-lived cookie, and the link can be revoked.
- Passport holders sign in with their own single-use emailed link (not the member Supabase sign-in, whose helpers assume a few hundred accounts) and land on their own **/passport** page, kept separate from member accounts.
- Staff need no in-page camera scanner: the phone's own NFC reader or camera app opens the card link in the default browser, where the scanner-device cookie lives.
- "One visit per day" and the yearly reset use Pacific time.
- Trail stops = published members with `trail_eligible` on.
- Sign-up reuses the existing 21+ check (`src/lib/site/age-gate.ts` — on origin; pull first).
- Passport emails go through `src/lib/notifications/send.server.ts` so the pause switch and dry run apply.
- Testing: Sample Brewery + test cards flagged `is_test`; email in dry run (shared staging/live database).
- The privacy/terms update ships in the same release as phase 1, because phase 1 stores names, emails and visits.
- Card URL domain `iscbrewersguild.org` (matches SITE_ORIGIN) — confirm before the print run, since printed cards can't change.

## Left to the builder
Code format/length, exact screens (follow the owner's design canvas look), WalletPush API specifics (docs from the owner's dashboard), test strategy given the shared staging/live database (use the Sample Brewery draft producer; never real holders).

## Verification
- Unit tests for the redemption-period rule, one-visit-per-day rule, milestone counting.
- Staging walkthrough on a real iPhone and Android: tap a test card → sign up → staff device scans → visit + redeem → second redeem blocked → milestone shown → Wallet pass updates.
- `npm run build` before each staging push; confirm deploy by behavior.
