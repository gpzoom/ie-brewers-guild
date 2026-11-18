# Inland Tap Card — Offers & loyalty rewards (design)

*Brainstormed with the owner 2026-11-17. Builds on the phase 1 Tap Card
(`2026-11-17-inland-tap-card-design.md`), which is on staging and not yet live.*

## Why

The Beer Trail offer brings a customer into a taproom once. The owner wants the
same card to bring them **back**: after the Beer Trail visit, the card becomes a
loyalty card at that brewery, with rewards the brewery sets for later visits.
Breweries get a reason to push the card; customers get a reason to return.

The owner's overriding rule: **super simple for members, and never slow at the
bar.** A bartender must not be helping a customer choose a reward while others
wait.

## Goals

- Rename the brewery's "Your offer" section to **Offers**, split into
  **Guild Offers** (read-only for members) and **Member Offers**.
- The **Beer Trail offer** is a Guild Offer: set by the Guild, not editable by
  members, once per brewery per calendar year (unchanged rule).
- **Member Offers** form a loyalty program at one brewery:
  - up to **3 ladder steps** ("on visit #N: reward"), each earned once;
  - plus **one optional repeating reward** ("every Nth visit: reward").
- Every Member Offer is **submitted by the member and approved by the Guild**
  (to keep offers legal) before it goes live.
- **Offer Templates**, managed by Guild admins, appear to members as starting
  points: picking one fills in the reward and terms, which the member can edit
  freely. Or **Start from scratch**.
- Earned rewards are **banked** on the customer until used, and **expire** after
  a period the brewery chooses.
- At the bar: **tap = visit recorded; at most one button press.**

## Non-goals

- Final reward wording and the starter template set — the owner is still
  fleshing these out. This phase ships the structure; templates are data the
  Guild enters on its own screen.
- Points, spend tracking, or rewards for amount purchased (visits only, as before).
- Emails about offers or rewards (members see status on screen; customers see
  rewards on their card page).
- Guild-wide time-limited challenges and slow-day boosts (phase 3 of the Tap Card).

## Anti-goals (failure even if it works)

- A bartender has to read a list or make a choice to finish a check-in.
- A member needs more than a few clicks to set up a program.
- An offer goes live without Guild approval, or an approved offer vanishes while
  an edit waits for approval.
- A customer loses a reward they earned because the brewery edited the offer.

## Constraints

- Staging and live share one database (test with Sample Brewery and test card
  batches; no emails from testing).
- All Tap Card tables are server-only (RLS on, no policies, grants revoked).
- Database changes need the owner's go-ahead before `db push`.
- Privacy Policy and Terms of Use must describe loyalty rewards (banked, expiring,
  set by each brewery, approved by the Guild) before this goes live.
- California alcohol rules: the attorney/ABC review already on the launch list
  must cover Member Offers too. Guild approval is the gate.
- US spelling; plain language for members.

## Approaches considered

1. **Extend the Tap Card's own tables and screens — chosen.** Visits are already
   recorded per person per brewery, so visit counts, banked rewards and expiry
   are small additions; the bar screen and card page already exist.
2. **Use WalletPush's loyalty features.** Rejected: card-only customers (no
   phone wallet) would be left out, and phase 2 (Wallet) isn't built.
3. **A third-party loyalty platform.** Rejected: fees, data outside the site,
   a second system for bartenders.

## Decisions made by the owner

| Topic | Decision |
|---|---|
| Section name | **Offers**, with **Guild Offers** and **Member Offers** |
| Beer Trail offer | Guild Offer; members can't edit it (replaces phase 1's "brewer may substitute their own trail offer") |
| Member Offers | Submitted by members, approved by the Guild before going live |
| Program shape | **Ladder + repeating** (option C): visit-number steps, plus an optional "every Nth visit" reward |
| Visit counting | Counts **keep building for as long as the customer has the card** (never resets) |
| Unused rewards | **Banked, with an expiry** |
| Templates | Managed by Guild admin; members pick one (fills reward + terms, fully editable) or start from scratch |
| Priority | Super simple for members; no bartender decision-making |
| Content | Placeholders for now; owner will flesh out rewards and templates later |
| Bar hardware | **Both**: the bar phone (staff tap the card) and a counter plate (customer taps their phone; bartender enters a 4-digit staff code) |
| Release | **Together with phase 1**: both stay on staging and go live in one release (one Privacy/Terms/Member Guide update). Phase 1's brewer-replaces-trail-offer box is replaced, never launched |

## How it works

### Customer's path at one brewery

```
 Visit 1        BEER TRAIL OFFER (Guild)   once per calendar year
 Visit [#a]     Step 1  [reward]           (Member Offer, earned once)
 Visit [#b]     Step 2  [reward]
 Visit [#c]     Step 3  [reward]
 Every [#n]     Repeating [reward]         (optional)
 Unused rewards wait [30 / 60 / 90 days / 1 year] (brewery's setting)
```

- A visit is one per person per brewery per Pacific day (phase 1 rule).
- **Visit number** at a brewery = how many visits that person has there, ever.
  It follows the **person**, not the plastic: a replacement card keeps the count.
- When a visit's number equals a step's visit number, that step's reward is
  **earned**. When it's a multiple of the repeating reward's N, that reward is
  earned. Both can be earned on the same visit.
- Earning is **not retroactive**: a step added or changed later only applies to
  visits from then on.
- **Each ladder step (Step 1, 2, 3) is earned once per person, ever.** Editing a
  step's visit number or reward, or removing it and adding it again, never
  awards it a second time to someone who already earned that step. *(My call —
  stops double rewards; the brewery can use the repeating reward for "again".)*
- An earned reward is a **snapshot** of the reward and terms text at that moment,
  with an expiry date (earned + the brewery's expiry setting at that moment).
  Later edits to the offer or the setting don't change rewards already earned.
- Expired rewards drop off; they aren't shown at the bar or on the card page.
- The Beer Trail offer behaves as before: available once per brewery per
  calendar year, shown whenever it hasn't been used yet this year.

### At the bar (the check-in screen)

```
┌───────────────────────────────────┐
│ ✓ Visit #6 recorded — Pat         │
│                                   │
│   Free soft pretzel               │
│   [ Use it ]                      │
│                                   │
│   2 more waiting                  │
└───────────────────────────────────┘
```

- **Opening the card on a bar device records the visit.** No "Record visit"
  button. The one-a-day rule makes a re-tap or refresh harmless ("Already
  checked in today").
- The screen shows **one** reward, chosen for the bartender: the Beer Trail
  offer first if available, otherwise the banked Member Offer that expires
  soonest. **Use it** marks it used. Ignoring it leaves it banked.
- **One reward per visit.** After one is used, the screen says so and shows no
  further buttons that day.
- **Undo for mis-taps:** right after **Use it**, the screen shows **Undo**,
  which puts the reward back on the card. It works the same day, on the same
  brewery's bar device, for that visit's reward only. *(My call — a mis-tap on a
  busy night must not cost the customer a reward.)*
- "**N more waiting**" is a small link that reveals the other waiting rewards,
  each with **Use this instead**, for the customer who asks for a specific one.
  Normal use never touches it.
- New-card activation (staff or customer) is unchanged; activation by staff
  leads straight into the recorded visit.

### Counter plate (no-device option)

*Owner, 2026-11-17: offer both — the bar phone (above) and a counter plate.*

A **counter plate** is a plastic plate at the bar with a QR code and NFC chip,
like a card. It lets a brewery take part with **no phone or tablet of its
own**, for customers who have a smartphone. Plastic-card-only customers still
need a bar phone; each brewery uses one or both.

```
 Customer taps/scans the plate with their phone
   → their phone (signed in to their Tap Card) shows:
     ┌───────────────────────────────────────┐
     │ Sample Brewery                        │
     │ Hi Pat — this will be visit #6        │
     │ Use now:  (•) Free soft pretzel       │
     │           ( ) Just check in           │
     │ Bartender: staff code [____]          │
     │ [ Confirm ]                           │
     └───────────────────────────────────────┘
   → bartender types the 4-digit staff code → Confirm
   → "✓ Visit #6 recorded — Free soft pretzel used"
```

- Each brewery has **one plate link** (`/t/<code>`, same code style as cards),
  made automatically. The member's Tap Card screen shows its QR code to
  download, and **Make a new plate link** (old plates stop working). The Guild
  can download every brewery's plate link for the printer, like a card batch.
- **Nothing is recorded until the staff code is entered.** A photo of the plate
  is useless at home. The visit, the reward and the one-reward-per-visit rule
  are the same as at a bar phone.
- The **customer picks** the reward on their own phone (nobody is waiting on
  them); the soonest-expiring one is pre-selected, Beer Trail offer first.
- **Staff code:** 4 digits, set by the brewery on its Tap Card screen, shown
  there to owners/editors, changeable any time staff turn over. No code set =
  the plate page says "Ask your bartender to tap your card."
- **Wrong codes:** after 5 wrong tries the plate locks for that customer at
  that brewery for 15 minutes.
- **Undo** on the success screen also needs the staff code (otherwise a customer
  could undo and use a reward twice). Same day only.
- **Not signed in on this phone:** the page asks for the card's email and sends
  the usual sign-in link, which returns to the plate page.
- A customer must already have an activated card. Activating a new card still
  happens at a bar phone or by the customer on their card's own link.

*(Calls I made: one plate link per brewery; staff code stored so the brewery can
see it; customer chooses the reward on a plate; undo needs the code; 5 tries /
15 minutes.)*

### Customer's card page (/card)

- For each brewery where something is waiting: the reward, its terms, and
  "Use by <date>". So customers arrive knowing what to ask for.
- Visit counts per brewery ("6 visits at Sample Brewery").
- Existing progress (trail stops, Guild milestones) unchanged.

### Member's Offers section (Portal > Tap Card and /admin/tap-card)

```
┌ Offers ───────────────────────────────────────────────┐
│ GUILD OFFERS                                          │
│  Beer Trail · Visit 1 · "Your first beer for a nickel"│
│  Set by the Guild                                     │
│                                                       │
│ MEMBER OFFERS                                         │
│  Step 1  Visit [#]  [reward]            ● Approved    │
│  Step 2  Visit [#]  [reward]            ◐ Waiting     │
│  Step 3  [+ Add a step]                               │
│  Repeating  Every [#] visits  [reward]  ○ Off         │
│                                                       │
│  Unused rewards last: [90 days ▾]                     │
└───────────────────────────────────────────────────────┘
```

- Adding or editing a step or the repeating reward opens one small form:
  **Start from** [template ▾] or **Start from scratch** → **Visit number**
  (or "every N visits") → **Reward** → **Terms** → **Submit for approval**.
- Status per offer: Approved / Waiting for approval / Declined (with the Guild's
  note, so the member knows what to fix).
- **Editing an approved offer** sends the new version for approval; the
  approved version stays live until the Guild approves the change.
- **Removing** an offer takes it off right away (no approval needed); rewards
  already earned from it stay banked until used or expired.
- Rules the form enforces: ladder visit numbers are 2 or more and different from
  each other (visit 1 is the Beer Trail visit); repeating N is 2 or more; reward
  3–140 characters; terms up to 300 characters.
- **Expiry setting**: one per brewery — 30, 60, 90 days or 1 year; default 90.
  Changing it needs no approval and applies to rewards earned from then on.
- Same screen on /admin (Edit as them), per the project rule.

### Guild screens (Guild > Tap Card)

- **Offers tab** becomes the approval list for Member Offers: brewery, step or
  repeating, visit number, reward, terms, and (for an edit) the live version
  beside it. **Approve**, or **Decline** with an optional note.
- New **Templates tab**: add, edit, reorder, hide templates (title, reward,
  terms). Hidden templates disappear from members' choices; offers already made
  from them are unaffected (a template is only a starting point — nothing links
  back to it).
- Guild Offers: the Beer Trail offer text stays the Guild's standard
  ("Your first beer for a nickel"). No editing screen this phase.

### Public pages

- A trail stop's profile and the /trail list show the Beer Trail offer (always
  the Guild's now) and, on the profile, the brewery's approved Member Offers
  ("Visit 3: …"). *(My call — it's free advertising for the brewery's program;
  easy to drop.)*

## Data (shape, not final)

- **Member Offers**: per brewery, up to 3 ladder steps + 1 repeating; each with
  visit number or N, reward, terms, and an approval status; an approved version
  and at most one pending version per offer.
- **Offer templates**: title, reward, terms, sort order, hidden flag.
- **Brewery setting**: reward expiry days (30/60/90/365, default 90).
- **Earned rewards**: holder, brewery, which offer it came from, snapshot of
  reward + terms, earned on which visit, expires at, used at / used by device /
  used on which visit.
- The Beer Trail redemption stays on the visit row (`redeemed_year`), as now.
- Phase 1's `tap_card_offers` (brewer's own trail offer) is retired. It has only
  test rows; the builder confirms that before removing it.
- Database guards (like phase 1): one reward used per visit; a reward is used at
  most once; an offer slot is earned once per visit.

## Calls I made (owner to check)

- Opening a card on a bar device records the visit automatically.
- One reward per visit, including the Beer Trail offer; the screen picks it
  (Beer Trail first, then the soonest-expiring).
- Ladder steps start at visit 2; visit numbers never reset.
- Each ladder step is earned once per person, even after the brewery edits it.
- An **Undo** right after **Use it** (same day, same brewery).
- Earned rewards are snapshots; edits and setting changes aren't retroactive.
- Removing an offer needs no approval; earned rewards stay.
- No emails for any of this; status lives on screens.
- Approved Member Offers show on the brewery's public profile.
- Templates are copied, not linked.
- Beer Trail offer text stays fixed in code this phase; a Guild editor for it
  can come later.

## Left to the builder

Exact tables and columns; how pending vs. approved versions are stored; the
copy on each screen (following the existing Tap Card look and the owner's
design canvas); the order of migration steps; test strategy on the shared
database (Sample Brewery, test batches).

## Before launch (owner)

- Flesh out the starter templates and the wording of rewards.
- Attorney / ABC review covers Member Offers and templates.
- Privacy Policy and Terms of Use updated for loyalty rewards.
- Member Guide updated (Offers section, templates, bar screen).

## Verification

- Unit tests: visit-number earning (ladder, repeating, both at once, not
  retroactive), expiry, the one-reward-per-visit pick order, approval keeps the
  live version, validation rules.
- pgTAP: the new tables are server-only; one reward used per visit; a reward
  used once.
- Staging walkthrough with Sample Brewery behind Maintenance Mode: set up two
  steps + a repeating reward from a template, approve them as Guild, tap a test
  card through enough visits to earn each, use one, leave one banked, check the
  card page and expiry date.
