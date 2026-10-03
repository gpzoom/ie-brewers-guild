---
name: ISC Brewers Guild — member how-to videos
colors:
  background: "#171410"   # site --bg oklch(0.17 0.012 60), src/styles.css
  surface: "#211C17"      # site --surface oklch(0.21 0.014 60)
  surface-2: "#2A241E"    # site --surface-2 oklch(0.25 0.014 60)
  border: "#3A332C"       # site --border-dark
  foreground: "#F7F3EC"   # site --text oklch(0.96 0.012 80)
  muted: "#B6AC9D"        # site --text-muted oklch(0.74 0.018 70)
  accent: "#E8913A"       # site --brand-bright oklch(0.72 0.165 55): the public site's primary
  accent-deep: "#B3591F"  # site --brand oklch(0.58 0.15 50)
  paper: "#FBF8F2"        # calendar page paper (MemberEventsCarousel PAPER) and admin canvas
  canvas-2: "#EFEAE1"     # admin --canvas-2
  canvas-border: "#DED7CB"
  ink: "#241F1A"          # site --ink
  ink-muted: "#6B6156"    # site --ink-muted
  good: "#4E9A4A"         # sync status dot
  bad: "#8C2F1B"          # rescheduled badge ink, used for "hidden" states
typography:
  display: { family: "Bricolage Grotesque", weights: [700, 800], file: assets/fonts/BricolageGrotesque-latin.woff2, note: "site --font-display; public headings are UPPERCASE 800" }
  body: { family: "Chivo", weights: [400, 500, 600, 700], file: assets/fonts/Chivo-latin.woff2, note: "site --font-sans" }
  mono: { family: "ui-monospace, Consolas, monospace", note: "only for the iCal link and #guild" }
spacing:
  edge: 120px
  gutter: 64px
radii:
  card: 20px
  ui: 12px
  page: 8px
---

## Overview

A friendly, practical how-to in the Guild site's own clothes: the dark, warm
public site with its amber accent. Screens from the member's side (the portal,
the profile, the homepage) are shown as they really look: real screenshots, or
rebuilt exactly from the site's own components. Google Calendar is drawn as a
simplified, clearly labeled sketch in the Guild's paper-and-ink admin style,
never as a copy of Google's screens.

## The frame

- Dark warm field (#171410) with one soft amber radial glow; no full-screen linear gradients.
- Headlines: Bricolage Grotesque 800, uppercase like the public site, 88–112px.
- Supporting lines: Chivo 400–500, 34–40px, muted.
- UI panels: paper (#FBF8F2) cards, 12px radius, ink text, amber focus rings (4px) on the thing to look at.
- The hero prop is the tear-off calendar page (paper, theme-color strip, big date). It opens the film and returns in frame 9.
- "Step N of 3" chip, top-left, in frames 3–7.
- Captions sit in the bottom 17%; nothing important goes there.

## Do

- One focal thing per frame, ringed in amber.
- Real wording from the site, verbatim.
- Short on-screen text; the voice carries the explanation.

## Don't

- No gradient text, no neon, no purple, no stock-photo look.
- No fake Google UI: simplified sketch, labeled "simplified".
- No slideshow (every beat a new static card) and no screensaver motion (drift that says nothing).
