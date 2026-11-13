# Carousel shared-event alternation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a taproom and a Guild Mobile member guest list the same night (starts within 60 minutes), the homepage carousel shows it in one spot that alternates between the taproom's card and the guest's own card every pass.

**Architecture:** The pure `selectCarouselEvents` pairs a linked guest stop with the host's own event and drops the stop's separate card, attaching the guest's own card to the host card as `alternate`. The carousel component replaces its `index` with an unbounded position `pos` (`index = pos mod count`, `pass = floor(pos / count)`), and a pure helper decides which version a slide shows at a given position.

**Tech Stack:** TypeScript, React 19 (TanStack Start), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-carousel-shared-event-alternation-design.md`

## Global Constraints

- The pairing window is **60 minutes inclusive**: 60 minutes apart pairs, 61 doesn't.
- Pair only through a **shown** `event_hosts` link (i.e. an entry in `hostsByEventId`); no title matching.
- A pair is one spot, counted in the **host's** rotation, never the guest's.
- All site text in US English.
- Run `npm run build` before any push to staging. Don't push or merge without the owner's go.

## Review Focus

- **A rescheduled event:** pairing must use the card's effective `startsAt` (the new time), not `starts_at`. Pinned by a test in Task 1.
- **Two guest stops near one host event** (two trucks at 6:00 and 6:30 next to a 6:15 taproom event): only one pairs; the other stays a separate host card. Pinned by "each event pairs at most once" in Task 1.
- **Going backward with the arrow from the first slide:** that moves to the previous pass, so the version must flip back (negative `pos`). Pinned in Task 2's helper tests.
- **A carousel with a single slide:** autoplay is off, and the slide must keep showing the host version. Pinned in Task 2 (`count = 1`).
- **The first slide on screen is a pair:** the random start must not swap the card already showing. Handled in Task 2, Step 5.

---

### Task 1: Pair shared events in `selectCarouselEvents`

**Files:**
- Modify: `src/lib/home/member-events.ts` (`HomeEventCard` type, `selectCarouselEvents`, header comment)
- Test: `src/lib/home/member-events.test.ts` (in the "Guild members at taprooms on the homepage" block)

**Interfaces:**
- Produces: `HomeEventCard.alternate?: HomeEventCard`, the guest's own card (`toCard(stopRow, guestMember)`, no `guest` field), present only on a host's own card that was paired. `selectCarouselEvents` keeps its signature.

- [ ] **Step 1: Fix the existing rotation test, which the new rule would pair.** In `"the host counts for the one-per-member rotation"`, `own` is at `hours(25)`, exactly 60 minutes after `stop` at `days(1)`. Move `own` to `days(3)` and change the expected order to `[stop.id, other.id, own.id]` (unchanged). Then run it to confirm it still passes before the code change.

- [ ] **Step 2: Write the failing tests** in the same describe block (`link = (stopId) => new Map([[stopId, { hostMemberId: "a", guest }]])`):

```ts
it("a shared night is one spot: the taproom's card with the guest's own card as its alternate", () => {
  const stop = row("truck", days(1), { title: "Trivia Night", venue_name: "A" });
  const own = row("a", hours(24.5), { title: "Tuesday Trivia" });
  const cards = selectCarouselEvents([stop, own], withTruck, now, {}, link(stop.id));
  expect(cards).toHaveLength(1);
  expect(cards[0].id).toBe(own.id);
  expect(cards[0].member.id).toBe("a");
  expect(cards[0].alternate?.id).toBe(stop.id);
  expect(cards[0].alternate?.member.id).toBe("truck");
  expect(cards[0].alternate?.title).toBe("Trivia Night");
  expect(cards[0].alternate?.venue).toBe("A");
  expect(cards[0].alternate?.guest).toBeUndefined();
});
it("pairs at exactly 60 minutes apart, not at 61", () => {
  const stop = row("truck", days(1));
  const at60 = row("a", hours(25));
  expect(selectCarouselEvents([stop, at60], withTruck, now, {}, link(stop.id))).toHaveLength(1);
  const stop2 = row("truck", days(1));
  const at61 = row("a", new Date(Date.parse(days(1)) + 61 * 60_000).toISOString());
  const cards = selectCarouselEvents([stop2, at61], withTruck, now, {}, link(stop2.id));
  expect(cards).toHaveLength(2);
  expect(cards.every((c) => !c.alternate)).toBe(true);
});
it("no pair without a shown link, or when the taproom's event is canceled, hidden or out of the window", () => {
  const stop = row("truck", days(1));
  expect(selectCarouselEvents([stop, row("a", days(1))], withTruck, now).some((c) => c.alternate)).toBe(false);
  for (const extra of [{ overlay_status: "canceled" }, { is_hidden: true }, { kind: "food" }]) {
    const s = row("truck", days(1));
    const cards = selectCarouselEvents([s, row("a", days(1), extra)], withTruck, now, {}, link(s.id));
    expect(cards.map((c) => c.id)).toEqual([s.id]);
    expect(cards[0].guest).toEqual(guest);
  }
});
it("each event pairs at most once, with the closest start winning", () => {
  const early = row("truck", hours(24));
  const late = row("truck2", hours(24.5));
  const own = row("a", hours(24.4));
  const hosts = new Map([[early.id, { hostMemberId: "a", guest }], [late.id, { hostMemberId: "a", guest }]]);
  const cards = selectCarouselEvents([early, late, own], new Map([...withTruck, ["truck2", member("truck2")]]), now, {}, hosts);
  const paired = cards.find((c) => c.id === own.id);
  expect(paired?.alternate?.id).toBe(late.id);
  expect(cards.find((c) => c.id === early.id)?.guest).toEqual(guest); // still a separate taproom card
});
it("a rescheduled event pairs on its new time", () => {
  const stop = row("truck", days(1));
  const own = row("a", days(5), { overlay_status: "rescheduled", overlay_starts_at: hours(24.5) });
  expect(selectCarouselEvents([stop, own], withTruck, now, {}, link(stop.id))[0].alternate?.id).toBe(stop.id);
});
it("a pair takes the host's turn, not the guest's", () => {
  const stop = row("truck", days(1));
  const own = row("a", hours(24.5));
  const truckOwn = row("truck", days(2), { venue_name: "Elsewhere" });
  const ids = selectCarouselEvents([stop, own, truckOwn], withTruck, now, {}, link(stop.id)).map((c) => c.id);
  expect(ids).toEqual([own.id, truckOwn.id]);
});
```

- [ ] **Step 3: Run them and confirm they fail.**
Run: `npx vitest run src/lib/home/member-events.test.ts`
Expected: the new tests FAIL (two cards / no `alternate`); the old tests pass.

- [ ] **Step 4: Implement it.** Add `alternate?: HomeEventCard` to `HomeEventCard`, with a doc comment pointing to the spec. In `selectCarouselEvents`, build the windowed, filtered cards as today, but remember for each linked-stop card its `row` and host id. Before the round-robin, pair them:

```text
candidates = every (linked stop card S with host H, H's own unlinked card O)
             with |Date.parse(S.startsAt) - Date.parse(O.startsAt)| <= 60 min
sort candidates by: |diff| asc, then O.startsAt asc, then O.id asc
for each candidate: if neither S nor O is used yet ->
    O.alternate = toCard(S.row, members.get(S.row.member_id))   // skip the pair if the guest member is missing
    mark both used; drop S from H's queue
```

Add a `PAIR_WINDOW_MS = 60 * 60 * 1000` constant beside the others, and a line in the header comment describing the rule.

- [ ] **Step 5: Run the file and confirm everything passes.**
Run: `npx vitest run src/lib/home/member-events.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/home/member-events.ts src/lib/home/member-events.test.ts
git commit -m "feat(home): pair a taproom's event with a guest's stop at the same time"
```

---

### Task 2: Alternate the paired spot each pass in the carousel

**Files:**
- Modify: `src/components/home/MemberEventsCarousel.tsx`
- Test: `src/components/home/MemberEventsCarousel.test.ts`

**Interfaces:**
- Consumes: `HomeEventCard.alternate` from Task 1.
- Produces (exported, pure): `showsAlternate(pos: number, count: number, offset: 0 | 1): boolean`, which returns true when the pass `Math.floor(pos / count)` plus `offset` is odd. `count < 1` returns false.

- [ ] **Step 1: Write the failing tests:**

```ts
describe("showsAlternate: a shared night switches every pass", () => {
  it("first pass taproom, second pass guest, third taproom", () => {
    expect([0, 2, 3, 5, 6].map((p) => showsAlternate(p, 3, 0))).toEqual([false, false, true, true, false]);
  });
  it("a random start of 1 begins on the guest", () => {
    expect(showsAlternate(0, 3, 1)).toBe(true);
    expect(showsAlternate(3, 3, 1)).toBe(false);
  });
  it("going back from the first slide moves to the previous pass", () => {
    expect(showsAlternate(-1, 3, 0)).toBe(true);
  });
  it("a single slide never auto-advances, so it shows the taproom", () => {
    expect(showsAlternate(0, 1, 0)).toBe(false);
  });
});
```

And a render test: `CalendarPage` given `card({ alternate: card({ id: "e2", member: { ...truckMember }, title: "Trivia Night" }) })` still renders the host (`"Mars Brewing Co."`, not `"Trivia Night"`). That proves `CalendarPage` ignores `alternate`, so the choice lives in the carousel.

- [ ] **Step 2: Run them and confirm they fail.**
Run: `npx vitest run src/components/home/MemberEventsCarousel.test.ts`
Expected: FAIL, because `showsAlternate` is not exported.

- [ ] **Step 3: Implement `showsAlternate`** as specified in Interfaces.

- [ ] **Step 4: Switch the carousel to a position.** Replace the `index` state with `pos` (an integer, starting at 0), with `index = ((pos % count) + count) % count`. Replace `go(next)` with `goBy(delta: number)`, which records the leaving slide (as **displayed**) and sets `pos + delta`:
  - the arrows, keys, swipe and timer use `goBy(±1)`;
  - Up next items use `goBy(k)` for k = 1..3.

  Add `displayed(slide, at: number)`: for a member slide whose card has an `alternate`, show the alternate when `showsAlternate(at, count, offset)`. Use it for the current slide (`at = pos`), for each Up next item (`at = pos + k`), and for the `leaving` snapshot. `slideKey` takes the displayed slide, so the two versions get different keys (their ids differ) and the tear-off plays between them. "N of M" still shows `index + 1`.

- [ ] **Step 5: Add the random start without a flash.** `offset` is state starting at `0` (what the server renders). In a mount-only `useEffect`, set it to `Math.random() < 0.5 ? 0 : 1`, **unless** the first slide (`slides[0]`) has an alternate, in which case keep `0`, so the card already on screen never swaps.

- [ ] **Step 6: Run the tests, type check and build.**
Run: `npx vitest run src/components/home src/lib/home` then `npx tsc --noEmit` then `npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit.**

```bash
git add src/components/home/MemberEventsCarousel.tsx src/components/home/MemberEventsCarousel.test.ts
git commit -m "feat(home): a shared night alternates between taproom and guest each pass"
```

---

### Task 3: Member Guide and staging check

**Files:**
- Modify: `docs/member-guide/member-profile-guide.html` (the sentence "Events in the next two weeks also appear on the Guild homepage…")
- Regenerate: `public/member-guide-*.pdf` and `docs/member-guide/ISC-Brewers-Guild-Member-Guide-*.pdf` via `npm run build:guides`

- [ ] **Step 1: Add one sentence** right after "…so a clear title helps.": *"If a Guild food truck, pop-up or entertainer lists a stop at your taproom and you also list that night, it shows once on the homepage, switching between your page and theirs each time the calendar comes around."* Check that the sentence shows in the producer and mobile guides (follow how that paragraph is already filtered by member type).

- [ ] **Step 2: Rebuild the PDFs.**
Run: `npm run build:guides`
Expected: the producer, mobile and affiliate PDFs are regenerated with no errors. Open the producer PDF and confirm the sentence is there.

- [ ] **Step 3: Commit.**

```bash
git add docs/member-guide public/member-guide-*.pdf
git commit -m "docs(member-guide): shared taproom nights alternate on the homepage"
```

- [ ] **Step 4: Owner's go, then staging.** Ask the owner before pushing. After `git fetch` and confirming local `staging` holds only these commits beyond `origin/staging`, push `staging`. Then, with the owner's OK, test by hand on an **unpublished** sample taproom and sample Mobile member (published briefly, never a real published member): list the same night 30 minutes apart, watch the spot switch on each loop, then hide the stop from the taproom's Events page and confirm two separate cards.
