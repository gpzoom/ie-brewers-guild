# Homepage Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The super admin arranges the homepage's sections on Guild Settings and adds dated, optionally linked image announcements whose images live in a reusable gallery.

**Architecture:** Two new tables (`homepage_sections`, `announcement_images`), super-admin-only by RLS. Pure rules (date window, link checks, which sections show) live in `src/lib/home/sections.ts`; the public homepage reads through the service role and renders sections in order; Settings writes through the session client via super-admin cores, following `src/lib/guild/site-settings.ts`.

**Tech Stack:** TanStack Start + React on Cloudflare Workers, Supabase (Postgres, RLS, Storage), Vitest (`src/**/*.test.ts`), pgTAP (`npm run test:db -- <file>`).

**Spec:** `docs/superpowers/specs/2026-11-14-homepage-sections-design.md`

## Global Constraints

- US English in all site text.
- Only the super admin changes anything (`requireSuperAdmin` first, then RLS again). The public read uses the service role and returns only what a visitor needs.
- Dates are whole days in `America/Los_Angeles`: shown from the start of `starts_on` through the end of `ends_on`; either may be null.
- Images: `site-images` bucket, folder `announcements/`, JPEG/PNG, 10 MB; validate with `validateUploadedImage` and strip with `stripImageMetadata` exactly as `uploadHeroImage` does (`src/lib/guild/site-settings.server.ts`).
- External links must start with `https://` or `http://` and open with `target="_blank" rel="noopener noreferrer"`. Internal links are one of `INTERNAL_PAGES` or `/members/<slug>` of a currently published member; anything else renders as an unlinked image.
- The homepage never breaks on bad data: a bad row is skipped (logged); a failed read falls back to the default layout (spotlight if `CURRENT_SPOTLIGHT`, then events).
- Staging and live share one database; `db push` needs the owner's go, and must happen before code that reads the new tables is pushed.
- Until the merge to `main`, flipping the spotlight row also writes `site_settings.spotlight_enabled` (mirror).
- Don't reformat files you touch (no project-wide prettier); keep LF line endings.
- New `*.server.ts` files with `createServerFn` called from routes/components go in `vite.config.ts` `importProtection.client.excludeFiles` with a one-line comment.

## Review Focus

1. **Date edges in Pacific time** — an announcement ending Dec 20 must still show at 11:59 PM Pacific Dec 20 and not at 12:00 AM Dec 21, even though that's already Dec 21 UTC. (Task 2 tests.)
2. **A member unpublished after the announcement was made** — the image still shows, unlinked. (Task 2 and Task 3 tests.)
3. **Deleting a gallery image in use** — refused, naming the announcements; the file is not removed. (Task 1 pgTAP + Task 4 tests.)
4. **Moving the top row up / bottom row down** — a no-op, not an error or a duplicate position. (Task 1 pgTAP.)
5. **`#coming-up` anchor** — stays on the events section wherever it sits, so the hero's "Upcoming events" button works. (Task 3 test.)

---

### Task 1: Database — tables, RLS, seed, move function

**Files:**
- Create: `supabase/migrations/20261118100000_homepage_sections.sql`
- Test: `supabase/tests/homepage_sections.test.sql`

**Interfaces:**
- Produces:
  - `announcement_images(id uuid pk default gen_random_uuid(), image_path text not null check (image_path ~ '^announcements/[A-Za-z0-9._-]+$'), alt_text text not null check (length(trim(alt_text)) > 0), width int, height int, created_at, updated_at, updated_by_user_id uuid)`
  - `homepage_sections(id uuid pk, kind text not null check (kind in ('events','spotlight','image')), position int not null, enabled boolean not null default true, image_id uuid references announcement_images(id) on delete restrict, alt_text text, link_kind text not null default 'none' check (link_kind in ('none','internal','external')), link_target text, starts_on date, ends_on date, created_at, updated_at, updated_by_user_id uuid)`, with checks: `kind = 'image'` ⇔ `image_id is not null`; `link_kind = 'none'` ⇔ `link_target is null`; `ends_on >= starts_on` when both set; unique index on `kind` where `kind in ('events','spotlight')`; unique `position` **deferrable initially deferred**.
  - `public.move_homepage_section(p_id uuid, p_direction int) returns void` — `security invoker`, swaps `position` with the nearest neighbor above (`-1`) or below (`1`); no neighbor → no-op. Raises on `p_direction not in (-1, 1)`.
  - Seed: spotlight at position 1 with `enabled = (select spotlight_enabled from site_settings)`, events at position 2.
  - RLS on both tables: select/insert/update/delete only `public.is_super_admin()`. Delete on `homepage_sections` also requires `kind = 'image'`.
  - `set_updated_at` triggers on both tables (same as other tables).

- [ ] **Step 1: Write the pgTAP test** (pattern: `supabase/tests/spotlight_switch.test.sql`; Guild admin uuid `f0000000-0000-4000-8000-000000000004` from fixtures, create a super admin as that file does). Assertions, `plan(10)`:
  - both tables exist;
  - seed: exactly one `spotlight` row at position 1 and one `events` row at position 2;
  - Guild admin (not super): insert into `homepage_sections` fails / affects no rows; select returns 0 rows;
  - super admin: inserts an `announcement_images` row and an `image` section at position 3;
  - `move_homepage_section(<image id>, -1)` → image at 2, events at 3;
  - `move_homepage_section(<spotlight id>, -1)` (already top) → positions unchanged;
  - deleting the in-use `announcement_images` row raises `foreign_key_violation` (`throws_ok`, SQLSTATE `23503`);
  - deleting the `events` row as super admin deletes 0 rows;
  - an `image` row with `ends_on < starts_on` is rejected (`23514`).
- [ ] **Step 2: Run it and watch it fail.** Run: `npm run test:db -- supabase/tests/homepage_sections.test.sql` Expected: FAIL (tables don't exist).
- [ ] **Step 3: Write the migration** with the interfaces above; header comment citing the spec.
- [ ] **Step 4: Run it and watch it pass.** Same command. Expected: `ok 1..10`, no `not ok`.
- [ ] **Step 5: Commit.** `git add supabase/migrations/20261118100000_homepage_sections.sql supabase/tests/homepage_sections.test.sql && git commit -m "feat(db): homepage sections and announcement image gallery"`

Do **not** `db push`; the controller asks the owner.

---

### Task 2: Pure rules — `src/lib/home/sections.ts`

**Files:**
- Create: `src/lib/home/sections.ts`, `src/lib/home/sections.test.ts`

**Interfaces:**
- Produces:
  - `type SectionKind = "events" | "spotlight" | "image"`; `type LinkKind = "none" | "internal" | "external"`
  - `type SectionRow` — the `homepage_sections` columns in snake_case, plus `image: { image_path: string; alt_text: string; width: number | null; height: number | null } | null` (embedded).
  - `INTERNAL_PAGES: ReadonlyArray<{ path: string; label: string }>` — Home `/`, About `/about`, Members `/members`, Events `/events`, Jobs `/jobs`, News `/news`, Contact `/contact` (only routes that exist under `src/routes`).
  - `pacificToday(now: Date): string` — `YYYY-MM-DD` in America/Los_Angeles.
  - `isInDateWindow(row: { starts_on: string | null; ends_on: string | null }, today: string): boolean`
  - `sectionStatus(row: SectionRow, today: string): "showing" | "scheduled" | "ended" | "off"` (off wins over dates).
  - `checkLink(kind: LinkKind, target: string | null): string | null` — an error message for the Settings form, or null when valid. Internal: in `INTERNAL_PAGES` or matches `^/members/[a-z0-9-]+$`. External: `^https?://` and parses as a URL.
  - `resolveLink(kind: LinkKind, target: string | null, publishedSlugs: ReadonlySet<string>): { href: string; external: boolean } | null`
  - `type VisibleSection = { kind: "events" } | { kind: "spotlight" } | { kind: "image"; id: string; imageUrl: string; alt: string; width: number | null; height: number | null; link: { href: string; external: boolean } | null }`
  - `visibleSections(rows: SectionRow[], ctx: { today: string; hasSpotlight: boolean; publishedSlugs: ReadonlySet<string>; imageUrl: (path: string) => string }): VisibleSection[]` — sorted by position; skips off rows, out-of-window image rows, spotlight without content, image rows missing an image; alt = row `alt_text` override, else the image's.
  - `DEFAULT_SECTIONS(hasSpotlight: boolean): VisibleSection[]` — spotlight (if content) then events.

- [ ] **Step 1: Write the failing tests**, including:
  - `pacificToday(new Date("2026-12-21T07:59:00Z"))` → `"2026-12-20"`; `("2026-12-21T08:00:00Z")` → `"2026-12-21"`.
  - `isInDateWindow({starts_on: "2026-12-01", ends_on: "2026-12-20"}, "2026-12-20")` true; `"2026-12-21"` false; `"2026-11-30"` false; both null → true.
  - `sectionStatus`: enabled + before start → `"scheduled"`; after end → `"ended"`; disabled → `"off"`.
  - `checkLink("external", "javascript:alert(1)")` → error; `("external", "https://example.com/x")` → null; `("internal", "/members/mars-brewing-co")` → null; `("internal", "/guild/settings")` → error; `("internal", "/events")` → null.
  - `resolveLink("internal", "/members/gone", new Set(["mars"]))` → null; `("internal", "/members/mars", new Set(["mars"]))` → `{ href: "/members/mars", external: false }`; external → `{ external: true }`.
  - `visibleSections`: order by position; a disabled row is skipped; spotlight skipped when `hasSpotlight` false; an image row with `image: null` skipped; alt override wins.
- [ ] **Step 2: Run, watch fail.** `npx vitest run src/lib/home/sections.test.ts` Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/home/sections.ts`.
- [ ] **Step 4: Run, watch pass.** Same command. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(home): section rules — dates, links, order"`

---

### Task 3: The homepage renders sections

**Files:**
- Modify: `src/lib/home/homepage.server.ts` (add `sections: VisibleSection[]` to `HomepageData`; drop `spotlightEnabled` from it)
- Create: `src/components/home/ImageAnnouncement.tsx`, `src/components/home/HomepageSections.test.ts`
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: Task 2's `visibleSections`, `DEFAULT_SECTIONS`, `pacificToday`, `VisibleSection`.
- Produces: `loadSections(now: Date): Promise<VisibleSection[]>` inside `homepage.server.ts` — service role; reads `homepage_sections` with embedded `announcement_images(image_path, alt_text, width, height)`, and the published members' slugs (only when some image row links to `/members/…`); on any error logs `"getHomepageData: couldn't read homepage_sections, using the default layout"` and returns `DEFAULT_SECTIONS(Boolean(CURRENT_SPOTLIGHT))`.
- Produces: `ImageAnnouncement({ section }: { section: Extract<VisibleSection, { kind: "image" }> })` — `<img>` with `alt`, `width`/`height` when known, `className` full width, `h-auto`, rounded like the spotlight; wrapped in `<a>` (internal: same tab; external: `target="_blank" rel="noopener noreferrer"`) when `link` is set.
- Produces: `HomepageSections({ sections, carousel })` exported from `src/routes/index.tsx` or a new `src/components/home/HomepageSections.tsx` (builder's choice) that renders each in order, each in the same `<section className="mx-auto max-w-7xl px-4 …">` wrapper, with `id="coming-up"` and `scroll-mt-24` only on the events section.

- [ ] **Step 1: Write failing render tests** (`renderToStaticMarkup`, like `MemberEventsCarousel.test.ts`): sections `[image(external), events, spotlight]` render in that order; the image link has `target="_blank"` and `rel="noopener noreferrer"`; an image with `link: null` has no `<a>`; `id="coming-up"` appears exactly once, on the events section, wherever it sits.
- [ ] **Step 2: Run, watch fail.** `npx vitest run src/components/home/HomepageSections.test.ts`
- [ ] **Step 3: Implement** the loader change, the component, and `index.tsx` (the spotlight section renders `SpotlightShowcase` with `CURRENT_SPOTLIGHT`; events renders `MemberEventsCarousel` as today).
- [ ] **Step 4: Run, watch pass**, then `npx vitest run` (whole suite). Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(home): render homepage sections in order"`

---

### Task 4: Settings cores and server functions

**Files:**
- Create: `src/lib/guild/homepage-sections.ts`, `src/lib/guild/homepage-sections.test.ts`, `src/lib/guild/homepage-sections.server.ts`
- Modify: `vite.config.ts` (excludeFiles: `src/lib/guild/homepage-sections.server.ts`)

**Interfaces:**
- Consumes: Task 1 tables and `move_homepage_section`; Task 2 `checkLink`, `sectionStatus`, `pacificToday`.
- Produces (cores take `sessionClient: SupabaseClient` first; all call `requireSuperAdmin(sessionClient, "change the homepage")` first):
  - `type SettingsSection = SectionRow & { status: "showing" | "scheduled" | "ended" | "off"; imageUrl: string | null }`
  - `type GalleryImage = { id: string; imagePath: string; imageUrl: string; alt: string; width: number | null; height: number | null; usedBy: string[] /* announcement labels */ }`
  - `listHomepageSectionsCore(c, now): Promise<{ sections: SettingsSection[]; gallery: GalleryImage[]; memberPages: Array<{ path: string; label: string }> }>` — `memberPages` = published members as `/members/<slug>`, label = business name, plus city when the business has more than one location (reuse `multiLocationCities` from `src/lib/home/member-events.ts`).
  - `setSectionEnabledCore(c, id, enabled, now)` — when the row is the spotlight, also `update site_settings set spotlight_enabled = enabled` (mirror; comment: remove after the merge to main).
  - `moveSectionCore(c, id, direction: -1 | 1)` — calls the RPC.
  - `saveAnnouncementCore(c, input: { id?: string; imageId: string; altText: string | null; linkKind: LinkKind; linkTarget: string | null; startsOn: string | null; endsOn: string | null; enabled: boolean }, now)` — validates with `checkLink` and the date order (messages: "Choose a page or enter a web address.", "Web addresses start with https://", "The end date is before the start date."); new rows go to `max(position) + 1`.
  - `deleteAnnouncementCore(c, id)` — image rows only; never touches the gallery.
  - `saveGalleryImageCore(c, input: { path: string; altText: string; width: number | null; height: number | null }, now)` and `updateGalleryAltCore(c, id, altText, now)` — alt required ("Add a short description of the image.").
  - `deleteGalleryImageCore(c, id): Promise<{ removedPath: string }>` — if any section uses it, throws `In use by: <labels>. Remove it from those announcements first.`; else deletes the row and returns the path for the caller to remove from storage.
  - Server functions in `homepage-sections.server.ts` wrapping each core with `getSupabaseServerClientForRequest()`; `uploadGalleryImage(formData: file + altText)` mirrors `uploadHeroImage` (validate, strip, upload to `announcements/<uuid>-<sanitized name>`, save row, remove the file if the save throws) and reads width/height from the validated image if `validateUploadedImage` exposes them (else null); `deleteGalleryImage` removes the file after the core succeeds.

- [ ] **Step 1: Write failing tests** with a fake session client (pattern: `fakeSession` in `src/lib/guild/site-settings.test.ts`): a Guild admin (not super) is refused by every core with no writes; `saveAnnouncementCore` rejects `javascript:` and an end date before the start date with the messages above; spotlight `setSectionEnabledCore` writes both `homepage_sections` and `site_settings.spotlight_enabled`; `deleteGalleryImageCore` on an image used by "Holiday parties" throws naming it and deletes nothing; `deleteAnnouncementCore` never deletes from `announcement_images`.
- [ ] **Step 2: Run, watch fail.** `npx vitest run src/lib/guild/homepage-sections.test.ts`
- [ ] **Step 3: Implement** cores, server functions, and the `vite.config.ts` entry.
- [ ] **Step 4: Run, watch pass**, then `npx vitest run`.
- [ ] **Step 5: Commit.** `git commit -m "feat(guild): homepage sections and gallery — settings actions"`

---

### Task 5: Settings screen — Homepage sections card and gallery

**Files:**
- Create: `src/components/guild/HomepageSectionsCard.tsx` (list, ▲▼, switches, status, Add/Edit/Delete), `src/components/guild/AnnouncementForm.tsx`, `src/components/guild/AnnouncementGallery.tsx`
- Modify: `src/components/guild/SiteSettingsScreen.tsx` (replace `SpotlightCard` with `HomepageSectionsCard`; remove `saveSpotlightEnabled` import), `src/routes/guild.settings.tsx` (load `listHomepageSections` alongside `getSiteSettings`)
- Test: `src/components/guild/HomepageSectionsCard.test.ts`

**Interfaces:**
- Consumes: Task 4's server functions and types; `INTERNAL_PAGES`.
- Produces: the UI in the spec's sketch. Card style: `cardClass` and `StatusMessage` from `SiteSettingsScreen.tsx` (export them if needed). Gallery grid looks like `src/components/admin/MediaGallery.tsx` (thumbnails + description), with Upload, Edit description, Delete. The form: image picker (gallery grid + "Upload new"), description override (placeholder shows the image's own), link radio None / A page on our site (one `<select>` grouping site pages and member pages) / An outside website (URL input), start and end date inputs, Save/Cancel. Status labels: "Showing", "Showing · until Dec 20", "Scheduled · from Dec 1", "Ended · Dec 20", "Off". The spotlight row shows "No spotlight content right now" when `CURRENT_SPOTLIGHT` is null. The ▲ on the first row and ▼ on the last are disabled.

- [ ] **Step 1: Write failing render tests:** rows render in position order with their status labels; the first row's ▲ and last row's ▼ are `disabled`; the events and spotlight rows have no Delete button.
- [ ] **Step 2: Run, watch fail.** `npx vitest run src/components/guild/HomepageSectionsCard.test.ts`
- [ ] **Step 3: Implement** the components and wire them into Settings.
- [ ] **Step 4: Run, watch pass**, then `npx vitest run` and `npm run build` (with placeholder `VITE_*` values: `VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=x VITE_SUPABASE_ANON_KEY=x npm run build`). Expected: tests pass, build exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat(guild): Homepage sections card with announcement gallery"`

---

### Task 6: Docs

**Files:**
- Modify: `docs/member-profiles.md` ("Homepage" > "Spotlight" and a new "Sections" entry: the list, announcements, gallery, dates in Pacific, link rules, the fallback, the temporary spotlight mirror).

- [ ] **Step 1:** Update the docs to match what was built.
- [ ] **Step 2: Commit.** `git commit -m "docs: homepage sections"`
