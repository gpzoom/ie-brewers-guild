# Universal Tap Card (loyalty at every Guild member) — design

*Brainstormed with the owner 2026-11-17 → 2026-11-19. Builds on the Beer Trail join via Zeffy
(`2026-11-19-beer-trail-join-zeffy-design.md`). Staging first; live only on the owner's go.*

## Why
The Tap Card should be one card for the whole Guild, not just the Beer Trail. Every Guild member — brewery,
mobile, or allied business — can count visits and reward regulars, which is a reason for any business to join
the Guild. Customers get a free loyalty card; the Beer Trail Pass is the paid upgrade.

## Decisions (owner)
| Topic | Decision |
|---|---|
| Who takes check-ins | Every published Guild member (producer, mobile, allied), not only Beer Trail stops |
| Loyalty | Free for anyone with an account; counted per member; counts never reset |
| Beer Trail | Paid pass, one trail year; trail offer + Guild milestones need it (already built) |
| Free sign-up | A customer can get a free loyalty-only card (no pass, no commission) |
| Visit-1 reward | Non-trail members may set a reward on visit 1 (trail stops keep visit 2+, since visit 1 has the trail offer) |
| Upgrade | Loyalty-only → pass keeps the same card, history and rewards; commission to the plate where they tapped Join |
| Milestones | Trail stops visited earlier that year (before buying) count toward milestones once the pass is bought |
| Trail offer after upgrade | Not retroactive; each stop's offer is still available on a later visit that year (once per stop per year) |

## Goals
1. A counter plate, bartender QR and Tap Card tab for every published Guild member.
2. Free loyalty-only sign-up from any plate.
3. Visit-1 welcome reward for non-trail members.
4. Plate sign-up screen per member kind (below).
5. Safe upgrade: signed-in customers can't accidentally create a second card when buying a pass.

## Non-goals
- No Beer Trail offer or milestones at non-trail members.
- No change to how commission or Zeffy work.
- Brewery email sending (still a later release).

## Approaches
- **Extend the existing plate/loyalty system to all members (chosen — only sensible one):** the plate, bartender
  QR, loyalty offers and visit counts are already per member; only "who takes check-ins" and the sign-up
  screen change.
- A separate loyalty product per business type: duplicates everything, two cards for customers. Rejected.

## How it works

**Who takes check-ins.** `memberTakesCheckIns` becomes: published (or draft on staging) — any member type.
"Is a trail stop" stays producer + trail_eligible, and only drives the Beer Trail offer, milestones and the trail
page. The Tap Card tab (portal and /admin) shows for every member; trail-only parts (Beer Trail offer text) only for
trail stops.

**Plate screen, not signed in.**
- Trail stop: big **Join the Beer Trail**; smaller **Just get the free loyalty card**; **I have a Tap Card: sign in**.
- Non-trail member: big **Get your free Tap Card**; smaller **Join the Beer Trail** (commission to this member);
  **I have a Tap Card: sign in**.

**Free sign-up page.** Name, email, 21+ box, unchecked "Let {member} email me news and offers". New email → card
created, this phone signed in, back to the plate's check-in screen. Email that already has a card → no new card; the
6-digit email code instead (same rule as the pass flow). *(My call: no email verification for a brand-new free card,
matching the pass flow; the code is required whenever the email already exists.)*

**Plate screen, signed in.** Loyalty check-in and rewards as today, at any member. At trail stops without this
year's pass, the "Join this year's Beer Trail" link (already built). At non-trail members, the same link, smaller.

**Upgrade safety.** On the join page, a signed-in customer's email is locked to their card's email, with "Use this
same email on the payment page." Guild > Passes gets **Move to another card** for a pass that landed on a new card
by mistake (the empty new card is then removed). *(My call.)*

**Visit-1 reward.** The loyalty offer's visit number may be 1 for non-trail members; trail stops keep the minimum
of 2. Enforced in the save rule and the database check (database allows 1; the app enforces 2 for trail stops).

**Card page.** Loyalty-only customers see their visits and waiting rewards; the Beer Trail section shows the join
box instead of progress.

## Also
- Member Guide: Tap Card for every member type; free card vs pass.
- Privacy/Terms: free card sign-up and member email opt-ins (same release as the pass changes).

## Left to the builder
Exact screens (existing Tap Card look), names of new pages, how the "Move to another card" picker finds the card.

## Verification
Unit tests: check-in rule by member type, sign-up decisions (new vs existing email), visit-1 rule by member kind,
locked email on join. Staging walkthrough: an allied test member with a plate (draft), free sign-up, visit-1
reward, upgrade to pass at a trail stop, trail offer later at the first stop.
