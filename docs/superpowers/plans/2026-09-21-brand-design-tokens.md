# Brand Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current, unapproved Oswald/Inter + charcoal-copper token set with the approved Brand system — Bricolage Grotesque + Chivo, and the full oklch color palette — as a single token file, so every new member-profile component (and the existing site) reads brand values from one place.

**Architecture:** Wholesale rewrite of `src/styles.css` (the spec explicitly says the current stylesheet is replaced, not patched) plus one font-link line in `src/routes/__root.tsx`. The new file keeps the existing shadcn-style aliases (`--primary`, `--card`, `--border`, etc.) that every current component already depends on, but redefines them in terms of the new brand tokens — so the whole existing site (Home, About, Contact, Members, Events, News) picks up the new look with zero component-file changes. It also exposes the spec's own token names (`--brand`, `--canvas`, `--ink`, etc.) directly as Tailwind utilities, since the spec refers to those names verbatim and new member-profile components should use them, not the shadcn aliases.

**Tech Stack:** Tailwind CSS v4 (`@theme inline`), CSS custom properties, oklch color space — all already the project's existing pattern in `src/styles.css`.

**Spec:** `docs/member-profiles.md`, "Brand system" section (typefaces, colour tokens, radii). The "Editing the brand from the admin" subsection — an admin screen that overrides these tokens at runtime — is Guild Admin scope, a later plan; this plan only builds the static default token set that screen will eventually edit.

## Global Constraints

- Bricolage Grotesque (700, 800) for display/headings, Chivo (400, 500, 600) for body/UI — both from Google Fonts, one `css2` link. (Spec, "Typefaces".)
- Two ambers, never interchanged: `--brand` carries white/light text, `--brand-bright` carries dark text. Never white text on `--brand-bright`. (Spec, "Colour tokens".)
- Keep the 8px radius base. (Spec: "Keep the staging site's 8px base.")
- Don't port anything out of the current stylesheet's `:root`/`.dark` values — it has a known heading-weight bug and is being replaced wholesale, not patched. (Spec, "Typefaces".)
- Text must clear 4.5:1 contrast (3:1 above 24px) — this plan inherits values the spec already verified against this bar; don't hand-adjust any of the listed hex/oklch values.

## Decisions made while filling gaps the spec left open

1. **The existing shadcn-style token aliases (`--background`, `--primary`, `--card`, `--border`, etc.) are kept and redefined, not deleted.** The spec only specifies the new brand token names; it doesn't mention the current site's existing components (Header, Footer, Members page, etc.), which are out of scope for this build but must not visually break. Redefining the aliases in terms of the new brand tokens means every existing `bg-primary`/`text-foreground`/etc. class keeps working and automatically picks up the correct new colors, with no per-component edits.
2. **`--primary` maps to `--brand-bright` with `--primary-foreground` mapped to `--ink`** (dark text), not `--brand`. This preserves the existing pairing (a bright fill with dark text) that was already correct in intent — the current file's own comment notes its accent already needed a dark foreground for contrast, which is exactly the defect the spec's two-amber split fixes.
3. **The forced-uppercase heading style (`text-transform: uppercase` on `h1`–`h4`) is kept as-is.** The spec's "Brand system" section only covers typefaces, colour, and radii — it says nothing about text-transform, and changing it would be a visual design decision for the existing site beyond what this plan is scoped to make.
4. **Radii add two new named tokens** (`--radius-inset: 0.75rem` for 12px inset blocks, `--radius-card: 1.125rem` for the 16–22px card range) alongside the existing `--radius` (8px) derivation chain, plus `--radius-pill: 999px`. The spec names these categories but the current file only has one radius scale; this fills that in without changing the existing 8px base.
5. **Member theme colors (the 8-theme picker table) are deliberately NOT included here.** That table lives under "Profile hero and theme," not "Brand system," and its picker UI belongs to the Member Admin phase (artboard K) — it'll be added there as its own small constants module, not mixed into the Guild's own site-chrome tokens.

---

### Task 1: Rewrite `src/styles.css` with the new token set

**Files:**
- Modify: `src/styles.css` (full rewrite)

**Interfaces:**
- Produces: every CSS custom property new member-profile components will reference — `--bg`, `--surface`, `--surface-2`, `--border-dark`, `--text`, `--text-muted`, `--canvas`, `--canvas-2`, `--canvas-border`, `--ink`, `--ink-muted`, `--brand`, `--brand-bright`, `--open`, `--warn`, `--danger` — plus their Tailwind utility equivalents (`bg-brand`, `text-ink`, `bg-canvas`, etc.) and the existing shadcn aliases, now redefined.

- [ ] **Step 1: Replace the full file contents**

Replace all of `src/styles.css` with:

```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-inset: 0.75rem;
  --radius-card: 1.125rem;
  --radius-pill: 999px;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-surface: var(--surface);
  --color-surface-foreground: var(--surface-foreground);
  /* Brand system tokens, exposed directly under their spec names (e.g.
     "never white on --brand-bright") for new member-profile components,
     alongside the shadcn aliases above that the existing site already
     uses. */
  --color-bg: var(--bg);
  --color-surface-2: var(--surface-2);
  --color-border-dark: var(--border-dark);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-canvas: var(--canvas);
  --color-canvas-2: var(--canvas-2);
  --color-canvas-border: var(--canvas-border);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-brand: var(--brand);
  --color-brand-bright: var(--brand-bright);
  --color-open: var(--open);
  --color-warn: var(--warn);
  --color-danger: var(--danger);
  --font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --font-sans: "Chivo", system-ui, -apple-system, sans-serif;
  --shadow-glow: 0 10px 40px -10px color-mix(in oklab, var(--brand-bright) 45%, transparent);
}

:root {
  --radius: 0.5rem;

  /* Brand system tokens (spec, "Colour tokens"). Two grounds: dark site
     chrome, light profile card. */
  --bg: oklch(0.17 0.012 60);
  --surface: oklch(0.21 0.014 60);
  --surface-2: oklch(0.25 0.014 60);
  --border-dark: oklch(0.31 0.015 60);
  --text: oklch(0.96 0.012 80);
  --text-muted: oklch(0.74 0.018 70);
  --canvas: oklch(0.97 0.008 80);
  --canvas-2: oklch(0.94 0.01 80);
  --canvas-border: oklch(0.88 0.012 80);
  --ink: oklch(0.22 0.012 60);
  --ink-muted: oklch(0.46 0.012 70);
  --brand: oklch(0.58 0.15 50);
  --brand-bright: oklch(0.72 0.165 55);
  --open: oklch(0.62 0.15 145);
  --warn: oklch(0.68 0.13 75);
  --danger: oklch(0.55 0.17 27);

  /* shadcn-style aliases, redefined in terms of the brand tokens above so
     every existing component keeps working with no per-component edits.
     --primary/--primary-foreground keep the "bright fill, dark text"
     pairing -- that's exactly the contrast rule --brand-bright exists to
     satisfy, never the reverse. */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface-2);
  --popover-foreground: var(--text);
  --primary: var(--brand-bright);
  --primary-foreground: var(--ink);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text);
  --muted: var(--surface-2);
  --muted-foreground: var(--text-muted);
  --accent: var(--brand);
  --accent-foreground: var(--text);
  --destructive: var(--danger);
  --destructive-foreground: var(--text);
  --border: var(--border-dark);
  --input: var(--border-dark);
  --ring: var(--brand-bright);

  --surface-foreground: var(--text);

  --sidebar: var(--card);
  --sidebar-foreground: var(--card-foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--accent-foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
}

.dark {
  /* Same palette -- site is dark by default, unchanged from before. */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface-2);
  --popover-foreground: var(--text);
  --primary: var(--brand-bright);
  --primary-foreground: var(--ink);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text);
  --muted: var(--surface-2);
  --muted-foreground: var(--text-muted);
  --accent: var(--brand);
  --accent-foreground: var(--text);
  --destructive: var(--danger);
  --destructive-foreground: var(--text);
  --border: var(--border-dark);
  --input: var(--border-dark);
  --ring: var(--brand-bright);
}

@layer base {
  * { border-color: var(--color-border); }
  html, body { background-color: var(--color-background); color: var(--color-foreground); }
  body { font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4, .font-display {
    font-family: var(--font-display);
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: replace brand tokens with the approved Bricolage/Chivo + oklch palette"
```

---

### Task 2: Swap the Google Fonts link

**Files:**
- Modify: `src/routes/__root.tsx:96`

**Interfaces:**
- Consumes: nothing new. Produces: the actual font files the `--font-display`/`--font-sans` tokens from Task 1 name.

- [ ] **Step 1: Replace the font stylesheet link**

In `src/routes/__root.tsx`, find:

```tsx
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" },
```

Replace with:

```tsx
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap" },
```

The two `preconnect` links above it (`fonts.googleapis.com`, `fonts.gstatic.com`) stay exactly as they are — same Google Fonts CDN, no change needed.

- [ ] **Step 2: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: load Bricolage Grotesque and Chivo instead of Oswald and Inter"
```

---

### Task 3: Verify the swap against the running site

**Files:** none created or modified.

**Interfaces:** none — this is a manual/browser verification pass confirming Tasks 1–2 didn't break the existing site.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: starts on `http://localhost:8080/` with no build errors in the terminal.

- [ ] **Step 2: Load the homepage in a browser and inspect computed fonts**

Using the Playwright browser tool: navigate to `http://localhost:8080/`, then evaluate:

```js
() => {
  const h1 = document.querySelector("h1");
  const body = document.body;
  return {
    h1Font: h1 ? getComputedStyle(h1).fontFamily : null,
    bodyFont: getComputedStyle(body).fontFamily,
  };
}
```

Expected: `h1Font` starts with `"Bricolage Grotesque"`, `bodyFont` starts with `"Chivo"`. If either still shows the old font, the Google Fonts request may not have finished loading yet before the evaluate call ran, or the stylesheet link swap in Task 2 didn't save — re-check before moving on.

- [ ] **Step 3: Confirm a `bg-primary` element still has readable, dark text**

Find a primary-styled button (e.g. a call-to-action on the homepage) with the browser tool's accessibility snapshot, then evaluate its computed `color` and `background-color`:

```js
() => {
  const btn = document.querySelector("button, a.inline-flex"); // adjust selector to an actual primary button found in the snapshot
  const style = getComputedStyle(btn);
  return { color: style.color, backgroundColor: style.backgroundColor };
}
```

Expected: the background resolves to the brand-bright oklch value and the text color resolves to the dark ink value — confirming `--primary-foreground` is the dark `--ink`, not white, satisfying the spec's "never white on `--brand-bright`" rule.

- [ ] **Step 4: Take a full-page screenshot of the homepage and the Members page for a visual sanity check**

Navigate to `http://localhost:8080/` and `http://localhost:8080/members`, taking a screenshot of each. Confirm by eye: dark chrome background, warm amber accents (not the old brighter copper), readable text everywhere, no unstyled/broken elements, nothing rendering as plain black-on-white (which would indicate the token rewrite broke a variable reference).

- [ ] **Step 5: Stop the dev server**

No commit for this task — it's a verification pass, not a code change. If any step doesn't match, fix Task 1 or Task 2 before starting the next plan.
