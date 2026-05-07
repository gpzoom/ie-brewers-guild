## Overview

Build a multi-page marketing site inspired by labrewersguild.org — a regional craft brewers guild. Same vibe and structure (bold hero photo, dark overlay, three-pillar mission, featured event, clean nav), but with our own branding, colors, and freshly generated imagery. You can rebrand it for any city later — I'll use a generic "Craft Brewers Guild" placeholder name you can rename in one pass.

## Pages (separate TanStack routes)

- `/` Home — full-bleed hero photo with mission statement, three pillars (Advocacy, Education, Events), featured event callout, footer CTA
- `/about` — guild mission, history, board/leadership section, advocacy detail
- `/members` — grid of member breweries (cards with logo placeholder, name, neighborhood, link)
- `/events` — list of upcoming events with date/location/description, featured event banner
- `/news` — article list (title, date, excerpt, read-more)
- `/contact` — contact form (name, email, subject, message), social links, general inquiries email

Shared `Header` (logo + nav + social icons) and `Footer` (sitemap, social, newsletter signup) used across all routes via `__root.tsx`.

## Design direction (inspired-by, not clone)

- **Mood**: bold, community-driven, slightly industrial — fits craft beer
- **Palette**: warm amber/copper primary (beer-inspired) with deep charcoal background and cream text — distinct from the original's white-on-photo look
- **Typography**: condensed bold display font for headings (e.g. Oswald/Bebas vibe via Google Fonts), clean sans for body
- **Components**: shadcn Button, Card, Input, Textarea, Sonner for toasts
- All colors as semantic tokens in `src/styles.css` (oklch), no hardcoded hex in components

## Imagery (AI-generated)

Generated with `imagegen` and saved to `src/assets/`:
1. Home hero — crowd of brewers/community in front of a brewery (16:9, standard quality)
2. About hero — interior of a craft brewery, fermentation tanks
3. Advocacy card — capitol building / civic imagery
4. Education card — brewing class / hops close-up
5. Events card — beer festival crowd with glasses
6. Featured event banner — outdoor beer fest at golden hour
7. Member brewery placeholder logos — 6 generic brewery logo marks

Form factor: hero images 16:9, cards ~3:2, logos square with transparent background.

## Functionality

- Contact form: client-side validation, toast confirmation (no backend wired yet — can add Lovable Cloud + email later if you want)
- Newsletter signup in footer: same pattern (toast on submit)
- Member/event/news data: typed arrays in `src/data/` — easy to edit, no DB needed
- All navigation via TanStack `<Link>`, full SSR-friendly per-route `head()` with unique title/description/og tags

## Out of scope (ask if you want any of these)

- Real backend / CMS for news/events
- Real working contact form delivery (needs Lovable Cloud + email service)
- Authentication / member login portal
- E-commerce / merch / ticket sales
- Embedded map of breweries

## Technical notes

- Routes added under `src/routes/` using flat naming (`about.tsx`, `members.tsx`, etc.)
- `__root.tsx` extended with `<Header />` and `<Footer />` around `<Outlet />`
- Data files: `src/data/members.ts`, `src/data/events.ts`, `src/data/news.ts`
- Components: `src/components/site/Header.tsx`, `Footer.tsx`, `Hero.tsx`, `PillarCard.tsx`, `EventCard.tsx`, `MemberCard.tsx`, `NewsCard.tsx`
- Replace placeholder `src/routes/index.tsx` content entirely
- Update root `head()` with site-wide defaults; each route overrides title/description
