# Screen designs

The visual reference for every screen in this app. **Before building or changing any screen, open its artboard here and match it.** (The written spec, `docs/member-profiles.md`, still wins where the two disagree on *behavior*; the artboards win on *look and layout*.)

- Live canvas (owner's claude.ai design canvas): https://claude.ai/artifact/9YttpbrWTxgAkc145whpGf
- Snapshot of every artboard's source: [`artboards/`](artboards/) — plain HTML with inline styles, readable as-is (the `support.js` runtime they reference isn't needed to read them).
- Canvas index (titles, sizes): [`canvas.json`](canvas.json)
- **Onboarding wizard & member portal** screen map (lo-fi structure, not a visual reference): [`onboarding/`](onboarding/README.md)

Placeholders like `[MEMBER NAME]` in the artboards are stand-ins for real data. Artboards still say "IE Brewers Guild"; the organization is now **ISC Brewers Guild** (Inland Southern California Brewers Guild) — use the current name.

## Design language

| Role | Value | Tailwind token |
|---|---|---|
| Page ground | `#F9F6F0` | `canvas` |
| Panels, info boxes | `#EFEAE1` | `canvas-2` |
| Cards, inputs | `#FFFFFF` | — (`bg-white`) |
| Borders | `#DED7CB` (inputs/cards), `#EFEAE1` (dividers) | `canvas-border` |
| Text | `#241F1A` | `ink` |
| Secondary text | `#6B6156` | `ink-muted` |
| Tertiary text, group labels | `#8C8275` | `ink-subtle` |
| Accent / primary button | `#B3591F` (hover `#8F4517`) | `brand` / `brand-hover` |
| Admin top bar | `#171410` | `bg` |

- **Fonts:** Bricolage Grotesque 700/800 for headings (sentence case in the admin, e.g. "Basics & hours"), Chivo 400/500/600 for everything else.
- **Admin shell (member and Guild):** 64px near-black top bar (small uppercase label "ISC BREWERS GUILD · MEMBER ADMIN" / "· GUILD ADMIN"; right side: member name, **Preview** outline button, **Publish changes** accent button — member admin only). Below it a 236px left sidebar: 10px uppercase letterspaced group label ("YOUR PROFILE" / "GUILD"), 44px nav items, the active item a dark `#241F1A` pill with light text. Content: 30px × 36px padding, 27–28px Bricolage heading with a 13px muted subtitle.
- **Sections:** 10px uppercase letterspaced labels (`letter-spacing: 0.15em`, weight 600, `#6B6156`).
- **Controls:** inputs 46px tall, 9px radius, 1px `#DED7CB` border, white; buttons 44–46px; cards 12–14px radius on white with a 1px border; info boxes `#EFEAE1` with an ⓘ icon.
- **Footer bar** on editing pages: "Changes save as you type. Publishing needs one more step." + **Publish changes**.
- Touch targets ≥ 44px everywhere.

## Artboard → code

| Artboard | Screen | Route / main component |
|---|---|---|
| D `TaproomProfile` | Producer profile (phone) | `routes/members_.$slug.tsx` → `profile/MemberProfileTemplate` |
| E `MobileProfile` | Mobile member profile (phone) | same |
| V `VendorProfile` | Allied Member profile (phone) | same |
| L `DesktopProfile` | Profile, desktop | same |
| O `ContactForm` | Contact & membership inquiry | `routes/contact.tsx` |
| T `SignIn` | Member sign in | `routes/signin.tsx` |
| F `AdminBasics` | Basics & hours (one page) | `routes/admin.basics.tsx` → `admin/BasicsForm`, `admin/HoursEditor` |
| G `AdminMedia` | Photos & video | `routes/admin.media.tsx` → `admin/*` media editors |
| H `AdminPublish` | Publish gate dialog | `admin/PublishGateDialog` |
| I `AdminPhone` | Member admin on a phone | `admin/AdminShell` (responsive) |
| J `CreatorUpload` | Creator upload link page | `routes/send.$token.tsx` |
| K `AdminTheme` | Member theme picker | `routes/admin.theme.tsx` → `admin/ThemePicker` |
| M `AdminEvents` | Events & calendar | `routes/admin.events.tsx` |
| R `AdminLinks` | Links & contact | `routes/admin.links.tsx` → `admin/LinksContactEditor` |
| N `GuildApprovals` | Guild: inquiries | `routes/guild.inquiries.tsx` |
| P `GuildMembers` | Guild: members & impersonation | `routes/guild.roster.tsx` → `guild/RosterTable` |
| Q `GuildBrand` | Guild: brand & theme | `routes/guild.brand.tsx` → `guild/BrandEditor` |
| S `GuildCategories` | Guild: categories | `routes/guild.categories.tsx` |

Screens with no artboard (e.g. `/admin/discount`) follow the same shell and design language.

## Decisions made after the canvas (owner, 2026-09-25)

- Guild admin uses the artboard's own shell (dark top bar + left sidebar). The earlier strip of Guild links under the public header is removed.
- Basics and hours are one page, "Basics & hours", as in artboard F.
- Features added since the canvas (roster Invite/Delete, Preview button, sign-in email change while impersonating, cover Remove/Reset) keep working; they're styled in this design language.
