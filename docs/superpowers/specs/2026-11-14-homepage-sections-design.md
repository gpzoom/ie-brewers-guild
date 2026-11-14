# Homepage sections: arrange the homepage, add image announcements

Owner request, 2026-11-14. Status: design, awaiting owner approval.

## Why

The owner wants to run the homepage without a code change each time. Today it
is a fixed stack: hero, the GABF spotlight, the events carousel. Right now they
want to move the GABF spotlight below the carousel and put a new announcement
above it: a clickable image about booking holiday parties at a brewery. More
announcements will follow, so this has to be something the owner does in
Settings, not something the webmaster edits.

## Goals

- The super admin arranges the homepage's sections on **Guild Settings**:
  order (up/down), and on/off for each.
- A new section type, **image announcement**: an uploaded image, a required
  description, an optional link, optional start and end dates.
- Any number of announcements; each can be placed anywhere in the order,
  edited, or deleted.
- Built so a future section type (a video, a text block) is one more kind of
  row, not a redesign.

## Non-goals

- The hero stays fixed at the top and keeps its own Settings card (image upload).
- The GABF spotlight's content stays in code (`src/lib/home/spotlight.ts`);
  only its place and its on/off move into the sections list.
- No drag-and-drop, no per-section styling, no separate phone image, no
  click tracking.

## Anti-goals (would make this a failure even if it works)

- A visitor ever seeing an announcement outside its dates, or a broken link.
- The homepage breaking or going blank because a section's data is bad: a bad
  section is skipped, the rest still show.
- Anyone but the super admin changing the homepage.

## Approaches considered

- **A. A sections list in the database (chosen by the owner).** A
  `homepage_sections` table, one row per section with its kind, position,
  on/off and (for announcements) image, description, link and dates. Settings
  shows the list. New kinds are new rows.
- B. One saved block (JSON) on `site_settings` holding order and
  announcements. Less work now; harder to validate and to grow.
- C. Fixed slots ("announcement above / below events"). Quickest, but no real
  reordering, which is what the owner asked for.

## What the owner decided

- Approach A.
- Image announcement: image uploaded in Settings; clickable optionally; the
  link is either **a page on our site** or **an outside web address**.
- Automatic hiding after an end date ("a nice touch, include it").

## Proposals made in conversation, not objected to (builder: treat as decided)

- **Internal link = pick from a list**, not typed: the site's public pages
  (Home, About, Members, Events, Jobs, News, Contact) plus any **published
  member's profile** (by name). Stored as a path (e.g. `/events`,
  `/members/mars-brewing-co`).
- **External link opens in a new tab** (`target="_blank" rel="noopener
  noreferrer"`). Must start with `https://` or `http://`.
- **Description required** (alt text for screen readers; also the link's
  accessible name when clickable).
- **Optional start date** as well as end date. Dates are whole days in
  Pacific time (America/Los_Angeles): shown from the start of the start date
  through the end of the end date. Outside its dates an announcement stays in
  the Settings list labeled **Scheduled** or **Ended**.
- **One image, never cropped**: shown at its natural shape, full content
  width, shrinking on phones.
- **GABF spotlight** becomes one section in the list. It shows only when it's
  on **and** `CURRENT_SPOTLIGHT` has content (as today).

## The design

### Data

New table `public.homepage_sections`:

- `id uuid` primary key
- `kind text` — `events`, `spotlight`, `image` (check constraint)
- `position int not null` — order on the page, smallest first
- `enabled boolean not null default true`
- Image announcement fields (null for other kinds; check that `image`
  rows have `image_path` and `alt_text`):
  - `image_path text` — in the public `site-images` bucket, folder
    `announcements/` (JPEG/PNG, 10 MB limit, as the bucket already enforces)
  - `alt_text text`
  - `link_kind text` — `none`, `internal`, `external`
  - `link_target text` — a site path (`internal`) or full URL (`external`)
  - `starts_on date`, `ends_on date` (both optional; `ends_on >= starts_on`)
- `created_at`, `updated_at`, `updated_by_user_id`

Exactly one `events` row and one `spotlight` row exist (seeded by the
migration); they can be moved and switched but not deleted. The migration
seeds: spotlight at position 1 with `enabled` copied from
`site_settings.spotlight_enabled`, events at position 2 — i.e. today's page,
unchanged. `site_settings.spotlight_enabled` is then no longer read (left in
place; the old Settings card goes away).

RLS: super admin reads and writes; no one else. The public homepage reads
through the server with the service role (as the carousel dwell time and the
spotlight switch do today), and returns only what a visitor needs.

### Who can change it

Only the super admin, as with the other Settings cards
(`requireSuperAdmin`, then RLS again). Uploads go through the session client
so the bucket's own super-admin policy applies. Image validation and EXIF
stripping reuse the hero upload's (`validateUploadedImage`,
`stripImageMetadata`).

### Settings: "Homepage sections" card

Replaces the "Homepage spotlight" card. A list in page order:

```
Homepage sections                         (hero image is always first)
 ▲▼  [on]  Holiday parties — image        Showing · until Dec 20   Edit  Delete
 ▲▼  [on]  Events carousel
 ▲▼  [on]  GABF 2026 spotlight
 [ + Add image announcement ]
```

- ▲▼ move a row one place; saves immediately.
- The switch saves immediately.
- Each image row shows a small thumbnail, its description, and a status:
  **Showing**, **Scheduled (from Dec 1)**, **Ended (Dec 20)**, or **Off**.
- **Add / Edit** opens a form: image (upload or replace, with preview),
  description, link (None / A page on our site / An outside website; the
  page picker or the address box appears accordingly), start date, end date.
  Saving validates everything; errors say what to fix.
- **Delete** asks to confirm, then removes the row and its image file.
- The spotlight row shows "No spotlight content right now" when
  `CURRENT_SPOTLIGHT` is null.

### The homepage

- Renders the hero, then the sections in `position` order, skipping any that
  are off, outside their dates (Pacific "today"), or (spotlight) without
  content.
- The `#coming-up` anchor stays on the events section wherever it sits, so
  the hero's "Upcoming events" button still works.
- An image announcement renders inside the same content width and spacing as
  the other sections; with a link, the whole image is the link.
- Link checks happen when saving **and** when rendering: an internal path
  must be one of the allowed pages or `/members/<slug>` of a currently
  published member — otherwise the image shows without a link. (A member
  unpublished after the announcement was made must not leave a dead link.)

### Errors

- Reading the sections fails → the homepage falls back to today's default
  (spotlight if `CURRENT_SPOTLIGHT`, then events), and logs the error.
- A section row with bad data → skipped, logged; the rest render.
- Upload/save failures show a plain message on the card; nothing half-saved
  (a newly uploaded file is removed if the save fails, as the hero does).

### Settled during the builder check (my calls)

- **No page caching to worry about:** the homepage renders per request (the
  loader calls the server each time; the router's preload stale time is 0;
  no cache rule in either wrangler config). The Pacific "today" check in the
  server read is enough for the date window.
- **The old spotlight switch during the rollout:** staging and live share the
  database, and live keeps reading `site_settings.spotlight_enabled` until the
  merge to `main`. So until then the new Settings switch for the spotlight
  row also writes `spotlight_enabled` (a mirror), and the owner is told not to
  use the old live Settings card in that window. The mirror is removed in a
  follow-up after the merge.
- **Delete:** removes the row and its image file. **Replace image:** the old
  file is removed only after the save succeeds.
- **Moving:** swap two rows' positions in one database call.
- **Page picker:** lists only public pages that exist as routes.
- **No separate draft state:** "Off" is the draft; an enabled announcement with
  no dates shows as soon as it's saved.

## Docs to update

- `docs/member-profiles.md`, "Homepage" (Spotlight and the new sections).
- No Member Guide change: this is a super admin screen, not a member one.

## Left to the builder

- Exact component structure, the move/position update mechanism (e.g. swap
  positions in one RPC), and form layout, within the portal's existing
  Settings card style.
- How the member picker loads published members (it can reuse an existing
  roster/directory read).
- Test design. Must cover at least: date window edges in Pacific time,
  link validation (allowed page, unpublished member, bad URL scheme), order
  and on/off on the rendered page, the read-failure fallback, and that a
  Guild admin who isn't super admin can't change anything.
