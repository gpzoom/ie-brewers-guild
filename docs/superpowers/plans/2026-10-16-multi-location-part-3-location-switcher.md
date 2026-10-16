# Multi-location Businesses, Part 3: Location Switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone linked to several locations of a one-manager business switches between them from a **[Business] · [City] ▾** menu at the top of the portal and /admin sidebars; "Choose a business" lists such a business once and tells same-named locations apart by city; /admin opens the location chosen in the portal instead of always the oldest link.

**Architecture:** `listPortalMemberships` also reads each location's city, status and business (`business_id`, name, mode). Pure functions in a new `src/lib/portal/location-groups.ts` turn memberships into chooser entries, pick the current location, and build the switcher data. The existing `portal_member` cookie (validated against the user's own `member_users` rows on every request) stays the one source of "which location"; /admin's `requireMemberSession` now honors it the same way. A `LocationSwitcher` component in `AdminShell` calls the existing `choosePortalMember` server function and reloads.

**Tech Stack:** TanStack Start (server functions, router), React, Supabase, Vitest, Radix dropdown (`@/components/ui/dropdown-menu`).

**Spec:** `docs/superpowers/specs/2026-10-15-multi-location-businesses-design.md` — Rollout step 3; Screens → "Location switcher (portal and /admin)". Parts 1–2 are on staging and applied to the shared database.

**Look and layout:** artboard BZ2 `docs/design/artboards/BizSwitcher.dc.html` (owner-approved): desktop sidebar top shows "Hangar 24 · Riverside ▾" opening a menu of the locations by city with *Live* / *Setting up* / *Not started* pills; phone shows the name in the top bar area and the menu as a bottom sheet. Match it where this plan leaves look open.

## Global Constraints

- All visible text in US English. Touch targets ≥ 44px on phones.
- The member being edited is never taken from the client: every request re-derives it from the session plus the `portal_member` cookie, honored only when it names one of the user's own `member_users` rows (existing rule, `portal-access.ts` `pickMembership`).
- **Edit as them is unchanged:** the impersonation cookie still wins in both the portal and /admin, and no location switcher shows while a Guild admin is editing as a member.
- A client-imported `*.server.ts` file must export only `createServerFn` results (plain helpers live in non-`.server` modules) and must be listed in `vite.config.ts` → `importProtection.client.excludeFiles`. **Run `npm run build` before every push** (owner's standing rule, 2026-10-15).
- Staging and production share one database; this part has no migration. Work stays on `staging`; production waits for the owner's "go" and a Member Guide check.

### Rulings this plan makes within the spec

1. **"Which location" without a cookie is the user's oldest link**, in both the portal and /admin (today's /admin rule), so the two never disagree. Picking from the chooser or the switcher sets the cookie, and both follow it.
2. **Location status:** *Live* = `members.status = 'published'`; *Setting up* = not live but `type_confirmed_at` or `setup_completed_at` is set; *Not started* = neither.
3. **Choosing a one-manager business on "Choose a business"** opens its first location by city; the switcher then moves between locations.
4. **The "One manager" switch and business Invite stay super-admin only** (Part 2's gate) until Part 4 lands the shared look and short setup; Part 3 makes the gate's original reason (no switcher) go away but a manager would still have to set up every location in full.
5. **Separately managed same-name locations** someone is linked to (e.g. an editor at two Hangar 24 locations) show on "Choose a business" as "[Name] · [City]" each, so they can be told apart; they get no switcher (the spec's switcher is for one-manager businesses).

## Review Focus

1. **A hand-edited or stale `portal_member` cookie naming a location the user isn't linked to (or was removed from)** must be ignored in /admin exactly as in the portal — /admin opens the oldest link instead, never the cookie's member. Covered in Task 3.
2. **A user linked to one one-manager business only** must go straight into a location (no "Choose a business" screen) and see the switcher. Covered in Task 1.
3. **A user linked to a one-manager business and also to an unrelated business** gets "Choose a business" with the chain listed once (with its location count) and the other business once. Covered in Task 1.
4. **Switching location while on a section page** (e.g. /portal/events) lands on the same section for the new location, and the previous location's draft state never carries over (the layouts already key providers by `memberId`). Covered in Task 4 (navigation keeps the pathname) — verified on staging in Task 5.
5. **A Guild admin editing as a member** sees no switcher in /admin or the portal, even if their own account is linked to a chain. Covered in Task 3 and Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/portal/portal-access.ts` (modify) | `PortalMembership` gains location/business fields; `listPortalMemberships` reads them; `pickMembership` uses chooser entries |
| `src/lib/portal/location-groups.ts` (new) + `.test.ts` | `locationStatus`, `chooserEntries`, `locationSwitcherFor`, `memberIdWithoutChoice` |
| `src/lib/portal/portal-member-cookie.ts` (new) | the cookie's name and max age, shared by portal and /admin |
| `src/lib/portal/portal-session.server.ts` (modify) | `PortalState` uses chooser entries and carries the switcher |
| `src/lib/portal/portal-shell.server.ts` (modify) | pass `switcher` and `canSwitchBusiness` |
| `src/routes/portal.index.tsx` (modify) | "Choose a business" lists entries |
| `src/lib/auth/require-member-session.server.ts` (modify) | /admin honors the cookie |
| `src/lib/portal/location-switcher.server.ts` (new) | `getAdminLocationSwitcher` server function for /admin |
| `vite.config.ts` (modify) | allowlist `location-switcher.server.ts` |
| `src/components/shell/LocationSwitcher.tsx` (new) + `.test.ts` | the menu |
| `src/components/admin/AdminShell.tsx` (modify) | `locationSwitcher` slot at the sidebar top |
| `src/routes/portal._sections.tsx`, `src/routes/admin.tsx` (modify) | wire it |
| `docs/member-profiles.md` (modify) | document |

---

### Task 1: Memberships know their location and business; grouping and picking

**Files:**
- Modify: `src/lib/portal/portal-access.ts` (`PortalMembership`, `MembershipRow`, `listPortalMemberships`, `pickMembership`)
- Create: `src/lib/portal/location-groups.ts`, `src/lib/portal/location-groups.test.ts`
- Modify: `src/lib/portal/portal-access.test.ts` (existing `pickMembership` tests: add the new fields to their fixtures)

**Interfaces:**
- Produces:

```ts
// portal-access.ts
export type PortalMembership = {
  memberId: string;
  role: PortalRole;
  businessName: string;          // the location's own business_name (trimmed), as today
  typeConfirmedAt: string | null;
  setupCompletedAt: string | null;
  city: string;
  status: MemberStatus;           // members.status
  businessId: string | null;      // members.business_id
  businessDisplayName: string | null; // businesses.name
  businessMode: BusinessManagementMode | null;
};

// location-groups.ts
export type LocationStatus = "live" | "setting_up" | "not_started";
export type ChooserEntry =
  | { kind: "member"; memberId: string; label: string; role: PortalRole }
  | { kind: "business"; businessId: string; label: string; locationCount: number; openMemberId: string };
export type LocationSwitcherData = {
  businessName: string;
  currentMemberId: string;
  locations: Array<{ memberId: string; city: string; status: LocationStatus }>;
};
export function locationStatus(m: Pick<PortalMembership, "status" | "typeConfirmedAt" | "setupCompletedAt">): LocationStatus;
export function chooserEntries(memberships: PortalMembership[]): ChooserEntry[];
export function locationSwitcherFor(memberships: PortalMembership[], currentMemberId: string): LocationSwitcherData | null;
```

- `pickMembership(memberships, chosenMemberId, forceChoose)` keeps its signature and `MembershipPick` type; its rule changes (Step 5).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portal/location-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chooserEntries, locationStatus, locationSwitcherFor } from "./location-groups";
import { pickMembership, type PortalMembership } from "./portal-access";

function m(over: Partial<PortalMembership> & { memberId: string }): PortalMembership {
  return {
    role: "owner",
    businessName: "Hangar 24 Brewing Co.",
    typeConfirmedAt: null,
    setupCompletedAt: null,
    city: "Redlands",
    status: "draft",
    businessId: null,
    businessDisplayName: null,
    businessMode: null,
    ...over,
  };
}

const chain = (memberId: string, city: string, over: Partial<PortalMembership> = {}) =>
  m({ memberId, city, businessId: "biz", businessDisplayName: "Hangar 24 Brewing Co.", businessMode: "one_manager", ...over });

describe("locationStatus", () => {
  it("published is live; any setup progress is setting up; otherwise not started", () => {
    expect(locationStatus({ status: "published", typeConfirmedAt: null, setupCompletedAt: null })).toBe("live");
    expect(locationStatus({ status: "draft", typeConfirmedAt: "2026-10-01", setupCompletedAt: null })).toBe("setting_up");
    expect(locationStatus({ status: "draft", typeConfirmedAt: null, setupCompletedAt: null })).toBe("not_started");
  });
});

describe("chooserEntries", () => {
  it("a one-manager business shows once, with its count, opening its first location by city", () => {
    const entries = chooserEntries([chain("r", "Riverside"), chain("i", "Irvine"), m({ memberId: "o", businessName: "Other Brewing", city: "Ontario" })]);
    expect(entries).toEqual([
      { kind: "business", businessId: "biz", label: "Hangar 24 Brewing Co.", locationCount: 2, openMemberId: "i" },
      { kind: "member", memberId: "o", label: "Other Brewing", role: "owner" },
    ]);
  });

  it("same-named locations that aren't one-manager are told apart by city", () => {
    const entries = chooserEntries([
      m({ memberId: "a", city: "Redlands", businessId: "sep", businessMode: "separate" }),
      m({ memberId: "b", city: "Irvine", businessId: "sep", businessMode: "separate" }),
    ]);
    expect(entries.map((e) => e.label)).toEqual(["Hangar 24 Brewing Co. · Irvine", "Hangar 24 Brewing Co. · Redlands"]);
  });
});

describe("pickMembership with businesses", () => {
  it("linked only to one one-manager business: no chooser; no cookie opens the oldest link", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine")];
    expect(pickMembership(list, null)).toEqual({ kind: "one", membership: list[0] });
  });

  it("the cookie picks a location inside the business", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine")];
    expect(pickMembership(list, "i")).toEqual({ kind: "one", membership: list[1] });
  });

  it("a chain plus another business, no cookie: choose", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, null).kind).toBe("choose");
  });

  it("a cookie naming a location the user isn't linked to is ignored", () => {
    const list = [chain("r", "Riverside"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, "stranger").kind).toBe("choose");
  });

  it("Switch business (forceChoose) still shows the chooser when there's more than one entry", () => {
    const list = [chain("r", "Riverside"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, "r", true).kind).toBe("choose");
  });
});

describe("locationSwitcherFor", () => {
  it("lists the business's locations the user is linked to, by city, with status", () => {
    const list = [
      chain("r", "Riverside", { status: "published" }),
      chain("i", "Irvine", { typeConfirmedAt: "2026-10-01" }),
      m({ memberId: "o", businessName: "Other", city: "Ontario" }),
    ];
    expect(locationSwitcherFor(list, "r")).toEqual({
      businessName: "Hangar 24 Brewing Co.",
      currentMemberId: "r",
      locations: [
        { memberId: "i", city: "Irvine", status: "setting_up" },
        { memberId: "r", city: "Riverside", status: "live" },
      ],
    });
  });

  it("none for a separate business, a single location, or one linked location", () => {
    expect(locationSwitcherFor([m({ memberId: "a", businessId: "s", businessMode: "separate" }), m({ memberId: "b", businessId: "s", businessMode: "separate" })], "a")).toBeNull();
    expect(locationSwitcherFor([m({ memberId: "a" })], "a")).toBeNull();
    expect(locationSwitcherFor([chain("r", "Riverside")], "r")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/portal/location-groups.test.ts`
Expected: FAIL — module `./location-groups` not found.

- [ ] **Step 3: Extend memberships**

In `src/lib/portal/portal-access.ts`: import `type { BusinessManagementMode, MemberStatus } from "@/lib/supabase/types"`; extend `PortalMembership` as in Interfaces; extend `MembershipRow.members` with `city: string; status: MemberStatus; business_id: string | null; businesses: { name: string; management_mode: BusinessManagementMode } | null;`; change the select to:

```ts
    .select(
      "member_id, role, created_at, members(business_name, city, status, business_id, type_confirmed_at, setup_completed_at, businesses(name, management_mode))",
    )
```

and fill the new fields in the loop:

```ts
      city: row.members.city,
      status: row.members.status,
      businessId: row.members.business_id,
      businessDisplayName: row.members.businesses?.name?.trim() || null,
      businessMode: row.members.businesses?.management_mode ?? null,
```

- [ ] **Step 4: Write `location-groups.ts`**

```ts
import type { PortalRole } from "@/lib/portal/portal-destination";
import type { PortalMembership } from "@/lib/portal/portal-access";

/**
 * Multi-location businesses in the portal (spec 2026-10-15, "Location
 * switcher"; artboard BZ2). Pure: portal-session.server.ts and
 * location-switcher.server.ts pass in the user's memberships.
 */

export type LocationStatus = "live" | "setting_up" | "not_started";

export type ChooserEntry =
  | { kind: "member"; memberId: string; label: string; role: PortalRole }
  | { kind: "business"; businessId: string; label: string; locationCount: number; openMemberId: string };

export type LocationSwitcherData = {
  businessName: string;
  currentMemberId: string;
  locations: Array<{ memberId: string; city: string; status: LocationStatus }>;
};

export function locationStatus(
  m: Pick<PortalMembership, "status" | "typeConfirmedAt" | "setupCompletedAt">,
): LocationStatus {
  if (m.status === "published") return "live";
  if (m.typeConfirmedAt || m.setupCompletedAt) return "setting_up";
  return "not_started";
}

const byCity = (a: PortalMembership, b: PortalMembership) => a.city.localeCompare(b.city);

function oneManagerGroups(memberships: PortalMembership[]): Map<string, PortalMembership[]> {
  const groups = new Map<string, PortalMembership[]>();
  for (const m of memberships) {
    if (!m.businessId || m.businessMode !== "one_manager") continue;
    const list = groups.get(m.businessId) ?? [];
    list.push(m);
    groups.set(m.businessId, list);
  }
  return groups;
}

/**
 * "Choose a business": a one-manager business the user is linked to more
 * than once is one entry (opening its first location by city); every other
 * link is its own entry, labeled "Name · City" when another entry would
 * otherwise read the same.
 */
export function chooserEntries(memberships: PortalMembership[]): ChooserEntry[] {
  const groups = oneManagerGroups(memberships);
  const entries: ChooserEntry[] = [];
  const seenBusinesses = new Set<string>();
  const singles: PortalMembership[] = [];

  for (const m of memberships) {
    const group = m.businessId ? groups.get(m.businessId) : undefined;
    if (group && group.length > 1) {
      if (seenBusinesses.has(m.businessId!)) continue;
      seenBusinesses.add(m.businessId!);
      const sorted = [...group].sort(byCity);
      entries.push({
        kind: "business",
        businessId: m.businessId!,
        label: m.businessDisplayName ?? m.businessName,
        locationCount: group.length,
        openMemberId: sorted[0].memberId,
      });
    } else {
      singles.push(m);
    }
  }

  const nameCounts = new Map<string, number>();
  for (const m of singles) nameCounts.set(m.businessName, (nameCounts.get(m.businessName) ?? 0) + 1);
  for (const m of [...singles].sort((a, b) => a.businessName.localeCompare(b.businessName) || byCity(a, b))) {
    const label = (nameCounts.get(m.businessName) ?? 0) > 1 ? `${m.businessName} · ${m.city}` : m.businessName;
    entries.push({ kind: "member", memberId: m.memberId, label, role: m.role });
  }
  return entries;
}

/** The sidebar menu: only for a one-manager business with two or more of the user's links. */
export function locationSwitcherFor(
  memberships: PortalMembership[],
  currentMemberId: string,
): LocationSwitcherData | null {
  const current = memberships.find((m) => m.memberId === currentMemberId);
  if (!current?.businessId || current.businessMode !== "one_manager") return null;
  const group = memberships.filter((m) => m.businessId === current.businessId);
  if (group.length < 2) return null;
  return {
    businessName: current.businessDisplayName ?? current.businessName,
    currentMemberId,
    locations: [...group].sort(byCity).map((m) => ({ memberId: m.memberId, city: m.city, status: locationStatus(m) })),
  };
}
```

- [ ] **Step 5: Update `pickMembership`**

Replace its body (keep the doc comment, adding a line: "One-manager businesses count as one entry (location-groups.ts); with no usable cookie, the oldest link opens."):

```ts
export function pickMembership(
  memberships: PortalMembership[],
  chosenMemberId: string | null | undefined,
  forceChoose = false,
): MembershipPick {
  if (memberships.length === 0) return { kind: "none" };
  const entryCount = chooserEntries(memberships).length;
  if (!(forceChoose && entryCount > 1) && chosenMemberId) {
    const chosen = memberships.find((m) => m.memberId === chosenMemberId);
    if (chosen) return { kind: "one", membership: chosen };
  }
  if (entryCount === 1) return { kind: "one", membership: memberships[0] };
  return { kind: "choose", memberships };
}
```

(import `chooserEntries` from `@/lib/portal/location-groups`; the two files import each other's types/functions — keep `location-groups.ts`'s import of `PortalMembership` type-only so there's no runtime cycle problem.)

Note: `forceChoose` with a single entry (one chain only) now opens a location instead of the chooser, since there's nothing to choose; "Switch business" is hidden in that case anyway (Task 2).

- [ ] **Step 6: Update the existing tests' fixtures and run everything**

In `src/lib/portal/portal-access.test.ts`, add the new fields (`city: "X", status: "draft", businessId: null, businessDisplayName: null, businessMode: null`) to every `PortalMembership` literal; existing expectations for unrelated businesses stay true. If a fake Supabase client there returns `members` rows, add `city`, `status`, `business_id: null`, `businesses: null`.

Run: `npx vitest run src/lib/portal`
Expected: PASS. Then `npx tsc --noEmit` — type errors will point at `PortalState`'s users; leave those for Task 2 only if they're in portal-session/portal-shell/portal.index (fix any others now).

- [ ] **Step 7: Commit**

```bash
git add src/lib/portal
git commit -m "feat(portal): memberships know their location and business; one-manager businesses count once"
```

---

### Task 2: Portal state, shell and "Choose a business"

**Files:**
- Create: `src/lib/portal/portal-member-cookie.ts`
- Modify: `src/lib/portal/portal-session.server.ts`, `src/lib/portal/portal-shell.server.ts`, `src/routes/portal.index.tsx`, `src/routes/portal._sections.tsx` (the `sidebarExtra` condition only)
- Test: `src/routes/portal.index.test.ts` only if one exists; otherwise a render test of the extracted `ChooseList` component in `src/components/portal/ChooseList.test.ts`

**Interfaces:**
- Consumes: `chooserEntries`, `locationSwitcherFor`, `ChooserEntry`, `LocationSwitcherData` (Task 1).
- Produces:
  - `portal-member-cookie.ts`: `export const PORTAL_MEMBER_COOKIE = "portal_member"; export const PORTAL_MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;`
  - `PortalState`: `{ kind: "choose"; entries: ChooserEntry[] }` (replaces `memberships`); the `ready` state drops `membershipCount` and `adminOpensOtherName` and adds `switcher: LocationSwitcherData | null; canSwitchBusiness: boolean`.
  - `PortalShell` (portal-shell.server.ts): drops `membershipCount`, adds `switcher: LocationSwitcherData | null; canSwitchBusiness: boolean`.
  - `src/components/portal/ChooseList.tsx`: `ChooseList({ entries, busyId, onChoose }: { entries: ChooserEntry[]; busyId: string | null; onChoose: (memberId: string) => void })`.

- [ ] **Step 1: Write the failing ChooseList test**

Create `src/components/portal/ChooseList.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChooseList } from "./ChooseList";

describe("ChooseList", () => {
  it("shows a one-manager business once with its location count, and other businesses by label", () => {
    const html = renderToStaticMarkup(
      createElement(ChooseList, {
        entries: [
          { kind: "business", businessId: "b", label: "Hangar 24 Brewing Co.", locationCount: 4, openMemberId: "m1" },
          { kind: "member", memberId: "m9", label: "Other Brewing", role: "editor" },
        ],
        busyId: null,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("4 locations");
    expect(html).toContain("Other Brewing");
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/portal/ChooseList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Extract `ChooseList`**

Move the `<ul>` of choice buttons out of `ChooseCard` in `src/routes/portal.index.tsx` into `src/components/portal/ChooseList.tsx`, keeping the existing button classes and the existing role line under each name. Each entry renders one `<button type="button">`:
- `kind: "business"` → label, plus a second line "{locationCount} locations"; clicking calls `onChoose(entry.openMemberId)`.
- `kind: "member"` → label, plus the role line the card shows today; clicking calls `onChoose(entry.memberId)`.
- The button whose target equals `busyId` is disabled and reads "Opening…" in place of its second line.
`ChooseCard` keeps its heading and lead text and renders `<ChooseList entries={state.entries} … />`, calling `choosePortalMember({ data: { memberId } })` as today.

Run: `npx vitest run src/components/portal/ChooseList.test.ts` — PASS.

- [ ] **Step 4: Portal state and shell**

`src/lib/portal/portal-member-cookie.ts` as in Interfaces; `portal-session.server.ts` imports the constants from it (delete its local copies).

In `resolvePortalState`:
- the impersonation branch's `ready` state: `switcher: null, canSwitchBusiness: false` (drop `membershipCount` and `adminOpensOtherName`);
- the `choose` branch: `state: { kind: "choose", entries: chooserEntries(pick.memberships) }`;
- the final `ready` state: drop `membershipCount` and `adminOpensOtherName`; add `switcher: locationSwitcherFor(memberships, chosen.memberId)` and `canSwitchBusiness: chooserEntries(memberships).length > 1`.

Update the `PortalState` type and its doc comment accordingly. In `portal-shell.server.ts`, replace `membershipCount: member.membershipCount` with `switcher: member.switcher, canSwitchBusiness: member.canSwitchBusiness` and update `PortalShell`. In `src/routes/portal._sections.tsx`, change the Switch business condition from `shell.membershipCount > 1` to `shell.canSwitchBusiness`.

- [ ] **Step 5: Type check, tests, build**

Run: `npx tsc --noEmit` (only the pre-existing `src/routes/survey.tsx` error), `npx vitest run src/lib/portal src/components/portal src/routes`, `npm run build` (must succeed).

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal src/routes/portal.index.tsx src/routes/portal._sections.tsx src/components/portal/ChooseList.tsx src/components/portal/ChooseList.test.ts
git commit -m "feat(portal): Choose a business lists a chain once; portal state carries the location switcher"
```

---

### Task 3: /admin follows the chosen location

**Files:**
- Modify: `src/lib/auth/require-member-session.server.ts`
- Create: `src/lib/portal/location-switcher.server.ts`
- Modify: `vite.config.ts` (`importProtection.client.excludeFiles`)
- Test: `src/lib/portal/location-groups.test.ts` (add the pure rule below)

**Interfaces:**
- Consumes: `PORTAL_MEMBER_COOKIE` (Task 2), `listPortalMemberships`, `pickMembership`, `locationSwitcherFor` (Task 1).
- Produces:
  - `location-groups.ts`: `export function adminMemberIdFor(memberships: PortalMembership[], cookieMemberId: string | null | undefined): string | null` — the cookie's member when it's one of the memberships, else the oldest membership's id, else null.
  - `location-switcher.server.ts`: `export const getAdminLocationSwitcher = createServerFn({ method: "GET" }).handler(async (): Promise<LocationSwitcherData | null> => …)`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/portal/location-groups.test.ts` (import `adminMemberIdFor`):

```ts
describe("adminMemberIdFor (/admin follows the portal's choice)", () => {
  const list = [chain("r", "Riverside"), chain("i", "Irvine")];
  it("the cookie's location when the user is linked to it", () => {
    expect(adminMemberIdFor(list, "i")).toBe("i");
  });
  it("a stale or foreign cookie is ignored: the oldest link opens", () => {
    expect(adminMemberIdFor(list, "stranger")).toBe("r");
    expect(adminMemberIdFor(list, null)).toBe("r");
  });
  it("no links: null", () => {
    expect(adminMemberIdFor([], "i")).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/portal/location-groups.test.ts` — FAIL (`adminMemberIdFor` not exported).

- [ ] **Step 2: Implement the rule**

In `location-groups.ts`:

```ts
/** Which member /admin opens: the portal's remembered choice when it's one of the user's links, else the oldest link. */
export function adminMemberIdFor(
  memberships: PortalMembership[],
  cookieMemberId: string | null | undefined,
): string | null {
  if (cookieMemberId && memberships.some((m) => m.memberId === cookieMemberId)) return cookieMemberId;
  return memberships[0]?.memberId ?? null;
}
```

Run the test — PASS.

- [ ] **Step 3: Use it in `requireMemberSession`**

In `src/lib/auth/require-member-session.server.ts`, after the `routing.role === "none"` redirect and before the final `return`, replace `memberId: routing.memberId` with the cookie-aware choice:

```ts
    // /admin follows the location chosen in the portal (spec 2026-10-15,
    // "Location switcher"): the portal_member cookie, honored only when it
    // names one of this user's own links -- else the oldest link, as before.
    const service = await getSupabaseServiceRoleClient();
    const memberships = await listPortalMemberships(service, user.id);
    const memberId = adminMemberIdFor(memberships, getCookie(PORTAL_MEMBER_COOKIE)) ?? routing.memberId;
```

and return `memberId`. Imports: `getCookie` from `@tanstack/react-start/server`, `getSupabaseServiceRoleClient` from `@/lib/supabase/server`, `listPortalMemberships` from `@/lib/portal/portal-access`, `adminMemberIdFor` from `@/lib/portal/location-groups`, `PORTAL_MEMBER_COOKIE` from `@/lib/portal/portal-member-cookie`. The impersonation branch above is unchanged (Edit as them still wins). Update the function's doc comment with one sentence about the cookie.

- [ ] **Step 4: The /admin switcher data**

Create `src/lib/portal/location-switcher.server.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { listPortalMemberships } from "@/lib/portal/portal-access";
import { adminMemberIdFor, locationSwitcherFor, type LocationSwitcherData } from "@/lib/portal/location-groups";
import { PORTAL_MEMBER_COOKIE } from "@/lib/portal/portal-member-cookie";

/**
 * /admin's location switcher (artboard BZ2). Same member rule as
 * requireMemberSession; none while a Guild admin is editing as a member.
 */
export const getAdminLocationSwitcher = createServerFn({ method: "GET" }).handler(
  async (): Promise<LocationSwitcherData | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return null;
    if (await readImpersonationState()) return null;

    const service = await getSupabaseServiceRoleClient();
    const memberships = await listPortalMemberships(service, user.id);
    const memberId = adminMemberIdFor(memberships, getCookie(PORTAL_MEMBER_COOKIE));
    return memberId ? locationSwitcherFor(memberships, memberId) : null;
  },
);
```

In `vite.config.ts`, add `"src/lib/portal/location-switcher.server.ts"` to `importProtection.client.excludeFiles` with a comment in the style of its neighbors ("its one createServerFn export, getAdminLocationSwitcher, is called from the /admin layout's loader — the same safe RPC boundary"). If `src/lib/portal/portal-session.server.ts` is imported by client code and isn't already listed, it is — check that `choosePortalMember`'s file is listed (the build will tell you).

- [ ] **Step 5: Tests, type check, build, commit**

Run: `npx vitest run src/lib/portal src/lib/auth`, `npx tsc --noEmit`, `npm run build` (must succeed).

```bash
git add src/lib/auth/require-member-session.server.ts src/lib/portal vite.config.ts
git commit -m "feat(admin): /admin opens the location chosen in the portal"
```

---

### Task 4: The LocationSwitcher menu in both shells

**Files:**
- Create: `src/components/shell/LocationSwitcher.tsx`, `src/components/shell/LocationSwitcher.test.ts`
- Modify: `src/components/admin/AdminShell.tsx` (new optional prop `locationSwitcher`, rendered at the top of the sidebar nav, before the "{memberName} Profile" heading, which it replaces when present), `src/routes/portal._sections.tsx`, `src/routes/admin.tsx`

**Interfaces:**
- Consumes: `LocationSwitcherData`, `LocationStatus` (Task 1); `choosePortalMember` (existing, `src/lib/portal/portal-session.server.ts`); `getAdminLocationSwitcher` (Task 3); `PortalShell.switcher` (Task 2).
- Produces: `LocationSwitcher({ data }: { data: LocationSwitcherData })`; `AdminShell` prop `locationSwitcher?: LocationSwitcherData | null`.

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/LocationSwitcher.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
  useRouterState: () => "/portal/events",
}));
vi.mock("@/lib/portal/portal-session.server", () => ({ choosePortalMember: vi.fn() }));

import { LocationSwitcher, STATUS_LABEL } from "./LocationSwitcher";

const data = {
  businessName: "Hangar 24 Brewing Co.",
  currentMemberId: "r",
  locations: [
    { memberId: "i", city: "Irvine", status: "not_started" as const },
    { memberId: "r", city: "Riverside", status: "live" as const },
  ],
};

describe("LocationSwitcher (artboard BZ2)", () => {
  it("the trigger names the business and the current city", () => {
    const html = renderToStaticMarkup(createElement(LocationSwitcher, { data }));
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("Riverside");
    expect(html).toMatch(/aria-label="Switch location[^"]*"/);
  });

  it("status labels match the artboard", () => {
    expect(STATUS_LABEL).toEqual({ live: "Live", setting_up: "Setting up", not_started: "Not started" });
  });
});
```

Run: `npx vitest run src/components/shell/LocationSwitcher.test.ts` — FAIL (module not found). (Radix menus render their items only when open, so the item list is checked on staging in Task 5; the pure list is already tested in Task 1.)

- [ ] **Step 2: Write the component**

```tsx
import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { choosePortalMember } from "@/lib/portal/portal-session.server";
import type { LocationStatus, LocationSwitcherData } from "@/lib/portal/location-groups";

export const STATUS_LABEL: Record<LocationStatus, string> = {
  live: "Live",
  setting_up: "Setting up",
  not_started: "Not started",
};

const STATUS_CLASS: Record<LocationStatus, string> = {
  live: "bg-[#E4F1E2] text-[#2F6B2C]",
  setting_up: "bg-[#F6EADF] text-[#7A4413]",
  not_started: "bg-canvas-2 text-ink-muted",
};

/**
 * "[Business] · [City] ▾" at the top of the portal and /admin sidebars
 * (spec 2026-10-15; artboard BZ2). Choosing a location remembers it
 * (choosePortalMember, which refuses a location the user isn't linked to)
 * and reloads the same page for that location.
 */
export function LocationSwitcher({ data }: { data: LocationSwitcherData }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [busy, setBusy] = useState(false);
  const current = data.locations.find((l) => l.memberId === data.currentMemberId);

  async function choose(memberId: string) {
    if (memberId === data.currentMemberId) return;
    setBusy(true);
    try {
      await choosePortalMember({ data: { memberId } });
      await router.invalidate();
      await router.navigate({ to: pathname });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Switch location. Now editing ${data.businessName} · ${current?.city ?? ""}`}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[9px] border border-canvas-border bg-white px-3 text-left font-display text-[15px] font-bold leading-tight text-ink hover:bg-canvas-2 disabled:opacity-60"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {data.businessName} <span className="font-sans font-normal text-ink-muted">· {current?.city}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px] rounded-[10px] border-canvas-border bg-white p-1.5 font-sans shadow-lg">
        <DropdownMenuLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Locations
        </DropdownMenuLabel>
        {data.locations.map((l) => (
          <DropdownMenuItem
            key={l.memberId}
            onSelect={() => void choose(l.memberId)}
            aria-current={l.memberId === data.currentMemberId ? "true" : undefined}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-[14px] text-ink"
          >
            <span className={l.memberId === data.currentMemberId ? "font-semibold" : undefined}>{l.city}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[l.status]}`}>
              {STATUS_LABEL[l.status]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

If `DropdownMenuLabel` isn't exported by `@/components/ui/dropdown-menu`, use a plain `<div role="presentation">` with the same classes. On phones the shell's nav is a horizontal strip; render the switcher above the strip at full width (Step 3) — the dropdown opens as a menu under it, which stands in for BZ2's bottom sheet (note this in the commit body).

Run: `npx vitest run src/components/shell/LocationSwitcher.test.ts` — PASS.

- [ ] **Step 3: AdminShell slot**

In `src/components/admin/AdminShell.tsx`: add prop `locationSwitcher?: LocationSwitcherData | null` (doc: "A one-manager business's location menu (artboard BZ2); replaces the '[Name] Profile' heading."). In the `<nav>`, before the existing name heading:

```tsx
          {locationSwitcher ? (
            <div className="w-full px-1 pb-3 md:px-0">
              <LocationSwitcher data={locationSwitcher} />
            </div>
          ) : (
            <div className="hidden px-3 pb-3 font-display text-[19px] font-bold leading-tight tracking-[-0.01em] text-ink normal-case [overflow-wrap:anywhere] md:block">
              {memberName ? `${memberName} Profile` : "Your profile"}
            </div>
          )}
```

(the second branch is the existing heading, unchanged). If the phone nav strip is `flex-row` with overflow scrolling, make the switcher wrapper `basis-full` / `w-full shrink-0` so it sits on its own row above the tabs; check `sidebarNavClass` in `src/components/shell/AppChrome.tsx` and adjust only the wrapper.

- [ ] **Step 4: Wire both shells**

- `src/routes/portal._sections.tsx`: pass `locationSwitcher={shell.switcher}` to `AdminShell`.
- `src/routes/admin.tsx`: in the loader's `Promise.all`, add `context.isImpersonating ? Promise.resolve(null) : getAdminLocationSwitcher()` and return it as `locationSwitcher`; in `AdminLayoutInner`, read it from `Route.useLoaderData()` and pass `locationSwitcher={locationSwitcher}`.

- [ ] **Step 5: Full checks**

Run: `npm test`, `npx tsc --noEmit` (survey only), `npm run build` (must succeed).

- [ ] **Step 6: Commit**

```bash
git add src/components/shell src/components/admin/AdminShell.tsx src/routes/portal._sections.tsx src/routes/admin.tsx
git commit -m "feat(shell): location switcher at the top of the portal and /admin sidebars"
```

---

### Task 5: Docs, build, and review on staging

**Files:**
- Modify: `docs/member-profiles.md`

- [ ] **Step 1: Docs**

In `docs/member-profiles.md`, near the "Businesses (multi-location)" section, add: "**Location switcher (Part 3, 16 October 2026):** someone linked to two or more locations of a one-manager business gets a **[Business] · [City] ▾** menu at the top of the portal and /admin sidebars, listing their locations by city as Live, Setting up or Not started. Choosing one remembers it (the `portal_member` cookie, honored only for the user's own links) and reloads the same page for that location. /admin now opens that remembered location too, else the oldest link. "Choose a business" lists a one-manager business once with its location count, and tells same-named locations apart by city. No switcher while a Guild admin is editing as a member. The One manager switch and business Invite stay super-admin only until Part 4 (shared look and short setup)." Commit: `docs: location switcher`.

- [ ] **Step 2: Build and push (owner already approved staging pushes for this work; no migration)**

Run `npm run build` (must succeed), then `git push origin staging`, then confirm a new staging deployment after the push time (`npx wrangler deployments list --name ie-brewers-guild-staging`). If none appears within ~5 minutes, run the build again locally before re-triggering (owner rule, 2026-10-15).

- [ ] **Step 3: Staging check with a sample business (super admin)**

On staging, as the super admin: on /guild/roster, add three sample locations named "Sample Chain" (Part of → the first), switch that business to **One manager**, and invite a test address the owner controls. Sign in as that address: no "Choose a business" screen; the switcher lists the three cities as Not started; switching moves between them on the same page; /admin shows the same switcher and opens the chosen location. Then the owner deletes the sample members from the roster (super admin only).
