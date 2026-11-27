# Community Events carousel (short design)

Owner, 2026-11-27. Builds on docs/superpowers/specs/2026-11-14-homepage-sections-design.md.

## Intent

The homepage block that holds the Holiday Party graphic becomes the **Community Events carousel**: several
event graphics, one at a time, with left/right arrows, looping, flipping at the calendar's speed. The calendar
block is renamed **Member Events carousel**. In Settings, "Edit announcement" becomes "Edit community event".

## Decisions

- Owner: every image announcement becomes a community event (no standalone image blocks).
- Owner: same timing as the calendar (`site_settings` dwell seconds). Database change approved 2026-11-27.
- Proposals the owner accepted (2026-11-27): pause like the calendar (Pause button, hover, keyboard focus),
  swipe on phones, dots underneath, sized to the tallest graphic, no arrows or flipping with one event,
  hidden with none. Each event keeps its own link, show/stop dates and on/off switch.

## Approaches

1. **Reuse the image rows as events, add one `community` row for the block's place** (chosen). No data moves;
   the Holiday Party row becomes the first event. Events keep their order by `position` among image rows.
2. A new `community_events` table. Cleaner names, but copies data and rewrites the gallery's "in use" checks
   for no gain to the owner.

## Design

- Migration: allow `kind = 'community'` (one only, never deleted); insert it where the first image row sits
  (positions doubled to make room), or last if there are none. New `move_homepage_section_in_group` swaps only
  with a neighbor of the same group (events among events, blocks among blocks); the old function stays for the
  live site until this ships.
- `visibleSections`: image rows no longer render on their own; the `community` row renders a carousel of the
  image rows that are on, in their date window and have an image. No events, no block. If the `community` row
  is missing, the carousel takes the first event's place.
- `CommunityEventsCarousel`: all slides stacked in one grid cell (so it is as tall as the tallest), the shown one
  faded in, the rest `inert`. Arrows, Pause/Play, dots, swipe, ←/→ keys; pauses on hover and keyboard focus.
- Settings: the community row lists its events (switch, ▲▼, Edit, Delete) and "Add a community event". Labels:
  "Member Events carousel", "Community Events carousel", "Add a community event" / "Edit community event",
  "Community event images".

## Live site between db push and launch

The live code skips the `community` row on the homepage (unknown kind), so the live homepage is unchanged. Live
Settings shows it as a plain "Image" row with a switch. Shared database: events added from staging Settings
show on the live homepage as standalone images until this ships.
