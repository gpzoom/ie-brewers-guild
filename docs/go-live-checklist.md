# Go-live checklist: staging → production

Drafted 27 September 2026, updated 30 September 2026. Production (`iscbrewersguild.org`, the `main` branch, Worker `ie-brewers-guild`) still runs the 18 September code: the public pages behind an **"under construction"** page, with no Member Portal, admin screens, calendar sync or scheduled jobs. Staging (`staging` branch, Worker `ie-brewers-guild-staging`) has everything since, 259 commits ahead. Both use the **same Supabase database**, which already has every staging change applied.

Each step says who does it. "Claude" steps happen only when the owner says go.

## 1. Before the merge (on staging)

- [ ] **Owner: final walk-through on staging**, following the member guide PDF:
  - [ ] Sign in with the **Member Portal** link as a member. Finish the setup wizard, publish, and check the public profile.
  - [ ] Test a **Producer**: hours, events calendar, the **Food** page with a food calendar, and "Food for the next week" (all seven days; under the photos on desktop).
  - [ ] Test a **Mobile member**: "Where we'll be" and booking links.
  - [ ] Test an **Allied Member**: business address, and Discount & supplies.
  - [ ] **Edit as them** from the Guild roster on a member who has never signed in.
  - [ ] Send a **Help** message. Check it arrives at boblelle77@gmail.com with "[Staging]" in the subject, and that the super admin's bell counts it.
  - [ ] **Super admin → Settings:** the calendar sync interval and the carousel's dwell time save; upload a hero image, then try "Use the built-in image".
  - [ ] **Homepage:** "Coming up at our members" shows the next two weeks' member events as calendar pages; Pause, Previous/Next and swiping work; "Upcoming events" in the hero jumps to it.
  - [ ] **Setup wizard redesign (2 Oct 2026): walk it once per member type** on staging, using the sample members (Sample Brewing Co., Sample Taco Truck, Sample Supply Co.): the type tag, Back on every screen, **Logo, Photos & Cover** with its live preview, the Food section's **We have our own kitchen** switch ("Kitchen open" on the profile), and **Pick your theme**.
  - [ ] **Owner: replace the food video on livid.com** (watch page `v5XYPWwgyFVb`) with `videos/google-food-calendar/renders/google-food-calendar.mp4` (2:04, now with the kitchen line), using livid's Replace.
  - [ ] **How-to videos:** on the Events page, **Watch how to connect a Google Calendar for EVENTS** opens a pop-up and plays (on its own, or with one tap on a phone). On the Food page, both the FOOD video and the "watch this video first" events link play. Try one on your phone too.
  - [ ] **One calendar, two tags:** Bob's Brewery's #food vendor visits show only in "Food for the next week", its #guild events only under "Upcoming events", and an event that just mentions food (or says #foodtruck) stays out of the food week.
  - [ ] **Tags save with #:** type `food` as a sync tag and it saves as `#food`.
  - [ ] **Computer-only note:** a calendar box with no link yet (or with Edit link open) shows the orange "Set up the link on a computer — one time only" note.
  - [ ] **Empty links:** add a link with no address on Links & contact and try to publish. The message names the link and says to fix it on Links & contact.
  - [ ] **Remove calendar:** on a test profile, Edit link → **Remove calendar** asks first, then takes that calendar's entries off the profile; hand-added events stay. (Paste the link again afterwards if you want it back.)
- [ ] **Owner: the hero image.** Upload the Guild-supplied photo on Settings (staging and production share it, so it shows on both), or go live with the built-in one for now.
- [ ] **Owner: decide on the test profiles.** Published profiles appear in the live directory the moment the site goes live.
  - **Published:** Test 3, Test 4, Test 7, Wizard Test, Bob's Brewery (made for the how-to videos; its calendar feeds the homepage carousel and its "Food for the next week", and its hours show Wednesday closed). Both videos show Bob's Brewery, so keeping it published is fine, as long as you're happy for visitors to see it in the directory.
  - **Drafts:** Test 6, Test 8, Test2.
  - Delete them (super admin → roster → **Delete member…**) or keep a hidden one for future testing. Tell Claude which.
- [ ] **Owner: Mars Brewing Co.'s food calendar.** A test calendar ("Jones Bones" entries, tag `#food`) is connected to this real member. At go-live their public page will show **Food for the next week** from it. Either confirm Mars really uses it, or disconnect it.
- [ ] **Owner: livid.com video settings.** If livid.com has an "allowed domains" (embed privacy) setting, add `iscbrewersguild.org` and `www.iscbrewersguild.org` next to the staging address for **both** videos, or the pop-ups will be blank on the live site.
- [ ] **Claude: bring production's 2 small changes into staging** (the map button "Website" wording, and the "under construction" page name). Staging already has the same or newer versions, so staging's are kept. Run all tests and push to staging.

## 1b. Optional fixes before go-live (owner decides; Claude builds each on staging)

None of these block going live. Say which you want and Claude does them on staging first.

- [ ] **Frontier Beer Fest's date.** The homepage pins the Guild's own event first, but the only one listed is **30 May 2026**, already past, so nothing is pinned now. **Owner:** send the next date, place, ticket link and poster when known. Claude updates it (`src/data/site.ts`, `guildEvents`).
- [ ] **Warning for "free/busy only" calendars.** Test 3's event didn't show because its Google calendar was shared as "See only free/busy", so every event came through as "Busy". Claude can make the portal spot that and say "Change it to See all event details in Google Calendar". The how-to video already covers it, but the warning catches members who skip the video.
- [ ] **Long links in carousel descriptions.** A web address in an event's description can break in the middle of a word on the homepage calendar pages. Claude can make long links wrap cleanly.
- [ ] **The footer's Twitter icon** links nowhere (it's a placeholder). **Owner:** send the Guild's X/Twitter address, or say to remove the icon.
- [ ] **A real newsletter, later.** The footer's Newsletter box was removed on 1 October 2026, because it said "Subscribed!" but saved nothing. When the Guild starts a newsletter, Claude can bring the box back with sign-ups saved (a list in Guild admin) or sent to Resend or Mailchimp.
- [ ] **Balance the desktop profile.** With seven food rows under the photos, the left column can run longer than the right. Claude can make the "Bring your own food" rows more compact, if it bothers you.

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
- [ ] Both **Watch how** videos play from the Events and Food pages on the live site (see the livid.com step in section 1).

**If something's badly wrong:** Cloudflare → ie-brewers-guild → Deployments → roll back to the previous version. The database changes were all additions, so the 18 September site keeps working against the database. Then tell Claude what broke.

## 6. After

- [x] **Member guide PDF on the site** (2026-10-02): `/member-guide.pdf`, linked from the setup wizard's Welcome step, the portal sidebar ("Member Guide (PDF)") and the Member invited email. Public on purpose (sample members only), so the Guild can also send the link to prospective members. After rebuilding the guide, copy `docs/member-guide/ISC-Brewers-Guild-Member-Profile-Guide.pdf` to `public/member-guide.pdf`; a test fails until the two match.
- [ ] **Later, owner's call: more how-to videos.** The video projects in `videos/` (events and food) can be reused for other topics (photos, hours, Links & contact) with the same look and your ElevenLabs voice.
- [ ] **Later, owner's call:** retiring the old `/admin` editor. It stays for now, because **Edit as them** uses it.
