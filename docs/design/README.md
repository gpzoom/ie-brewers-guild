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
| G `AdminMedia` | Photos (was "Photos & video") | `routes/admin.media.tsx` → `admin/*` media editors |
| H `AdminPublish` | Publish gate dialog | `admin/PublishGateDialog` |
| I `AdminPhone` | Member admin on a phone | `admin/AdminShell` (responsive) |
| J `CreatorUpload` | Creator upload link page | `routes/send.$token.tsx` |
| K `AdminTheme` | Member theme picker | `routes/admin.theme.tsx` → `admin/ThemePicker` |
| M `AdminEvents` | Events & calendar | `routes/admin.events.tsx` |
| R `AdminLinks` | Links & contact | `routes/admin.links.tsx` → `admin/LinksContactEditor` |
| N `GuildApprovals` | Guild: inquiries | `routes/guild.inquiries.tsx` |
| P `GuildMembers` | Guild: members & impersonation (Delete member and the Trail switch: super admin only) | `routes/guild.roster.tsx` → `guild/RosterTable` |
| Q `GuildBrand` | Brand & theme (super admin only) | `routes/guild.brand.tsx` → `guild/BrandEditor` |
| S `GuildCategories` | Guild: categories (Allied / Mobile tabs; Delete: super admin only) | `routes/guild.categories.tsx` → `guild/CategoriesEditor` |
| — (no artboard) | Guild admins (super admin only) | `routes/guild.admins.tsx` → `guild/GuildAdminsScreen` |
| — (no artboard) | Audit log (super admin only) | `routes/guild.audit.tsx` → `guild/AuditLogScreen` |

Screens with no artboard (e.g. `/admin/discount`) follow the same shell and design language.

### Screens without an artboard yet

- **Guild admins** (`/guild/admins`, super admin only): the Guild shell with the page heading and lede of the inquiries screen; one white table card listing every Guild admin (email, a "Super admin" and a "You" pill, date added, last sign-in, **Remove access**) followed by pending invites ("Invited" pill, expiry line, **Resend** and **Cancel invite**); under it an "Invite a Guild admin" card with an email field and **Send invite**. Removing asks first in the same dialog style as Delete member.
- **Audit log** (`/guild/audit`, super admin only): heading and lede, then a white filter card (Member, Person, From, To, **Show**, **Clear**), then one white list card, newest first: the time (Pacific) in small muted text, the person's email in semibold, ", editing as [member]" in muted text when the change was made through Edit as them, and a one-line description under it. Read only.

## Decisions made after the canvas (owner, 2026-09-25)

- Guild admin uses the artboard's own shell (dark top bar + left sidebar). The earlier strip of Guild links under the public header is removed.
- Basics and hours are one page, "Basics & hours", as in artboard F.
- Features added since the canvas (roster Invite/Delete, Preview button, sign-in email change while impersonating, cover Remove/Reset) keep working; they're styled in this design language.

## Decisions made after the canvas (owner, 2026-09-26 and 2026-09-27)

- **Photos:** the member section is called "Photos" (no video uploads yet). Its order is Your Gallery, then **Your Carousel** (was "Your slides"), then Cover photo, with larger, bold, dark section labels. The slide's tap-through link sits under the crop controls.
- **Categories:** one Categories page with **Allied categories** and **Mobile categories** tabs. Mobile members pick theirs ("What you offer") on Basics & hours.
- **Super admin** (docs/member-profiles.md, "Super admin"): a separate super admin account. Its top bar reads **ISC Brewers Guild · Super admin**; a Guild admin's still reads "Guild admin". The sidebar gains a second group, **Super admin**, holding Brand & theme (moved out of the Guild group), **Guild admins** and **Audit log**; a Guild admin doesn't see the group at all. Guild admins also don't see the roster's **Delete member…** or Trail switch, or **Delete** on Categories, and the sign-in email shows read-only while they edit as a member. The Guild artboard snapshots in `artboards/` were updated to match; the live canvas still shows the older sidebar.
