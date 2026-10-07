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
| V `VendorProfile` | Affiliate Member profile (phone) | same |
| L `DesktopProfile` | Profile, desktop | same |
| O `ContactForm` | Contact & membership inquiry | `routes/contact.tsx` |
| T `SignIn` | Member sign in | `routes/signin.tsx` |
| T2 `AuthConfirm` | Finish signing in: where the email link lands (works in any browser; only the button signs in) | `routes/auth.confirm.tsx` |
| T3 `SignInEmail` | The sign-in email: a link and a 6-digit code (Supabase templates, `docs/auth-email-templates.md`) | Supabase dashboard |
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
| S `GuildCategories` | Guild: categories (Affiliate / Mobile tabs; Delete: super admin only) | `routes/guild.categories.tsx` → `guild/CategoriesEditor` |
| U `GuildAdmins` | Guild admins (super admin only) | `routes/guild.admins.tsx` → `guild/GuildAdminsScreen` |
| W `GuildAudit` | Audit log (super admin only) | `routes/guild.audit.tsx` → `guild/AuditLogScreen` |
| M2 `AdminFood` | Food: the food calendar and 7-day preview (producers only) | `routes/admin.food.tsx`, portal section `food` → `admin/FoodCalendarSection` |
| X `SupportHelp` | Help button: bug report or feature request (every portal, /admin and Guild screen) | `support/SupportButton`, mounted in `routes/__root.tsx` |
| Y `GuildHelp` | Help messages, with the top bar's bell (super admin only) | `routes/guild.help.tsx` → `guild/HelpMessagesScreen`; bell in `guild/GuildShell` |
| Z `GuildSettings` | Settings: calendar sync timing, homepage carousel dwell time, homepage hero image (super admin only) | `routes/guild.settings.tsx` → `guild/SiteSettingsScreen` |
| A `HomeEvents` | Homepage: "Coming up at our members" carousel (desktop) | `routes/index.tsx` → `home/MemberEventsCarousel` |
| A2 `HomeEventsPhone` | The same, on a phone | same |
| A3 `HomeEventsStates` | Calendar page states, the pinned Guild event, nothing coming up | same |
| B1 `MembersV2Desktop` | Members page v2, desktop: list beside the map, one card per location (owner chose B2, built 2026-10-05) | `routes/members.tsx` → `site/members-v2/*` (the Members page since 2026-10-05) |
| B2 `MembersV2DesktopB` | The same, one card per member with its locations inside (alternative to B1) | same |
| B3 `MembersV2Phone` · B4 `MembersV2PhoneFilters` · B5 `MembersV2PhoneMap` | Members page v2 on a phone: list, Filters panel, map view | same |
| B6 `MembersV2States` | Members page v2 card states: food truck's stop today, Affiliate Member, Near me, no results | same |
| GV1 `GuildVendorFood` | Events page: "Guild members at your taproom": Show right away / Ask me first, and Hide/Show, Approve/Decline (producers; the Food page lists Guild food vendors with the same buttons). Built 2026-10-07 | `admin/GuestStopsBox` in `routes/admin.events.tsx` and `portal/PortalSectionView`; `admin/FoodCalendarSection` |
| GV2 `GuildVendorEmails` | The taproom's emails (new, approve?, changed, canceled) and the `/visit` page behind their buttons. Built 2026-10-07 | `lib/events/guest-stop-email.ts`, `guest-stop-notices.server.ts`; `routes/visit.$token.tsx` → `site/VisitLinkPage` |
| GV3 `GuildVendorProfiles` | The taproom's profile (guest stops in Upcoming events and Food this week) and the Mobile member's own stops linking to the taproom. Built 2026-10-07 | `profile/EventsModule`, `profile/FoodCalendarModule`; `lib/events/guest-display.ts`, `guest-info.ts` |
| GV4 `GuildVendorHomepage` | Homepage card: a Guild member's stop as the taproom's event, "with a Guild member". Built 2026-10-07 | `home/MemberEventsCarousel`; `lib/home/member-events.ts` |

Screens with no artboard (e.g. `/admin/discount`) follow the same shell and design language.

### The two newest screens

Artboards U and W were drawn from the built screens (2026-09-27) and added to the live canvas the same day.

- **Guild admins** (`/guild/admins`, super admin only): the Guild shell with the page heading and lede of the inquiries screen; one white table card listing every Guild admin (email, a "Super admin" and a "You" pill, date added, last sign-in, **Remove access**) followed by pending invites ("Invited" pill, expiry line, **Resend** and **Cancel invite**); under it an "Invite a Guild admin" card with an email field and **Send invite**. Removing asks first in the same dialog style as Delete member.
- **Audit log** (`/guild/audit`, super admin only): heading and lede, then a white filter card (Member, Person, From, To, **Show**, **Clear**), then one white list card, newest first: the time (Pacific) in small muted text, the person's email in semibold, ", editing as [member]" in muted text when the change was made through Edit as them, and a one-line description under it. Read only.

## Decisions made after the canvas (owner, 2026-09-25)

- Guild admin uses the artboard's own shell (dark top bar + left sidebar). The earlier strip of Guild links under the public header is removed.
- Basics and hours are one page, "Basics & hours", as in artboard F.
- Features added since the canvas (roster Invite/Delete, Preview button, sign-in email change while impersonating, cover Remove/Reset) keep working; they're styled in this design language.

## Decisions made after the canvas (owner, 2026-09-26 and 2026-09-27)

- **Photos:** the member section is called "Photos" (no video uploads yet). Its order is Your Gallery, then **Your Carousel** (was "Your slides"), then Cover photo, with larger, bold, dark section labels. The slide's tap-through link sits under the crop controls.
- **Full member menus (2026-09-27):** the member-editor artboards (F, G, M, M2, R, K) now draw the whole side menu in the portal's order — Basics & hours, Logo & cover, Photos, Events, Food (producers), Links & contact, Discount & supplies (Affiliate Members), Theme, People (owner) — with a note on who sees what; the phone artboard (I) shows the full tab strip. Before, they showed a shortened menu.
- **Labels and photos (2026-09-27):** the member's menu item is **Food** (was Food trucks), the profile's "Coming up" is **Upcoming events**. All-day entries read "All day". (Vendor photos from the calendar were added and then removed the same day: too cumbersome for members.)
- **Food calendar (2026-09-27):** producers can connect a second calendar, with its own link and tag, for the food trucks and pop-ups at their taproom. The profile shows **Food this week** above "Coming up": seven days, today first, each listing its vendors (name, time, description) or saying "Bring your own food", or "Closed" when the posted hours say so. Every event date column now shows the **month** under the day. It has its own menu item, **Food** (producers only), after Events: artboard M2 `AdminFood` (the food calendar box and its 7-day preview); M's menu shows it. On the profile it starts collapsed: today, then a "Next 6 days ▾" button (or "Next food truck: Fri, …" when today has none). Artboards D (the food block, collapsed) and E (months) and the onboarding map were updated.
- **Calendar sync (2026-09-27):** events come in when the sync tag is in their **title or description**; the profile shows the title without the tag, the event's description (three lines, then More; web addresses in it are links) and its location. Events deleted from the calendar, or untagged, come off. The Events screen's hint says so, and its status line no longer promises "every 15 minutes" (the super admin sets that now). A new super admin **Settings** screen (artboard Z, in the Super admin menu) sets how often calendars re-sync. Artboards M, E (an event with its description) and Q/U/W/Y (menu) and the onboarding map were updated.
- **Help button (2026-09-27):** a **Help** tab on the right edge of every portal, `/admin` and Guild screen opens a short form: Problem/bug or Feature request, first name, email (filled in), and a description. The profile comes from the session and is shown as "About: [business]". It goes to the site owner, and "Thanks, we got it" shows on screen. The tab is on the edge so it never covers the pinned Publish or Continue bars. Artboard X was added to the live canvas and here. The super admin's top bar gets a **bell** with the number of Help messages waiting; it opens **Help messages** (artboard Y, also in the Super admin menu), where each message can be answered by email and marked done. The footer's **Member sign in** link was also removed the same day; **Member Portal** is the only sign-in link.
- **Links & contact (2026-09-27):** "Link pills" are called **Link buttons**. Mobile members can add booking links, **Instagram DM** (typed as @name) and **WhatsApp** (typed as a phone number), shown on the profile as "Message on Instagram" and "WhatsApp"; their Booking phone on Basics says more booking links go on Links & contact. An Affiliate Member's location is their **Business address** (not "Warehouse"), and **Typical lead time** is gone. The redeem example reads "Call us and confirm you're a Guild Member in good standing", and the cover photo hint suggests using your Facebook cover photo. Artboards R, G, I, E, V and the onboarding map were updated on the live canvases and here.
- **Camera roll hint (2026-09-28):** under the gallery upload box (G, and wizard step 7), an info box points members to the original in their phone's camera roll instead of a posted copy, then to a creator upload link (and, for the owner, inviting a Photos & events editor). Always shown; a hint, not an import-from-post feature.
- **Homepage (2026-09-28):** the placeholder pillars and the Featured Event section are replaced by **Coming up at our members** (A desktop, A2 phone, A3 states): member events over the next 14 days as tear-off calendar pages (theme-color strip with logo, big date, time, title, place, three lines of description) on the member's blurred cover photo, round-robin between members, with Previous / Pause / Next, a timer bar and an Up next list. A Guild event is pinned first as a wider card with its poster and Get tickets. The hero is half its old height and its image is uploaded by the super admin (Z: Homepage hero image; Z also gains the carousel's dwell time). The Events page and menu item are gone; `/events` redirects to the carousel.
- **Watch how video (2026-09-30):** the events calendar box (M, and wizard step 6) gains a **Watch how to connect a Google Calendar for EVENTS (2:53)** link under its heading. It opens the how-to video, hosted on livid.com, in a dark pop-up over the page; closing it stops the video. The food calendar box (M2) has its own, **…for FOOD VENDORS (1:52)** (added the same day, after its video was made). Artboards M and M2 were updated on the live canvas and here.
- **One calendar for events and food (2026-09-30):** the Food page (M2) now suggests the Events page's calendar link with its own tag (#food); a separate calendar is still fine. M2's connection line and the onboarding map's step 6 card say so. Tags now match only as whole tags and are saved with their "#".
- **Food for the next week (2026-09-30):** the profile's food block is renamed and shows all seven days at once (no more "Next 6 days" / "Next food truck" button). On desktop it sits under the photo carousel, where the left column had empty space; on a phone it stays between the hours and Upcoming events. Artboard D was updated on the live canvas and here.
- **Remove calendar and the Food page's video link (2026-09-30):** the connected calendar card's Edit link now includes **Remove calendar** (with a confirm box), in place of the artboard's never-built Disconnect button (M). The Food page (M2) shows "If your Events calendar isn't set up yet, watch this video first:" with the events Watch how link. Both updated on the live canvas and here.
- **Computer-only setup note (2026-10-01):** every calendar box (M, M2, and a Mobile member's "Where we'll be") shows an orange-bordered note, with a computer icon, until a link is saved and while Edit link is open: the iCal link is set up once, on a computer, because Google's phone app never shows it; events can be added on either. Artboards M and M2 updated on the live canvas and here.
- **Publish names the empty links (2026-10-01):** publishing with a link that has no address now says which ones and where to fix them ("These links have no web address: Instagram. Open Links & contact and add each address, or remove those links, then publish again.").
- **Footer newsletter removed (2026-10-01):** the footer's Newsletter box said "Subscribed!" but saved nothing, so it is gone until the Guild has a real list. The footer is now the Guild blurb and social icons, plus Explore.
- **Categories:** one Categories page with **Affiliate categories** and **Mobile categories** tabs. Mobile members pick theirs ("What you offer") on Basics & hours.
- **Super admin** (docs/member-profiles.md, "Super admin"): a separate super admin account. Its top bar reads **ISC Brewers Guild · Super admin**; a Guild admin's still reads "Guild admin". The sidebar gains a second group, **Super admin**, holding Brand & theme (moved out of the Guild group), **Guild admins** and **Audit log**; a Guild admin doesn't see the group at all. Guild admins also don't see the roster's **Delete member…** or Trail switch, or **Delete** on Categories, and the sign-in email shows read-only while they edit as a member. The Guild artboards (N, P, Q, S), the Photos artboard (G) and the member admin menus ("Photos") were updated on the live canvas and in `artboards/` on 2026-09-27, and U and W were added. Later that day Q, U and W gained the super admin's bell and the Help messages menu item (see Help button).
- **Setup wizard redesign (2026-10-02):** designed first on the onboarding canvas (hi-fi artboards `onboarding/wizard/`), then built. Steps: Welcome, Confirm type, The basics, **Logo, Photos & Cover** (one page with a live preview; the old Photos step and the separate portal/admin Photos pages merged into it), hours, Events (+ Food with the **We have our own kitchen** switch, "Kitchen open"), Links, Discount (Affiliate), **Pick your theme**. Back on every screen after Welcome; a large colored member-type tag on every screen. The portal and /admin menus say "Logo, Photos & Cover".

