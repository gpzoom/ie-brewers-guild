# Go-live checklist: staging → production

Drafted 27 September 2026. Production (`iscbrewersguild.org`, the `main` branch, Worker `ie-brewers-guild`) still runs the 18 September code: the public pages behind an **"under construction"** page, with no Member Portal, admin screens, calendar sync or scheduled jobs. Staging (`staging` branch, Worker `ie-brewers-guild-staging`) has everything since, 228 commits ahead. Both use the **same Supabase database**, which already has every staging change applied.

Each step says who does it. "Claude" steps happen only when the owner says go.

## 1. Before the merge (on staging)

- [ ] **Owner: final walk-through on staging**, following the member guide PDF:
  - [ ] Sign in with the **Member Portal** link as a member. Finish the setup wizard, publish, and check the public profile.
  - [ ] Test a **Producer**: hours, events calendar, the **Food** page with a food calendar, and "Food this week" (collapsed, then opened).
  - [ ] Test a **Mobile member**: "Where we'll be" and booking links.
  - [ ] Test an **Allied Member**: business address, and Discount & supplies.
  - [ ] **Edit as them** from the Guild roster on a member who has never signed in.
  - [ ] Send a **Help** message. Check it arrives at boblelle77@gmail.com with "[Staging]" in the subject, and that the super admin's bell counts it.
  - [ ] **Super admin → Settings:** the calendar sync interval and the carousel's dwell time save; upload a hero image, then try "Use the built-in image".
  - [ ] **Homepage:** "Coming up at our members" shows the next two weeks' member events as calendar pages; Pause, Previous/Next and swiping work; "Upcoming events" in the hero jumps to it.
- [ ] **Owner: the hero image.** Upload the Guild-supplied photo on Settings (staging and production share it, so it shows on both), or go live with the built-in one for now.
- [ ] **Owner: decide on the test profiles.** Published profiles appear in the live directory the moment the site goes live.
  - **Published:** Test 3, Test 4, Test 7, Wizard Test, Bob's Brewery (made for the how-to videos; its events calendar feeds the homepage carousel).
  - **Drafts:** Test 6, Test 8, Test2.
  - Delete them (super admin → roster → **Delete member…**) or keep a hidden one for future testing. Tell Claude which.
- [ ] **Owner: Mars Brewing Co.'s food calendar.** A test calendar ("Jones Bones" entries, tag `#food`) is connected to this real member. At go-live their public page will show **Food this week** from it. Either confirm Mars really uses it, or disconnect it.
- [ ] **Claude: bring production's 2 small changes into staging** (the map button "Website" wording, and the "under construction" page name). Staging already has the same or newer versions, so staging's are kept. Run all tests and push to staging.

## 2. Production settings (Cloudflare and Supabase, before the merge)

Set these on the **production** Worker, `ie-brewers-guild` (Cloudflare → Workers & Pages → ie-brewers-guild → Settings). Staging already has each one set, so copy staging's value unless a step says otherwise.

**Build variables** (Settings → Build → Variables; they're baked in when the site is built):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | same as staging |
| `VITE_SUPABASE_ANON_KEY` | same as staging |
| `VITE_GOOGLE_MAPS_API_KEY` | same as staging (or the new key, see section 3) |
| `VITE_UNDER_CONSTRUCTION` | **`false`**, or delete it. This is what removes the "under construction" page. |

**Secrets** (Settings → Variables and Secrets, type "Secret"):

| Name | Value |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | same as staging |
| `RESEND_API_KEY` | same as staging |
| `GOOGLE_GEOCODING_API_KEY` | same as staging (map pins for new addresses) |
| `IMPERSONATION_COOKIE_SECRET` | a **new** long random value (not staging's) |
| `HOURS_CONFIRM_SECRET` | a **new** long random value (not staging's) |
| `SUPPORT_INBOX_EMAIL` | optional. Leave unset to send Help messages to boblelle77@gmail.com. |

- [ ] **Owner (Claude can walk you through it): set the variables and secrets above.** Claude can make the two random values.
- [ ] **Owner: Supabase → Authentication → URL Configuration.**
  - **Site URL:** `https://iscbrewersguild.org`.
  - **Redirect URLs:** add `https://iscbrewersguild.org/auth/callback` and `https://www.iscbrewersguild.org/auth/callback`, and keep staging's.
  - Without this, sign-in links from the live site won't work.

## 3. Google keys

- [ ] **Owner: rotate the Google Maps key.** This is the key-rotation item from earlier. Create a new key in Google Cloud, restrict it by website to `iscbrewersguild.org/*`, `www.iscbrewersguild.org/*` and the staging address, then put it in both Workers' `VITE_GOOGLE_MAPS_API_KEY`. Delete the old key once both sites work.
- [ ] **Owner: check the geocoding key's restrictions** allow calls from the Worker. It's server-side, so restrict it by API (Geocoding API), not by website.

## 4. The merge (Claude, on the owner's go)

- [ ] **Claude:** merge `staging` into `main` and push. Cloudflare builds production in about 5 minutes.
- [ ] **What turns on with it:**
  - the calendar sync (every 15 minutes, paced by Super admin → Settings; staging and production share one timer, so they never sync twice);
  - the daily "confirm your hours" email at 6 am Pacific (5 am in winter), which only goes to members who have signed in and whose hours are over 90 days old;
  - the new homepage: a shorter hero, the member events carousel instead of the three pillars and the Featured Event, and no Events page (old `/events` links go to the carousel);
  - contact-form and type-change emails to the **real** Guild inbox, iscbrewersguild@gmail.com (staging sends these to the test inbox).
- [ ] **Staging stays** for future work, on the same database.

## 5. Check the live site (owner, right after the build)

- [ ] `iscbrewersguild.org` shows the real homepage, not "under construction", with the hero image and the "Coming up at our members" carousel.
- [ ] The **Members** directory and map list the right members, and a profile page opens.
- [ ] The footer's **Member Portal** link emails a sign-in link, and clicking it lands in the portal (or the wizard).
- [ ] **Edit as them** works from the Guild roster.
- [ ] A **Help** message arrives without "[Staging]" in the subject.
- [ ] A **contact form** message reaches iscbrewersguild@gmail.com.

**If something's badly wrong:** Cloudflare → ie-brewers-guild → Deployments → roll back to the previous version. The database changes were all additions, so the 18 September site keeps working against the database. Then tell Claude what broke.

## 6. After

- [ ] **Owner: send the member guide PDF** (`docs/member-guide/ISC-Brewers-Guild-Member-Profile-Guide.pdf`).
- [ ] **Later, owner's call:** retiring the old `/admin` editor. It stays for now, because **Edit as them** uses it.
