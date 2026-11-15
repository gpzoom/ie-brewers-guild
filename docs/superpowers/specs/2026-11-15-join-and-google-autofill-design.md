# Join the Guild + "Fill from Google" — design

Date: 2026-11-15 · Status: draft for owner approval

## Why

About 85% of member locations have empty or thin profiles. Owners see the profile
as "making a Facebook page" and don't make time for it. The fix is to turn
*creating* a profile into *approving* one: the site fills in what Google already
knows, and a person only checks it and adds what Google can't know.

Two audiences, one engine:

1. **The Guild admin (owner)** pre-fills existing members' profiles. Members
   won't do it themselves; the owner will.
2. **Prospective members** get a public "Join the Guild" page that builds a
   preview of their profile in seconds, so they see what membership gets them
   before anyone follows up.

Success: the owner can fill an empty profile in a minute or two; a prospect sees
their own business on a Guild-styled page within seconds of typing its name; every
applicant lands on the roster with a usable draft.

## Goals

- A server-side "Google lookup" engine: search by business name + city, return
  candidate matches, then fetch one place's details and map them onto the
  profile's fields.
- An admin **"Fill from Google"** button on the member editor (`/admin` Basics,
  reached directly or via "Edit as them").
- A public **Join** flow (`/join`): step 1 (no account) → instant preview →
  submit → Applied on the roster + admin email + emailed link → step 2 (signed
  in) short form → updated preview.

## Non-goals

- No images from Google, Instagram, Facebook or any scraper (Apify was
  considered and deferred: cost, and owners must never be surprised by photos
  they didn't choose). The only photos are ones a person uploads.
- No AI-written text and no reading of members' websites.
- No change to the full member portal / setup wizard.
- No new "member review before publish" email for admin-filled profiles (Google
  facts only; the owner publishes as today).

## Anti-goals (would be a failure even if it works)

- Anything going public without the Guild admin's approval.
- Overwriting anything a member already typed.
- A prospect creating a second roster entry for a business already on the
  roster, or taking over an existing member's profile.
- Emails to members as a side effect of admin filling or testing (owner rule:
  no emails from bug fixing).
- An open public endpoint that lets bots run up the Google bill or flood the
  roster.

## Constraints and facts from the codebase

- **Google key:** `GOOGLE_PLACES_API_KEY` is already declared for the Worker
  (`worker-configuration.d.ts`) and used by `scripts/geocode-members.ts` with
  Places API (New) `places:searchText`. The builder must confirm the secret is
  actually set on both the staging and live Workers, and that Places API (New)
  is enabled on its Google Cloud project; if not, give the owner step-by-step
  instructions.
- **Google pricing (checked 2026-11-15):** since March 2025 each Places SKU has
  its own free monthly cap. Fields like opening hours and phone bill at the
  Enterprise tier (1,000 free calls/month, then about $35 per 1,000). Billing
  goes by the most expensive field in the field mask, so the **match search must
  ask only for cheap fields** (id, name, formatted address) and only the single
  **details call** for the chosen place asks for hours/phone/website. Expected
  volume (~100 admin fills once, plus applicants) stays inside the free caps.
  The owner should also set a daily quota cap in Google Cloud as a backstop.
- **Status "applied"** already exists (roster shows an orange "Applied" dot) but
  nothing creates it today. An applied member's linked user *can* save draft
  sections and upload logo/gallery photos (no status gate in
  `save_member_draft_section`, `uploadMemberLogo`, `uploadMemberMedia`), but
  *cannot* pass the portal wizard (`confirm_member_type` and
  `complete_member_setup` refuse applied). So step 2 needs its own page, not
  `/portal`.
- **Roster "Approve"** (`approveMember`, `member-admin-actions.server.ts:46`)
  sets status straight to `published` and does **not** copy the draft to live.
  An applicant's content lives in its draft/own rows, so Approve must behave
  differently for applicants (see below).
- **Spam protection pattern** exists: `submitContactForm` uses the
  `CREATOR_UPLOAD_RATE_LIMITER` binding per IP (fails closed) plus a honeypot.
  Join reuses this pattern, under its own `join:` key namespace.
- **Emails:** `sendTransactionalEmail` (Resend, from
  `notifications@mail.iscbrewersguild.org`) with per-trigger recipients in
  `resolve-recipient.server.ts`; Guild-inbox triggers go to `guildInboxFor()`,
  which on staging is `STAGING_GUILD_NOTIFICATION_EMAIL`. There is no pause
  switch for transactional email.
- **Sign-in** is Supabase email OTP/magic link (`signInWithOtp` in
  `signin.tsx`, verified by `sign-in-verify.server.ts`). There's no server-side
  link sender yet.
- **Linking a user to a member** follows `invite-member-core.ts`: create or find
  the auth user, insert `member_users` with role `owner`.
- **Preview rendering:** `MemberProfileTemplate` renders purely from a
  `MemberProfileData` object, so a step-1 preview can be built in memory with
  no photos (`coverAsset: null`, `carouselSlides: []`, `logoPublicUrl: null`).
  Step 2's preview uses the existing `loadMemberPreviewData` (signed-in owner).
- **Staging shares the live database.** Any test application made on staging is
  a real Applied row on the live roster; test rows must be deleted after
  testing.
- **Schema changes** need the owner's go-ahead before `db push`, and must be
  pushed before code that uses them.
- **Site rules:** US English in all text; new editing features must also work on
  `/admin` screens (Edit as them); the Member Guide (HTML + PDF) must be updated
  before merging to main; `npm run build` before pushing to staging.

## Approaches considered

1. **Email first:** prospect confirms email before seeing any preview. Simplest
   and every record has a real email, but the "wow" waits behind an inbox and
   many prospects won't come back.
2. **Everything before email:** preview, logo/photo uploads, tagline, links all
   anonymous; link sent at submit. Most exciting, but opens photo uploads to
   anonymous strangers and needs a separate temporary store.
3. **Preview first, photos after the link — chosen by the owner.** Step 1
   needs no account and shows an instant Google preview; Submit creates the
   Applied roster entry, emails the Guild, and emails the prospect a link;
   step 2 (signed in) is a short form using the existing upload system.
   Instant result, and only confirmed emails can upload.

The admin button is the same under all three.

## Owner decisions

- Google-only data; no images, no Apify (for now).
- Prospects come back via an emailed link (approach 3 above).
- Step 2 is a **short, simple form**: logo, cover photo, tagline, links. The
  full editor comes after approval.
- The admin pre-fills existing members' profiles and publishes them as usual;
  no surprise images because the fill never adds images.
- Every submitted application goes on the roster as a draft-in-waiting, and the
  Guild admin is emailed; the admin follows up and approves for publication.
- **Google data is a suggestion a person confirms.** Once the admin or the
  prospect reviews and saves it, it is the business's own information and is
  kept like anything else they typed (same as today's address autocomplete).
  Only `google_place_id` is kept as Google's own reference. Show "Powered by
  Google" on the step-1 preview and the admin fill panel. (Owner accepted this,
  2026-11-15.)
- **Approved applicants get an automatic welcome email** when the admin first
  publishes their profile: "Welcome to the Guild, your page is live", with the
  page link and how to sign in. Sent once, only from that publish.
- **"Fill from Google" is for Guild admins only** (owner decision,
  2026-11-15). Members may get it in their portal later.

## The design

### 1. Google lookup engine (server)

- `searchPlaces(name, city)` → up to 5 candidates `{placeId, name, address}`.
  Text Search (New), field mask limited to `places.id,places.displayName,
  places.formattedAddress` (cheap tier), biased to Inland Southern California /
  US like `places-address.ts`.
- `getPlaceProfile(placeId)` → Place Details (New) with fields:
  `displayName, addressComponents, formattedAddress, location,
  nationalPhoneNumber, websiteUri, regularOpeningHours, editorialSummary,
  businessStatus`.
- `mapPlaceToProfile(place)` (pure, unit-tested) returns profile fields:
  street_address, city, state, postal_code, latitude/longitude (reuse the
  address parsing in `places-address.ts`), phone, website link, tagline (from
  `editorialSummary` only if it fits the tagline limit), and 7 weekly hours rows.
  - Google weekday 0 = Sunday, same as `hours.weekday`.
  - A period whose close falls on the next day → `closes_next_day`.
  - A weekday with no period → `is_closed`.
  - Split hours on one day (two periods) → earliest open to latest close
    (builder may refine).
  - A place marked permanently closed is shown as a warning, not filled.
- Both server functions are rate-limited per IP (public use) and require
  nothing else; the admin fill (writing a member's draft) requires a Guild
  admin.

### 2. Admin "Fill from Google" (on `/admin` Basics)

- Button near the business identity fields. Opens a small panel: search box
  pre-filled with the member's name + city → list of matches → "That's us".
- Fills the member's **draft** only, and only **empty** fields: address block
  and map pin (together, only if the address is empty), phone, tagline, hours
  (only if the draft has no hours at all), and a `website` link (only if no
  website link exists).
- Shows what happened: "Filled: address, phone, hours, website. Kept yours:
  tagline." The admin reviews and uses the normal Publish button.
- Saves the chosen `google_place_id` on the member (see Data).
- Never sends any email.

### 3. Join, step 1 — `/join` (public, no account)

- Linked from the existing "Ask us about joining" spot on `/signin` and from
  the Contact page; the Contact form itself is unchanged.
- Fields: email, business name, city, member type (Producer, Mobile, Affiliate
  Member), honeypot.
- Producer / Affiliate: "Is this you?" list of Google matches → pick one, or
  "Not listed — continue without Google".
- Mobile (food trucks): skips Google.
- **Already-a-member check** before any preview (Claude's call): the picked
  Google place id, or a loose name match (lowercase, punctuation stripped,
  common endings like "Co.", "Company", "LLC" ignored) in the same city,
  against roster entries in any status except declined. A match shows "We may
  already have {business}. Please contact us" and creates nothing. Declined
  applicants may apply again.
- **Email privacy** (Claude's call): the page never reveals whether an email has
  a login. An email that already has a login is allowed (one person can own
  several businesses); the new applied member is linked to that existing user.
  The same email + same business submitted twice reuses the existing applied
  entry and just sends a fresh link.
- Preview: the full profile template rendered in memory from the Google data,
  with a banner "This is a preview — nothing is public yet." No photos; logo
  shows the template's no-logo state.
- Button: **"Submit to the Guild"**.

### 4. Submit

On submit (rate-limited, honeypot-checked, server-side with the service role):

1. Create or find the auth user for the email; create the `members` row with
   `status = 'applied'`, the chosen type, and the Google-filled fields written
   to the member's own rows (members columns, hours, a website link). An applied
   member isn't public, so its own rows are safe to fill; the draft is created
   from them later by `ensure_member_draft`.
2. Link the user as `owner` in `member_users`.
3. Email the Guild inbox (new trigger, e.g. `membership_application`):
   business, type, city, email, and a link to the roster.
4. Email the prospect a sign-in link that lands on `/join/finish`
   ("Your Guild profile draft is ready: add your logo and photos").
   Builder's call: Supabase's sign-in email vs a link generated server-side and
   sent through Resend with Guild wording. Prefer whichever lets the email say
   what it is.
5. Show a "Check your email" screen.

### 5. Join, step 2 — `/join/finish` (signed in, applied owner)

- A short page, not the portal: **logo** (existing `uploadMemberLogo`),
  **cover photo** (existing gallery upload + cover crop), **tagline**, **links**
  (website, Instagram, Facebook, others; existing link editor if it fits,
  otherwise a simple version).
- "Update preview" shows the draft through `loadMemberPreviewData`.
- "I'm done" sends one Guild-inbox email ("{business} added details to their
  application"), at most one per applicant per day.
- They can come back with any later sign-in until approved. A signed-in applied
  owner who visits `/portal` is sent to `/join/finish` instead of the wizard;
  someone linked to several businesses picks the applied one from the existing
  "Choose a business" list and lands on `/join/finish`.
- Upload rules (PNG/WebP logo at least 400px tall) stay; the page explains them
  in plain words.

### 6. Roster and approval

- Applicants show as **Applied** (existing dot), sorted or filterable so new
  ones are easy to spot.
- For an applied member, **Approve** changes status to **Draft** (not
  published) and points the admin to "Edit as them", where the normal Publish
  button puts the draft live with its usual checks. After that the member uses
  the regular portal (the wizard will greet them with their data already
  filled in).
- On that first publish of a member that came through Join, the welcome email
  goes to the applicant (new trigger, e.g. `application_approved`), once.
  `approved_at` / `approved_by_user_id` are stamped at Approve, as today
  (corrected during planning: `published_at` moves on every publish, so the
  "sent once" rule uses its own `join_welcomed_at` marker).
- Decline works as today: the entry, login link and any uploads stay (the
  admin can delete the member as today). A declined applicant who signs in sees
  "Your application isn't active. Please contact us." (Claude's call.)

### Data

- New nullable columns on `members`: `google_place_id` (text), used for the
  already-a-member check and to remember which Google place was used; and
  `applied_via_join_at` (timestamptz), marking Join applicants;
  `join_welcomed_at` (timestamptz), so the welcome email goes once; and
  `join_details_notified_at` (timestamptz), for the once-a-day "added details"
  email. Needs the owner's go-ahead for `db push`, pushed before the code.

## Left to the builder

- Exact Google field-to-tier mapping (verify against Google's SKU docs before
  shipping) and the tagline length rule.
- How the step-1 preview is held between the preview and the submit (e.g.
  re-fetch details by place id at submit, rather than trusting the browser).
- Where exactly the button and panel sit on the Basics screen, following the
  design canvas look.
- Rate-limit numbers (suggested: about 10 Google lookups and 3 submissions per
  IP per hour).
- Whether step 2 reuses `LinksContactEditor` / `LogoPhotosCoverSection` as-is
  or a trimmed version.
- Tests: unit tests for `mapPlaceToProfile` and the already-a-member check;
  database tests for the new column; no live Google calls in tests.
- Member Guide: add the Join flow and the admin button before merging to main.
