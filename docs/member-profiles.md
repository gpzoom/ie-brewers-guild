# Member Profile Build Spec

IE Brewers Guild · as of 21 September 2026 · Bob Lelle

## Scope

This covers the public member profile page and the member-facing admin panel that fills it. It is the written form of the decisions settled on the design canvas — the canvas shows what it looks like, this says what must be true when it is built.

The canvas has eighteen artboards, all current — nothing on it is superseded. **Public:** D taproom, E mobile, V Allied Member, L desktop, O contact and membership inquiry, T member sign in. **Member admin:** F basics and hours, G media and crop, H publish gate, I phone, K member theme, M events, R links and contact. **Creator upload:** J. **Guild admin:** N inquiries, P members and impersonation, Q brand and theme, S supply categories.

Those are the visual reference. Where this document and an artboard disagree, this document wins.

Out of scope: the existing Members page itself — the map and card grid already exist and are not being rebuilt, only the links that open a profile page from them — the Guild's own marketing pages, an onboarding wizard for a member's first sign-in, and anything to do with taking payment, which happens off the site.

## Member types

There is one profile template with a member type flag, not three templates. The flag drives which modules render and what the primary action says. Build it that way from the start — forking the template per type is the failure mode.

|  | Producer | Mobile | Allied Member |
| --- | --- | --- | --- |
| Who | Brewery, meadery, cidery, distillery with a taproom | Entertainment, food truck, pop-up | Supply house, ingredients, equipment, services |
| Status line | Open now / closed, with closing time | Next appearance, with date | Open now / closed, with closing time |
| Second line | Tonight's event or pour | Venue and city | Service area and typical lead time |
| Primary action | Directions | Book us | Request a quote |
| Schedule module | Seven-day hour chips | Upcoming appearance list | Five-day business hour chips |
| Category chips | — | — | What they supply |
| Events module | Yes — "Coming up" | Yes — "Where we'll be", and it replaces hours | Yes — "Coming up" |
| Discount block | — | — | Yes, prominent |
| Location field | Street address | Service area | Warehouse address |
| Contact | Phone | Phone (booking) | Phone (sales) and email |
| Third link pill | Tap list | Press kit | Catalog |
| On the Guild Trail | Yes | No | No |
| Trail progress strip | Yes | No | No |
| Cross-link card | Next on the trail | Playing nearby | Another Allied Member |

Changing a member's type must not delete data from the modules that type doesn't render. A producer who switches to mobile and back should find their hours intact.

## Media model

**Store the original upload and the crop rectangle. Never store only the cropped output.** This is the single most important line in this document.

4:5 is a display decision, and display decisions change. If the slot is ever re-cut — a wider crop for a desktop layout, a 1.91:1 version for link previews and OG images, a square thumbnail for the directory index — a flattened 4:5 file cannot be re-derived, and the only recovery is asking every member to re-upload and re-crop. That migration will not happen; the photos will just look wrong forever. Keeping the original plus a crop rectangle makes any future ratio a rendering change.

Per slide, persist:

- the original file, untouched, at the resolution uploaded
- the crop rectangle as fractions of the original's width and height, not pixels, so it survives a resize
- the source: uploaded file, or a social post URL
- the outbound link, when there is one (the post the slide taps through to)
- sort order within the carousel

Derived renditions are a cache. Generate them on demand or at save time, but treat them as disposable and regenerable from the original plus the rectangle.

### The slot

One ratio per profile, 4:5 portrait, the same for every slide in the carousel. Do not offer portrait, landscape and square as member choices: mixed ratios in one carousel either change the page height mid-swipe or letterbox into grey bars, and they make every profile a different height so the directory stops reading as one site. The member's source photo can be any shape; the cropper reconciles it.

Call it "Portrait" everywhere a member can see it. "4:5" appears once, as small grey supporting text.

Maximum four slides. A profile with one slide renders without carousel dots rather than showing a single dot.

### Where media comes from

No URL fetching, no scraping, no platform APIs. The file comes from whoever made it.

Each member has a media gallery holding original files. A carousel slide is a reference to a gallery item plus a crop rectangle plus an optional outbound link, not a file of its own. The same original can appear in more than one place without being uploaded twice.

Files enter the gallery two ways:

1. The member uploads a file they already have.
2. The member generates a **creator upload link** and sends it to whoever shot the content — by text, DM, however they already talk. The creator opens the link, adds the file and their name, and it arrives in the member's gallery. Artboard J is that page.

The outbound link on a slide is a plain text field the member types. Pasting a post URL there makes the slide tap through to the post — no fetching involved, and it is optional.

### The creator upload link

This is not only a convenience. It is where permission gets captured. A videographer who shot a brewery's Reel owns that footage, and the brewery putting it on their profile without asking is a real exposure. Uploading through the link is an explicit, timestamped grant.

The link is a token, no account needed, and carries:

- an expiry, seven days by default
- a cap on how many files it accepts, five by default
- revocation by the member at any time
- no read access to anything else in the member's account

The creator supplies their name or handle, chooses whether to be credited on the profile, and must tick a permission statement before the send button enables.

Uploads land in a pending tray, never straight into the gallery and never onto a live profile. The member reviews and approves. An open upload endpoint attracts junk, and a member finding something unexpected published under their name once would be enough to lose them.

Store with each asset: uploader (member or creator token), creator name, credit preference, permission acceptance with its timestamp, and the original filename. When the creator asked for credit, their name renders in small type on the slide.

Rate-limit per token, cap file size, validate real file signatures, and scan uploads. This endpoint is reachable by anyone holding a link.

## Hours and the publish gate

Stale hours are the failure mode that makes a directory worthless, so the confirmation is a timestamp, not a boolean. The checkbox is only how the timestamp gets set.

Persist `hours_confirmed_at` as a datetime on the member. Set it to now whenever the member ticks the confirmation box and publishes. A boolean records nothing useful — what matters is how long ago.

Gate **publish**, not save. Field edits save as the member types; publishing is what requires the tick. Blocking save behind a validation checkbox is how half-finished profiles get abandoned.

The dialog shows the hours back to the member as a read-only list before asking them to confirm. A checkbox with nothing to check against is theater, and members will tick it blind.

Once `hours_confirmed_at` is more than 90 days old:

- the admin's left rail shows a stale-hours notice
- the public profile shows a quiet "Hours confirmed \[Month Year\]" line beside the schedule heading
- the member gets a one-click confirmation email — the link itself sets the timestamp, no login, no form

The public staleness line should be discreet. It is a signal to the visitor, not a scolding of the member.

Mobile members have no weekly hours, so the gate for them is the appearance calendar: warn on publish if every listed appearance is in the past.

## Logos and assets

PNG or SVG only, transparent background, minimum 400px tall. Reject JPGs at upload with a message that says why, rather than accepting and looking bad. Validate the actual file signature, not the extension.

**Always place a member logo on a light chip**, never directly on a dark surface. A transparent PNG of a dark-ink mark disappears against the dark guild chrome, and a large share of craft logos are exactly that. The cross-link card at the bottom of every profile is the place this bites — it is a dark card carrying another member's logo. An ivory rounded chip behind it costs nothing and removes the whole class of problem. The alternative, asking members for a light variant, is one more thing to chase and will be inconsistently supplied.

**Serve member SVGs through an `<img>` tag, never inlined into the page.** A member-uploaded SVG can carry script, event handlers and external references. Inlining it executes that in the page's origin. If inline rendering is ever needed for CSS colouring, sanitize server-side first and treat that as a separate decision with its own review.

Strip EXIF from uploaded photos. Phone photos carry GPS coordinates, and a member's home address can end up in a file served from the Guild's site.

## The Guild Trail

**The Trail is deferred and nothing in this build implements it.** It is described here so the hooks in the data model make sense and so it can be switched on later without a rewrite. No progress strip, no visited count and no visitor data appear anywhere on the current screens.

Two mechanisms that look alike and must not be conflated.

**The Trail (the passport)** is the collectible: visited state, the progress strip, the "8 of 24 visited" count. Producers with taprooms only. A supply house is not a trail stop and neither is a band.

**Cross-linking** is the card at the bottom of every profile, and every member gets one regardless of type. A profile that ends in a dead end wastes the exit. Producers point at the next trail stop, mobile members at another act playing nearby, Allied Members at another Allied Member.

Because the Guild takes meaderies, cideries and distilleries, no member-facing copy should say "brewery." The producer cross-link card reads "Next on the trail," not "Next brewery." If the Guild has its own name for the trail concept, that name replaces this one throughout — worth settling before copy gets written twice.

Allied Member cross-links point to another Allied Member. Pointing one at a producer they supply is more interesting, but needs a supplier relationship in the data model that does not exist yet. Revisit if that relationship ever lands.

## Allied Member discount

Allied Member profiles carry a discount block, set by the member in their admin panel. It renders large and in the accent colour, directly under the status block and above the supply categories — deliberately the loudest thing on the page after the business name.

This is the most concrete answer the site has to "what does Guild membership get me," so it earns the prominence.

The member sets:

- a discount percentage, or a "no fixed percentage" checkbox
- their own wording for how members redeem it

With a percentage, the block reads `[XX]% off` over "for members in good standing." With the checkbox ticked, it reads "Discounts available to members in good standing" at the same visual weight. The redemption line sits underneath in both cases.

The field only appears for the Allied Member type. A member who switches type keeps the values; they just stop rendering.

The block uses `--brand`, the deeper amber, because it carries white text. Never build it on `--brand-bright`.

## Profile hero and theme

The profile opens with a cover band, the logo chip overlapping its lower edge, the name and badge alongside, and a one-line tagline in the member's own words. The tagline is the highest-value field on the page: it is the only place the member actually speaks, and it costs one text input. Cap it at 70 characters so it can't turn into a paragraph.

The cover is a third aspect ratio, 2.5:1 on phone. Same storage rule as the carousel — original file plus crop rectangle, never a flattened file, since a wider desktop cover and a link-preview image will both want different crops of it.

### Theme picker

Members pick one of eight themes. It colours the primary button, small highlights, the trail progress strip, and the cover band when they have no cover photo.

Member themes and the Guild brand are separate systems. The Guild brand sets the site's own type and colour — the dark frame, the chrome, the admin. A member theme colours what sits inside that frame on their own page. Changing the Guild brand does not change anyone's member theme, and a member cannot change the Guild's.

| Theme | Hex |
| --- | --- |
| Amber (default) | `#B45309` |
| Rust | `#9A3412` |
| Garnet | `#9B2242` |
| Plum | `#6B2D6B` |
| Indigo | `#3B4B9A` |
| Teal | `#17605F` |
| Forest | `#2F6B33` |
| Olive | `#55621C` |

A fixed set, not a colour picker. A free picker guarantees contrast failures and a directory that looks like a ransom note; eight pre-checked options give real variety with no way to break it. Every value here clears 4.5:1 against white text — re-verify if any are swapped.

The Guild's dark frame never changes. The theme colours what sits inside it, so the directory still reads as one site.

A member with no cover photo gets their theme colour filling the band. That is the difference between a thin profile looking deliberate and looking unfinished, and most members will be thin profiles.

## Events

**Every member type can list events**, not just mobile members. A taproom runs trivia nights and release parties; a supply house runs open houses and workshops; a band plays gigs. One module, one table, one admin screen, on every profile.

What differs is the relationship to the schedule module. For a producer or Allied Member, events sit alongside weekly hours — "we're open these hours, and these things are happening." For a mobile member, events *are* the schedule; there are no hours at all.

The heading differs to match: "Coming up" for producers and Allied Members, "Where we'll be" for mobile members, since a mobile member's event is somewhere else and a taproom's is at home. That is a label, not a different component.

An event's venue fields are nullable. Null means the event is at the member's own address, which is the normal case for a producer or Allied Member — don't make them retype their own name as the venue.

Events come from a connected calendar, not hand entry. Hand entry is the fallback for members with no calendar. These are two different integrations: Google is OAuth against the Calendar API and reflects edits within seconds; Apple has no equivalent, so it is an ICS subscription URL the member pastes in, which is read-only and lags behind their actual calendar by however long Apple takes to regenerate the published feed — often tens of minutes, sometimes longer. A scheduled refresh every fifteen minutes fixes our staleness but cannot beat the feed, so the admin also carries a manual **Refresh now** button.

The status overlays are the real escape hatch: when a gig moves and the feed has not caught up, the member sets Rescheduled in the admin and the profile is correct immediately.

On top of each synced event the member can set a status overlay:

| Status | On the profile |
| --- | --- |
| (none) | Normal row |
| Postponed | Badge, original date struck through, no new date |
| Rescheduled | Badge, new date and time shown |
| Canceled | Row muted, badge, details struck through |

The overlay is the member's, stored against the calendar event id — not written back to their calendar, and not lost when the calendar re-syncs. A re-sync must reconcile by event id and preserve the overlay.

A canceled event stays visible rather than disappearing. Someone who saw it on the calendar needs to learn it is off, and a silently vanished row teaches them nothing.

A mobile member's "Next appearance" block skips anything postponed or canceled and shows the next live one. On a producer or Allied Member profile the same data feeds the "Tonight—" line inside the status block, so there is no separate free-text field for it: today's event is the one source of truth.

Sync is tag-based opt-in: only events matching the member's chosen tag are imported. Most members' calendars contain private entries, and pulling everything would publish them.

## Layout and breakpoints

Mobile-first, genuinely: the phone layout is the design and the wide layout is the adaptation. Build the single column first and let it widen.

On a phone the page is one column at 390px: dark guild bar, light profile card, status block, media carousel, schedule, link pills, contact, cross-link card. Artboard L is the desktop resolution of the same page, and it settles the decisions the one-line description left open. Content is capped at 1120px and centred, so the card never stretches across a wide monitor. The cover spans the full card width and gets a wider crop, 4:1 rather than 2.5:1, from the same original. The logo chip grows to 104px and still overlaps the cover's lower edge; name, location, tagline and the Save and Share buttons sit in one row beneath it, full width. Below that the page splits: the media carousel holds a fixed 420px column on the left, still 4:5, and the status block, week chips, link pills and contact stack in the wider column beside it. The cross-link card spans the full width under the card. The dark guild bar gains real directory navigation, since a desktop visitor arrived with more intent than a thumb-scroller.

The dark chrome holds the edges and the light card owns the middle, so the member's own brand sits on a neutral ground and does not fight the Guild's.

The admin panel ships with phone and desktop layouts together, not desktop first. Members are small-business owners and many will edit their profile from a phone. On a phone the left rail becomes a horizontal tab strip, the member type radios stack full width, the hours rows put the two time fields side by side with the Closed control on its own line, and Publish pins to the bottom of the screen. Artboard I shows it.

Non-negotiables carried over from the artboards:

- 44px minimum on every tap target, including the schedule day chips
- real `<button>`, `<a href>` and `<input>` with `<label>` — no clickable divs
- `aria-label` on every icon-only control
- text at 4.5:1 contrast, 3:1 above 24px; the grey caption text and any white-on-colour fill are where this usually fails
- no fake status bar or device chrome
- phone number as `tel:`, email as `mailto:`, address linking out to maps

Colour and type come from the Brand system section. The artboards are drawn on those tokens, so a hex in an artboard should match a token — if it doesn't, the token wins.

## Migrating the existing members

Every member currently on the Members page is imported and **published**, even with nothing filled in beyond name, city and logo. The directory stays complete from day one; profiles fill in as members sign in.

That decision makes the empty-state table load-bearing on launch day rather than an edge case. Most profiles will be name, logo, map pin and nothing else, and every one of them has to look deliberate. Re-read that section before building the profile page, not after.

What the import does per member:

- `status` = `published`, `member_type` best-guessed from the current page and corrected by the Guild admin afterwards
- `slug` from the business name, lowercased, non-alphanumerics collapsed to hyphens, a numeric suffix on collision. Once issued a slug never changes, or shared links break
- `latitude` / `longitude` carried across from the existing map pins — don't re-geocode, the pins are already right
- `theme` = the default, `hours_confirmed_at` = null, no `member_users` row yet

**A null `hours_confirmed_at` means "never set", not "stale".** An imported member with no hours shows no schedule block at all — the status block falls back to "Hours not listed" with the phone number as its action, per the empty states. It must not show a stale-hours warning, which would blame a member for something they were never asked to do. The 90-day nudge only applies once a member has confirmed hours at least once; members with no hours get a different, gentler prompt.

Imported members are unclaimed until invited. The roster needs that state alongside "invited, not signed in" — a member nobody has written to yet is a different job from one who was written to and hasn't acted.

An onboarding wizard for a member's first sign-in is the obvious next thing to build and is out of scope here. Worth knowing it is coming: don't make the admin's first screen assume a filled-in profile.

## Accounts, sign-in and joining

Supabase Auth, magic link only. No passwords — these are small-business owners who will not remember one, and a reset flow is another screen to build and support.

### One sign-in, in the footer

A single **Member sign in** link in the site footer, and a real `/signin` route so it can go in emails. Not in the header: two dozen members against thousands of visitors, and a Sign In button in the header of a public directory tells every visitor they ought to have an account.

**The magic link routes by role, not by URL.** One form for everyone; where you land is decided by the account. A member lands in `/admin` on their own profile, a Guild admin in `/guild`. No separate admin login to find, nothing extra to lock down, and no way to probe which addresses are admins. A second admin login is strictly more attack surface for strictly less convenience.

### Joining, for now

The site does not take payment and does not take applications yet. The contact form (artboard O) collects name, email, phone, a message, and one checkbox — *I want to learn more about becoming a member*. That flag is all that separates a membership lead from a general question.

A Guild rep follows up off the site, and when someone joins, the Guild admin creates the member from the roster and sends the invite. The member signs in and gets a draft profile they publish themselves.

### Joining, later

An applied / approved / declined queue is coming, run on the site by an admin or a manager. **Build for it now:** the `status` column already carries `applied` and `declined`, the Guild admin nav already has an Applications item marked SOON, and `dues_received_at`, `approved_at` and `approved_by_user_id` already exist on `members`. Turning it on should be a screen and a route, not a migration.

### Roles

Two admin surfaces. The **member admin** (F, G, I, K, M) edits one member's own profile. The **Guild admin** (N inquiries, P members) runs the Guild. A Guild admin is not automatically a member editor — put the platform role on the account, a `profiles` row keyed to `auth.users` carrying `is_guild_admin`, rather than overloading `member_users`.

Seed the first Guild admin account against **boblelle77@gmail.com** — there has to be one admin before anyone can be invited, and it cannot be created through the UI because the UI requires an admin.

### Editing as a member

From the roster, **Edit as them** opens that member's admin in an impersonation session. Four rules, all load-bearing:

- The session records both the real admin and the member being edited. **Every write is logged against the real actor**, never the member.
- A band sits on every admin screen and every preview for the duration, and **cannot be dismissed**. An admin must never be able to forget whose profile they are typing into.
- Impersonation **cannot change the member's email or sign-in settings**. That is the line between an impersonation feature and an account-takeover feature.
- Stopping returns to the roster, and the session ends on sign-out and on a short idle timeout.

### Transactional email

Resend, called from a Worker. Supabase Auth sends the magic link; everything else is ours:

| Trigger | To | Content |
| --- | --- | --- |
| Contact form submitted | the sender | "Thank you for reaching out. We have received your submission." Plus, when the membership box is ticked, a line saying a Guild representative will be in touch to discuss membership. |
| Contact form submitted | the Guild | The inquiry, flagged if it is a membership lead |
| Member invited | the new member | Welcome and a sign-in link |
| Hours stale past 90 days | the member | One-click confirmation — the link itself sets the timestamp, no login |
| Creator uploads to a gallery | the member | Something is waiting for review |

Send from **`mail.iscbrewersguild.org`**, verified in Resend with its SPF, DKIM and DMARC records in place before the first send. A workers.dev sender puts half of this mail in spam.

The contact form is a public endpoint that writes rows and sends mail, so it needs a rate limit per IP and a honeypot field at minimum.

## Brand system

The staging site's type and colour were chosen without a brief. This replaces them, and the replacement is **approved**. Everything here lives as tokens in one file so it can be changed in one place.

### Typefaces

| Role | Face | Weights |
| --- | --- | --- |
| Display | Bricolage Grotesque | 700, 800 |
| Body and UI | Chivo | 400, 500, 600 |

Both are on Google Fonts and load from one `css2` link. Bricolage carries headings, member names and the big status line; Chivo carries everything else.

What this replaces and why: Oswald is competent but it is the house face of craft beer generally — it makes the Guild look like every brewery rather than the body that represents them. Inter is the weak link: the default UI typeface of the last decade, faultlessly legible and completely without character, which sits badly under "independent craft". Bricolage has real personality at display sizes without being a novelty, and Chivo is a warm, refined grotesque that holds up at 13px on a dark ground.

The Guild's wordmark stays whatever the logo artwork is — that is an asset, not a font choice.

The staging CSS has a bug — it loads Oswald at 500/600/700 but every heading computes to weight 400. It is not being fixed: that stylesheet is replaced wholesale by the tokens here, so don't port anything out of it.

### Colour tokens

Two grounds. The site chrome is dark; the profile card is a light canvas, so a member's logo and photos sit on neutral ground instead of fighting the Guild's brown.

| Token | oklch | approx hex | Use |
| --- | --- | --- | --- |
| `--bg` | `oklch(17% .012 60)` | `#171410` | page ground, site chrome |
| `--surface` | `oklch(21% .014 60)` | `#221E18` | raised dark panels |
| `--surface-2` | `oklch(25% .014 60)` | `#2B261F` | cards on dark |
| `--border-dark` | `oklch(31% .015 60)` | `#38322A` | hairlines on dark |
| `--text` | `oklch(96% .012 80)` | `#F7F3EC` | text on dark |
| `--text-muted` | `oklch(74% .018 70)` | `#B6AC9D` | secondary on dark |
| `--canvas` | `oklch(97% .008 80)` | `#F9F6F0` | the light profile card |
| `--canvas-2` | `oklch(94% .010 80)` | `#EFEAE1` | inset blocks on canvas |
| `--canvas-border` | `oklch(88% .012 80)` | `#DED7CB` | hairlines on canvas |
| `--ink` | `oklch(22% .012 60)` | `#241F1A` | text on canvas |
| `--ink-muted` | `oklch(46% .012 70)` | `#6B6156` | secondary on canvas |
| `--brand` | `oklch(58% .15 50)` | `#B3591F` | solid fills **with white text** |
| `--brand-bright` | `oklch(72% .165 55)` | `#E08440` | links and icons **on dark**, fills **with dark text** |
| `--open` | `oklch(62% .15 145)` | `#4E9A4A` | open-now dot |
| `--warn` | `oklch(68% .13 75)` | `#C98A2E` | stale hours |
| `--danger` | `oklch(55% .17 27)` | `#C4552E` | unpaid, errors |

Radii: 8px controls, 12px inset blocks, 16–22px cards, 999px pills. Keep the staging site's 8px base.

**The two ambers are not decoration, they are the fix for a real defect.** The staging site's accent is bright enough that white text on it fails contrast — which is why its own `--primary-foreground` is dark. My earlier artboards put white text on amber and would have shipped that failure. So: `--brand` is the darker step and takes white text; `--brand-bright` is the staging amber, for links and icons on dark, and for fills that carry **dark** text. Never white on `--brand-bright`.

### Editing the brand from the admin

The Guild admin gets a Brand & theme screen. Two rules for it, learned from the member theme picker:

- **Typefaces are chosen from a curated list of pairings**, not a free font field. An open font picker guarantees someone tries Comic Sans, and there is no undo for a brand.
- **Colour is edited as a brand hue and lightness, with live contrast readouts**, not as raw hex. The screen shows, in place, whether white or dark text passes on the chosen fill and refuses to save a combination that fails 4.5:1. Every token here already passes; the editor's job is to keep it that way.

Store the token set as one row of JSON and inject it as CSS custom properties at render. Never let an edit reach the page as inline styles scattered through components — the whole point is that the swap stays one file.

## Profiles are pages, not modals

Each member profile is a real route that server-renders. Not a modal over the directory — that was considered and rejected.

The deciding argument is that a findable profile is the most concrete membership benefit the site offers. Someone searches a brewery's name and city, and the Guild's page for them comes up. That is something the Guild can put in a recruitment pitch. A modal is invisible to search entirely, and the workaround — a route that server-renders the same content — means building the page anyway and then the modal on top of it.

It is also materially less to build and less to get wrong. No focus trap, no scroll lock, no restoring focus to the pin that opened it, no history interception, no two layouts of one thing. Browser back works. Link previews in a text message work. Printing works.

**Routes:**

- `/members` — the existing Members page, map and card grid. Not being rebuilt.
- `/members/[slug]` — a member profile.
- `/admin` — member admin, behind auth.
- `/guild` — Guild admin, behind auth and `is_guild_admin`.
- `/send/[token]` — the creator upload page. No auth, token-validated in a Worker.

Each profile route needs page title, meta description, Open Graph and Twitter card tags built from the member's name, city, tagline and cover image, plus `LocalBusiness` structured data. That is what turns a shared link into a rich preview and an indexed page into a useful search result — and it is the whole reason for choosing pages, so do not skip it.

### Keeping the visitor's place

The card button and the map pin's callout become ordinary links. To avoid dumping the visitor back at an unfiltered map when they return, carry their list state in the query string — filter, sort, and map position — and have "Back to members" restore it. A couple of URL parameters, not an architecture.

### Next in the directory, not nearest

Distance is the wrong rule for this Guild. Membership is geographically uneven, so "nearby" is meaningless for a remote member and misleading for a dense cluster. It also needs distance maths and a fallback for when nothing is in range.

Use the visitor's own list position instead. The previous / next links in the header, and the card at the foot of the profile, move through the directory **in the order and filter the visitor is browsing** — if they filtered to Allied Members, next is the next Allied Member. That carries their intent rather than overriding it, needs no geography, and behaves the same for a remote member as a clustered one.

The `latitude` and `longitude` columns stay, because the existing map needs them. They no longer drive this.

## Stack

Code written by Claude Code, repo on GitHub, hosted on Cloudflare Workers, Postgres and auth and object storage on Supabase.

Two consequences worth deciding up front. Image renditions are generated at the Worker or CDN layer from the original plus its crop rectangle, not baked at upload — that is what makes the stored-original rule pay off. And the creator upload endpoint runs as a Worker route that validates the token server-side and writes to Supabase storage with a service key; the token never touches a client-side Supabase call.

Use `text` columns with `check` constraints rather than Postgres enum types. Adding a value to a PG enum inside a migration is awkward and these sets will change.

## Data model

All tables carry `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` unless noted. Foreign keys cascade on delete from `members` unless noted.

### members

One row per member. Type-specific fields live here as nullable columns with a check constraint, rather than separate tables per type — the overlap is large and the volume is tiny.

| Column | Type | Notes |
| --- | --- | --- |
| slug | text unique not null | profile URL segment |
| member\_type | text not null | check in (producer, mobile, allied) |
| business\_name | text not null |  |
| tagline | text | check length <= 70 |
| city | text not null |  |
| state | text not null default 'CA' |  |
| street\_address | text | producer and Allied Member |
| postal\_code | text |  |
| latitude | numeric(9,6) | for the nearby-member card |
| longitude | numeric(9,6) |  |
| service\_area | text | mobile and Allied Member |
| lead\_time | text | Allied Member only |
| phone | text | E.164 |
| contact\_email | text | Allied Member sales address |
| timezone | text not null default 'America/Los\_Angeles' | IANA, never hardcode |
| theme | text not null default 'amber' | check in the eight theme names |
| logo\_asset\_id | uuid | fk media\_assets, on delete set null |
| cover\_asset\_id | uuid | fk media\_assets, on delete set null |
| cover\_crop | jsonb | see crop shape below |
| member\_since\_year | smallint |  |
| discount\_percent | smallint | Allied Member only, null when no fixed percentage |
| discount\_no\_fixed\_percent | boolean not null default false |  |
| discount\_redeem\_text | text |  |
| status | text not null default 'applied' | check in (applied, declined, draft, published, suspended) |
| hours\_confirmed\_at | timestamptz | the tick's timestamp |
| published\_at | timestamptz |  |
| dues\_received\_at | timestamptz | ticked by the Guild admin at approval |
| approved\_at | timestamptz | when the Guild admin approved |
| approved\_by\_user\_id | uuid | fk auth.users |
| application\_note | text | what they wrote when applying |
| trail\_eligible | boolean not null default false | hook, see below |

A crop rectangle is `{"x":0.08,"y":0.0,"w":0.84,"h":1.0}` — fractions of the original's width and height, never pixels, so it survives any resize.

### member\_users

A business may have more than one person editing it.

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null | fk members |
| user\_id | uuid not null | fk auth.users |
| role | text not null default 'editor' | check in (owner, editor) |

Unique on (member\_id, user\_id). This table is what every RLS write policy checks.

Guild admins are separate. Put the platform role on the account — a `profiles` row keyed to `auth.users` carrying `is_guild_admin` — rather than overloading this table. A Guild admin approves applications without being an editor of anyone's profile.

### media\_assets

The gallery. Originals only — renditions are never rows here.

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| storage\_path | text not null | Supabase storage key |
| kind | text not null | check in (image, video) |
| mime\_type | text not null |  |
| byte\_size | bigint not null |  |
| width | int |  |
| height | int |  |
| duration\_ms | int | video only |
| original\_filename | text |  |
| source | text not null | check in (member\_upload, creator\_upload) |
| uploaded\_by\_user\_id | uuid | fk auth.users, null for creator uploads |
| upload\_token\_id | uuid | fk upload\_tokens, null for member uploads |
| creator\_name | text |  |
| creator\_credit | boolean not null default false |  |
| permission\_accepted\_at | timestamptz | set when the creator ticked the box |
| review\_status | text not null default 'approved' | check in (pending, approved, rejected); creator uploads insert as pending |

### carousel\_slides

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| asset\_id | uuid not null | fk media\_assets, on delete restrict |
| crop | jsonb not null | 4:5 crop of the original |
| outbound\_url | text | optional tap-through, member-typed |
| sort\_order | smallint not null | 0–3 |

Unique on (member\_id, sort\_order), check sort\_order between 0 and 3. `on delete restrict` on the asset so a member can't delete a gallery file that a live slide still uses.

### member\_links

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| kind | text not null | website, instagram, facebook, tiktok, taplist, menu, press\_kit, catalog, other |
| label | text | overrides the default label |
| url | text not null |  |
| sort\_order | smallint not null default 0 |  |

### hours

Regular weekly hours. Multiple rows per weekday are allowed so a member can have split hours (a lunch block and a dinner block).

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| weekday | smallint not null | 0 = Sunday, check 0–6 |
| opens\_at | time | null when closed |
| closes\_at | time | null when closed |
| closes\_next\_day | boolean not null default false | true when the close time is after midnight |
| is\_closed | boolean not null default false |  |

### special\_hours

Holiday and one-off overrides. A row here wins over the weekly row for that date.

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| date | date not null |  |
| is\_closed | boolean not null default false |  |
| opens\_at | time |  |
| closes\_at | time |  |
| closes\_next\_day | boolean not null default false |  |
| note | text | shown on the profile, e.g. "Thanksgiving" |

### calendar\_connections

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| provider | text not null | check in (google, ics) |
| google\_refresh\_token | text | store in Supabase Vault, not plaintext |
| google\_calendar\_id | text |  |
| ics\_url | text |  |
| sync\_tag | text | only events whose title or category contains this are imported |
| last\_synced\_at | timestamptz |  |
| last\_sync\_error | text |  |
| sync\_status | text not null default 'ok' | check in (ok, failing, disconnected) |

### events

Every member type uses this table. Venue fields are nullable — null means the event is at the member's own address.

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| calendar\_connection\_id | uuid | fk, null for hand-entered |
| source | text not null | check in (google, ics, manual) |
| external\_event\_id | text | the provider's event id, null for manual |
| starts\_at | timestamptz not null |  |
| ends\_at | timestamptz |  |
| venue\_name | text |  |
| city | text |  |
| address | text |  |
| overlay\_status | text | check in (postponed, rescheduled, canceled) |
| overlay\_starts\_at | timestamptz | the new time when rescheduled |
| overlay\_note | text |  |
| overlay\_set\_at | timestamptz |  |
| is\_hidden | boolean not null default false | member hid it from the profile |

Unique on (calendar\_connection\_id, external\_event\_id). **A re-sync reconciles on that pair and must never clear the overlay columns** — that is the whole reason the overlay lives here and not in the member's calendar.

### upload\_tokens

| Column | Type | Notes |
| --- | --- | --- |
| member\_id | uuid not null |  |
| token\_hash | text not null | store a hash, never the raw token |
| created\_by\_user\_id | uuid not null | fk auth.users |
| expires\_at | timestamptz not null | default now() + 7 days |
| max\_files | smallint not null default 5 |  |
| used\_count | smallint not null default 0 |  |
| revoked\_at | timestamptz |  |

### categories and member\_categories

`categories` holds the Allied Member supply categories as `(id, name, slug, sort_order)`; `member_categories` joins `(member_id, category_id)`. A join table rather than a text array, so the directory can filter by category later without a migration.

### Trail hooks — not built

The passport is deferred. Two hooks now so adding it later is not a rewrite, and neither stores anything about a visitor:

- `members.trail_eligible` exists and is set true for producers. The rule lives in data, so changing who qualifies is an update, not a code change.
- The shape it would take is recorded here and **not created**: a `trail_visits` table of `(visitor_id, member_id, visited_at)`. Whether `visitor_id` is an anonymous local identifier or a real account is the open product question, and it carries privacy weight, so nothing is written until the Guild decides.

Nothing in the current build writes visitor data of any kind.

### Row level security

- `members`: public select where `status = 'published'`. Insert, update, delete only where a `member_users` row links the caller.
- Child tables (`carousel_slides`, `member_links`, `hours`, `special_hours`, `events`, `member_categories`): public select only when the parent member is published. Writes gated by `member_users`.
- `media_assets`: public select only when `review_status = 'approved'` **and** the asset is referenced by a published slide, logo or cover. Members see all of their own rows including pending.
- `upload_tokens` and `calendar_connections`: no public select at all. The creator upload route reads tokens with the service key inside a Worker.

### Storage buckets

`member-media` private, served through a Worker that applies the crop and resize. `member-logos` may be public since logos are published anyway. Strip EXIF on ingest for both.

### inquiries

Public contact form submissions, captured by the Worker so the row lands even if the confirmation email fails.

- `id`, `created_at` -- the standard convention
- `name text not null`, `email text not null`, `phone text`, `message text`
- `wants_membership_info boolean not null default false` -- the "I want to learn more about becoming a member" checkbox
- `status text not null default 'open'`, check in `(open, handled)` -- two states only; artboard N's filter is Open / Handled / All, no "read" state in the UI
- `confirmation_sent_at timestamptz` -- load-bearing: artboard N displays "Confirmation email sent automatically at 4:12 pm," and without this column there's no way to tell a delivered auto-reply from one Resend silently failed to send
- `handled_by_user_id uuid`, fk `auth.users`, and `handled_at timestamptz` -- more than one person may triage
- `converted_member_id uuid`, fk `members` -- set when an admin uses "Set them up as a member," closing the loop from inquiry to the member record it produced

No IP or honeypot columns; rejection happens before a row is written.

RLS: no public select at all. Inserts go through the Worker with the service key, never a client-side Supabase call. Select and update are restricted to `is_guild_admin`.

## Computing "open now"

This looks trivial and is a classic source of wrong answers. The rules:

1. Resolve the current time in the member's own `timezone`, never the server's and never the visitor's.
2. Look for a `special_hours` row for today's date. If one exists it wins outright — closed means closed, and its note renders beside the status.
3. Otherwise use the weekly `hours` rows for today's weekday. A member may have several, so the member is open if the current time falls inside any of them.
4. An interval with `closes_next_day = true` runs to that time on the following day. A taproom open until 1am on Saturday is a Friday row with `closes_at = 01:00` and the flag set, not a Saturday row.
5. Because of rule 4, always also check yesterday's rows for an interval still running past midnight. This is the step that gets missed: at 12:30am the member is open, but today's rows say nothing about it.
6. "Closes in 2 hr 40 min" counts to the end of the interval currently containing now.
7. When closed, the next opening time is the earliest future interval across the next seven days, with `special_hours` applied. Say "Opens Thursday 3pm," not just "Closed."

Holidays are not a special mechanism — they are `special_hours` rows. Seed nothing; the admin's hours screen gets an "Add a holiday or one-off change" control and members enter their own. A Guild-wide holiday seeder is a nice-to-have later, not a first release.

Store times as `time` in local wall-clock, not UTC. Hours are "we open at 3pm" and should not shift when daylight saving does.

## Empty and error states

Every module needs a defined absence. The rule is that a module with nothing in it disappears rather than rendering an empty container — with these exceptions, where silence would be worse than a message.

| Situation | What renders |
| --- | --- |
| No carousel slides | Module omitted. The cover and hero carry the page. |
| One slide | Module renders, no dots |
| No cover photo | Theme colour fills the band |
| No tagline | Line omitted, name and badge close up |
| No hours at all (producer or Allied Member) | Status block shows "Hours not listed" with the phone number as the action, instead of open/closed |
| Hours stale past 90 days | Status still computes, plus a quiet "Hours confirmed \[Month Year\]" line |
| Mobile member, no upcoming events | "No dates announced yet" with the booking button still present — never an empty list |
| Calendar sync failing | Nothing on the public page. The admin shows the failure and the last successful sync. |
| Allied Member, no discount set | Block omitted entirely |
| Allied Member, no categories | Module omitted |
| An image fails to load | Theme-coloured block in its place, never a broken-image icon or alt text alone |
| Profile is a draft or still an application | 404 to the public, preview banner to its own members |
| Slug not found | The directory's own 404, offering the member list — not a bare error |

The general principle: a member who has filled in almost nothing should still get a page that looks deliberate. Most members will be that member for a long time.

## Open items

- [x] Brand pass — approved. Bricolage Grotesque over Chivo, tokens in the Brand system section
- [x] Resend sending domain — `mail.iscbrewersguild.org`, verified before first send
- [x] Staging CSS heading-weight bug — not fixed; that stylesheet is being replaced
- [x] First Guild admin — seeded against boblelle77@gmail.com
- [x] Member migration — import everyone, publish even when empty
- [x] Sign-in — Supabase magic link, one route, routed by role
- [x] Joining — inquiry form now, applications queue later, no payment on the site
- [x] Media — 4:5 portrait, originals plus crop rectangles, creator upload links
- [x] Events — all member types, calendar sync with member status overlays
- [x] Trail — deferred, hooks only, nothing about visitors stored
- [x] Naming — Allied Member, and no "brewery" in member-facing copy

Nothing is open. This is ready to hand to Claude Code.
