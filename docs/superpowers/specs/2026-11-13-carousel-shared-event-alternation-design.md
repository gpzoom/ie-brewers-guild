# Homepage carousel: a shared event alternates between taproom and guest

**Approved approach:** owner, 13 November 2026 ("go the one-hour rule"). A small change to the homepage events carousel from the Guild Mobile members at taprooms work (`2026-10-07-guild-members-at-taprooms-design.md`, "The homepage events carousel").

## Why

A Guild Mobile member (for example Tipzy) lists a stop at a Guild taproom (for example Mars Brewing Co.), and the taproom also puts the same night on its own calendar. Today the carousel turns the guest's stop into a taproom card, so visitors see **two Mars cards for one night**. Instead of dropping one, the owner wants **both members to get billing**: one spot in the carousel that shows the taproom's card on one pass and the guest's own card on the next.

## Goals

- The same night shows in **one** carousel spot, never as two cards.
- That spot **alternates every pass** through the carousel: taproom's card, then the guest's own card, then the taproom's again.
- Both versions get a fair share of views, including from visitors who only watch one pass.

## Non-goals

- No change when only one of them lists the night. A guest stop with no matching taproom entry stays a single taproom card (as today), and a taproom event with no guest stop stays as it is.
- No change when the taproom has **hidden** the guest's stop. There is no link then, so the guest's card and the taproom's card stay separate, as today.
- No title matching.
- No change to profiles, the Food this week section, or the taproom's Events page.

## Approaches considered

How the site decides that two entries are "the same night" at the taproom:

- **The start times are within an hour of each other (picked).** This catches 6:30 vs. 7:00. It wrongly pairs two separate events only when they start within an hour of each other at the same taproom.
- **On the same day.** This catches everything, but it also pairs unrelated events, such as an afternoon trivia and an evening band.
- **Exact same start time.** This never pairs the wrong events, but it misses a pair whenever the two calendars differ by even a few minutes.

Titles aren't used because the two members word the same night differently ("Trivia w/ Tipzy" vs. "Tuesday Trivia").

## The rule

A **pair** is formed when all of these hold:

1. A guest stop has a **shown** link to a host taproom (`event_hosts.status = 'shown'`), the same link that makes it a taproom card today.
2. The host has **its own** event (`member_id` = the host) that would appear in the carousel on its own: kind `event`, not hidden, not canceled or postponed, and inside the 14-day window.
3. The two **start times** are within **60 minutes** of each other. For a rescheduled event, the new start time counts.

Each event belongs to at most one pair. If a guest stop could pair with more than one host event, it pairs with the one whose start time is closest. Ties go to the host event that starts earlier, and then to the lower event id, so the result is the same on every load.

## How a pair shows

- **One spot.** The pair takes one place in the carousel and counts as one of the **host's** events in the one-per-member rotation, ordered by the host event's start time. It doesn't use one of the guest's turns.
- **Taproom version:** the host's own event card, exactly as it shows today.
- **Guest version:** the guest's own card, in the guest's colors and logo, with the guest's title, the taproom's name as the venue, and a footer that links to the guest's profile ("*Tipzy* · See their events →"). This is the same card the guest's stop shows today when it isn't linked to a taproom.
- **Alternating:** each time the carousel loops back to the start, every pair switches to its other version. A pass counts the same way whether the carousel plays on its own or a visitor moves it with the arrows or a swipe.
- **Fair start:** each page visit starts on a random version, so not everyone sees the taproom's version first.
- **Up next** lists the version that will actually show when that spot comes up, which on a wrap-around is the next pass's version.
- The "*N* of *M*" count doesn't change: a pair is one spot.

## Builder's calls

- **Where the pairing runs.** I'd put it in the existing pure function (`selectCarouselEvents` in `src/lib/home/member-events.ts`), so the server sends each card with an optional alternate card, and the carousel component only chooses which one to show. It's unit tested like the rest of that file.
- **Random start without a flash.** The server can't pick at random, or the page would show one version and then switch to the other once it loads in the browser. A choice made in the browser has to avoid visibly swapping the card that's already on screen.
- **Animation keys.** The two versions need different keys, so the tear-off animation plays between them.

## Testing

- **Unit tests (pure):** a pair forms at 0 minutes and at exactly 60 minutes apart, but not at 61; no pair when the link is hidden or absent, or when the host's event is canceled, hidden or outside the window; each event pairs at most once; the closest start time wins; a rescheduled event pairs on its new time; the pair counts in the host's rotation and not the guest's.
- **Component test:** the spot shows the other version after one full loop and switches back after the next; Up next shows the version for the next pass.
- **By hand on staging:** using an unpublished member that is published briefly with the owner's OK (never a real published member), list the same night on a sample taproom and a sample Mobile member, 30 minutes apart, and watch the spot switch on each loop.

## Before going live

Update the Member Guide (HTML and PDF) where it describes how guest stops show on the homepage.
