# ADA / Accessibility Audit — IE Brewers Guild Website

**Audit date:** June 23, 2026
**Standard applied:** WCAG 2.1 Level AA (the benchmark U.S. courts use for ADA Title III web accessibility)
**Scope:** All public pages — Home, About, Members, Events, News, Contact — plus the shared Header, Footer, and page components. (The `/survey` questionnaire is an internal, non-indexed tool and is noted separately at the end.)

---

## Executive summary

The site is in **good shape overall**. Color contrast is strong, every page has a proper heading structure, images carry alt text, the contact form is correctly labeled, and the members modal is built on an accessible component.

There are **no contrast failures** — often the hardest thing to fix. The issues below are mostly small, well-defined corrections. None require a redesign.

**Priority ranking of what to fix:**

| # | Issue | Severity | WCAG |
|---|-------|----------|------|
| 1 | Newsletter email field has no label | High | 1.3.1, 3.3.2, 4.1.2 |
| 2 | Non-functional placeholder links (`href="#"`) | High | 2.4.4, 4.1.2 |
| 3 | No "skip to content" link | High | 2.4.1 |
| 4 | Mobile menu button missing `aria-expanded`/`aria-controls` | Medium | 4.1.2 |
| 5 | Links that open new tabs give no warning | Medium | 3.2.5, 2.4.4 |
| 6 | Decorative icons not hidden from screen readers | Medium | 1.1.1, 4.1.2 |
| 7 | Focus outline is very thin (1px) | Low | 2.4.7 |
| 8 | Animations don't honor "reduce motion" setting | Low | 2.3.3 |

---

## What's already correct (no action needed)

- **Color contrast — passes comfortably.** Measured ratios against the dark background:
  - Body text (cream on charcoal): **16.75:1** (AAA)
  - Muted/secondary text: **7.57:1** (AAA)
  - Copper primary accent & links: **7.22:1** (AAA)
  - Buttons (dark text on copper): **7.22:1** (AAA)
  - All exceed the 4.5:1 AA minimum for normal text and 3:1 for large text.
- **Page language** is declared (`<html lang="en">`).
- **Heading structure** is clean — exactly one `<h1>` per page (via `PageHero`), then `<h2>`/`<h3>` in logical order. No skipped levels.
- **Images have appropriate alt text** — member logos (`"{name} logo"`), event/pillar images, and the logo. Decorative hero background images correctly use `alt=""` so screen readers skip them.
- **Contact form** uses proper `<label htmlFor>` paired with each input.
- **Members address modal** is built on the Radix/shadcn `Dialog`, which provides focus trapping, Escape-to-close, and correct ARIA roles automatically.
- **Icon-only social links** in the header/footer have `aria-label`s.
- **The Untappd SVG icon** correctly sets `aria-hidden="true"` — use it as the model for the icon fix in #6.
- **The map has a text alternative** — the full member list with cities and addresses appears below the map, so the experience does not depend on the interactive map alone.

---

## Findings & recommended corrections

### 1. Newsletter email field has no label — **High**
**Where:** `src/components/site/Footer.tsx` (newsletter form, ~line 53)
**WCAG:** 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions, 4.1.2 Name, Role, Value

The newsletter email input has only a `placeholder` ("you@example.com"). Placeholder text is **not** a label — it disappears on typing and is not reliably announced by screen readers. A screen-reader user reaches an unlabeled text box.

**Fix** — add an accessible label. Since the design has no visible label, use a visually-hidden one (or `aria-label`):

```tsx
<label htmlFor="newsletter-email" className="sr-only">Email address</label>
<Input
  id="newsletter-email"
  type="email"
  required
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="you@example.com"
  className="bg-background"
/>
```
(`sr-only` is a standard Tailwind utility that hides the label visually but keeps it for assistive tech.)

---

### 2. Non-functional placeholder links — **High**
**Where:**
- `src/components/site/Footer.tsx` line 34 — Twitter link `href="#"`
- `src/routes/news.tsx` line 36 — every "Read story" link is `href="#"`

**WCAG:** 2.4.4 Link Purpose, 4.1.2 Name, Role, Value

Links pointing to `#` go nowhere — they jump to the top of the page and mislead all users, but especially keyboard and screen-reader users who land on a "link" that does nothing. The "Read story" links currently make the news headlines look clickable when no article exists.

**Fix — choose per link:**
- **Twitter:** either point it at the real profile URL, or remove the icon entirely if the guild has no Twitter/X account. (It is the only social icon without a real destination.)
- **"Read story":** until article pages exist, remove the link, or point it to a real destination. If individual news articles are planned, wire these to those routes. Do not ship `href="#"`.

---

### 3. No "skip to content" link — **High**
**Where:** `src/routes/__root.tsx` (the layout wrapping `<Header />` and `<main>`)
**WCAG:** 2.4.1 Bypass Blocks

A keyboard user must tab through the entire header/navigation on every page before reaching the main content. A "skip to main content" link — the first focusable element, visible only when focused — is the standard remedy.

**Fix** — add a skip link and a target id on `<main>`:

```tsx
<body>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
  >
    Skip to main content
  </a>
  {/* ...Header... */}
  <main id="main-content" className="flex-1">
    <Outlet />
  </main>
```

---

### 4. Mobile menu button missing state info — **Medium**
**Where:** `src/components/site/Header.tsx` line 43 (hamburger button)
**WCAG:** 4.1.2 Name, Role, Value

The button has a good `aria-label`, but a screen reader can't tell whether the menu is open or closed, or what it controls.

**Fix:**

```tsx
<button
  aria-label="Toggle menu"
  aria-expanded={open}
  aria-controls="mobile-nav"
  className="md:hidden rounded-md p-2 text-foreground/80 hover:text-primary"
  onClick={() => setOpen((v) => !v)}
>
```
…and add `id="mobile-nav"` to the dropdown `<div>` that renders when `open` is true (line 53).

---

### 5. Links that open a new tab give no warning — **Medium**
**Where:** All `target="_blank"` links — social icons (Header/Footer), member "Visit" links and social icons (`members.tsx`), map InfoWindow links (`MembersMap.tsx`), "Get tickets" (`events.tsx`)
**WCAG:** 3.2.5 Change on Request, 2.4.4 Link Purpose

Opening a new tab without warning is disorienting for screen-reader and cognitive-disability users (the Back button suddenly does nothing).

**Fix** — append visually-hidden text to each new-tab link, e.g.:

```tsx
<a href={m.website} target="_blank" rel="noreferrer" ...>
  Visit <ExternalLink className="h-4 w-4" aria-hidden="true" />
  <span className="sr-only">(opens in a new tab)</span>
</a>
```
Security note: `rel="noreferrer"` already implies `noopener`, so the existing links are safe — this is purely about announcing the new tab.

---

### 6. Decorative icons are not hidden from screen readers — **Medium**
**Where:** Throughout — the `lucide-react` icons (ArrowRight, Calendar, MapPin, Mail, Phone, Instagram, Facebook, ExternalLink, Navigation, Menu, X, Beer, etc.)
**WCAG:** 1.1.1 Non-text Content, 4.1.2

`lucide-react` icons do **not** add `aria-hidden` automatically. When an icon sits next to visible text (e.g. "Learn more →", "Saturday, May 30"), the icon adds no information and can produce noise or confusing output for screen readers. When an icon is the *only* content of a labeled link, the inner SVG can be double-announced.

**Fix** — add `aria-hidden="true"` to every decorative icon. (Your `UntappdIcon` already does this correctly.) Example:

```tsx
<ArrowRight className="h-4 w-4" aria-hidden="true" />
<Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
```
This is mechanical but applies in many spots; a find-and-add pass across the route/component files covers it.

---

### 7. Focus outline is very thin — **Low**
**Where:** `src/components/ui/button.tsx` (`focus-visible:ring-1`), and header nav links rely on the default browser outline.
**WCAG:** 2.4.7 Focus Visible (met, but weakly)

A 1px focus ring is technically present but hard to see, especially on the copper-on-dark theme. The members page buttons already use a clearer `focus-visible:ring-2` — consider standardizing on that.

**Fix** — bump the button ring to `ring-2` and ensure header `<Link>`s get an explicit `focus-visible:ring-2 focus-visible:ring-ring` so keyboard focus is obvious everywhere. Not a failure, but a meaningful usability win for keyboard users.

---

### 8. Animations ignore the "reduce motion" preference — **Low**
**Where:** Card hover transforms (`hover:-translate-y-1`, `group-hover:scale-105`) on Home and Members.
**WCAG:** 2.3.3 Animation from Interactions (AAA — best practice)

Users who set "reduce motion" in their OS still get the scale/translate animations.

**Fix** — add a global rule in `src/styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Additional notes (not strict failures)

- **Contact details as plain text.** The email and phone on the Contact page are not clickable (`mailto:` / `tel:`). Linking them helps everyone, including users of assistive tech and mobile devices. Usability improvement, not an ADA failure.
- **Google Map keyboard access.** The interactive map relies on Google's JS API. Google's markers are reachable by keyboard, and you provide a full text list below — so the map is supplementary, which is the right approach. No change required.
- **Forms are demonstration-only.** The contact and newsletter forms show a success toast but don't actually send. Not an accessibility matter, but worth knowing for launch.
- **`/survey` questionnaire** (`src/components/Questionnaire.jsx`): an internal, `noindex` discovery tool not linked in navigation. It is outside the public-site audit scope. If it ever becomes user-facing, audit its form fields for labels (same standard as #1) before linking it.

---

## Suggested order of work

1. **Quick wins (an hour or two):** #1 newsletter label, #2 dead links, #3 skip link, #4 menu button attributes.
2. **Mechanical pass:** #6 `aria-hidden` on icons, #5 new-tab warnings.
3. **Polish:** #7 thicker focus ring, #8 reduced-motion rule.

After changes, re-test with: a keyboard only (Tab/Shift+Tab/Enter/Esc), a screen reader (VoiceOver on Mac, NVList/NVDA on Windows), and an automated checker such as the **axe DevTools** or **WAVE** browser extension on each page.
