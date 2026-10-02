# Setup wizard redesign: design

Agreed with the owner, 2026-10-02. This changes how the setup wizard looks and the order of its steps. It does not change what is saved or the rules behind it. **The merge to `main` waits until this is built, the guide is redone, and the owner has approved the result on staging.**

## Why

The owner has been through the wizard several times and sees a better flow. The guide's screenshots came from test accounts with half-filled data, so they didn't show the design. The new wizard is designed first, with complete artboards to refer to and talk about. Then it's built to match.

## Order of work

1. **Artboards first.** Draw every wizard screen as an artboard on the onboarding canvas (`https://claude.ai/artifact/UENo3svcNBeNrgM6FMMtLV`, mirrored in `docs/design/onboarding/`). Use the site's design language and clean sample data. A few also show a brand-new member's empty state. The owner refines and approves them in Claude Design. **No wizard code changes before that approval.**
2. **Build on staging** to match the approved artboards.
3. **Redo the member guide** with sample-data screenshots of the built screens.
4. **Owner review on staging**, then the go-live merge.

## 1. Wizard flow

| # | Step (URL name) | Producer | Mobile | Allied |
|---|---|---|---|---|
| 1 | Welcome (`welcome`) | yes | yes | yes |
| 2 | Confirm your member type (`type`) | yes | yes | yes |
| 3 | The basics (`basics`) | yes | yes | yes |
| 4 | **Logo, Photos & Cover** (`logo-cover`, new layout) | yes | yes | yes |
| 5 | When you're open (`hours`) | Weekly hours | Where we'll be | Business hours |
| 6 | Events, plus Food for producers (`events`) | yes | — | yes |
| 7 | Links (`links`) | yes | yes | yes |
| 8 | Member discount & supplies (`discount`) | — | — | yes |
| 9 | **Pick your theme** (`theme`, renamed) | yes | yes | yes |
| — | Review → Preview → One last check → You're live | yes | yes | yes |

- **Step counts:** 8 numbered steps for a producer, 7 for a Mobile member and 9 for an Allied Member (today: 9, 8 and 10).
- **The old step 7, Photos (`photos`), goes away** as a wizard step. Its contents move into step 4.
- **Back:** every screen after Welcome has **Back**. Back from step 4 returns to The basics, even once setup counts as complete. Today the route sends welcome, type and basics to `/portal` after setup, which is why step 4 has no Back. That redirect must allow Back into The basics during the same wizard visit, without reopening the wizard on later sign-ins.
- **Member-type tag** (owner request, 2 Oct): every wizard screen shows the member's type as a large colored tag in the progress row, where the small grey label is today.
  - PRODUCER is orange, MOBILE MEMBER is teal and ALLIED MEMBER is blue, the guide's colors.
  - A member, and anyone looking at a screenshot, can tell at a glance which type a screen is for.
- **Unchanged:**
  - steps 1–3 are the only required ones;
  - drafts, Publish, the type lock, Skip for now and Save & exit work as today.

## 2. Step 4: Logo, Photos & Cover

**Layout.** On a computer, two columns: the editor on the left and a live preview on the right that stays in view while you scroll. On a phone, one column with the preview at the bottom.

**The editor, top to bottom:**
1. **Logo:**
   - the logo drop zone and the logo background choice (White, Dark, Your theme color);
   - the note: "You don't have a PNG format? Get it converted now with Canva's Background Removal tool: https://www.canva.com/features/background-remover/", with the link opening in a new tab.
2. **Gallery:**
   - the drop zone, with a thumbnail for each photo;
   - the camera-roll hint;
   - "Didn't shoot it yourself? Create an upload link".
3. **Carousel:** the four portrait slides, each cropped to a portrait frame, as on today's Photos step.
4. **Cover photo:** chosen from the gallery. No cover means the theme color fills the band, as today.

**The preview** shows the top of the profile and updates live:
- the cover, or the theme color without one;
- the logo on its chosen background;
- the business name and city;
- the first carousel slide.

**Same page in the portal and /admin.** The portal menu's separate **Logo & cover** and **Photos** become one **Logo, Photos & Cover** page with this layout. The /admin editor used by **Edit as them** follows.

**A Photos & events editor** keeps exactly the rights they have today. They open the merged page but see only the Gallery and Carousel parts. Logo and Cover are hidden, and the writes are refused as today.
- *Ruling made while writing this spec; the owner can overturn it.*
- *Cost if wrong: a few lines of the section rules.*

## 3. Other step changes

- **Step 6, Food (producers):** the wording explains both uses of the one **#food** tag: visiting food trucks and pop-ups, and the taproom's own kitchen specials, such as brewpub specials.
  - Both show in "Food for the next week".
  - No new tag or profile section.
  - **"We have our own kitchen" switch** (owner decision, 2 Oct): a switch on the Food section, producers only.
    - When it's on, an open day with nothing tagged #food says **"Kitchen open"** on the profile instead of "Bring your own food".
    - Closed days still say "Closed".
    - It's saved per member as a new yes/no setting, off by default. This is the redesign's one database change: a new column, with a migration and a pgTAP test.
    - It saves straight away, like the food calendar itself, not through the draft.
  - The food how-to video (`videos/google-food-calendar`) gets a line or two to match, re-voiced with the same settings, and is replaced on livid.com.
  - The Food page's hint and the guide's Food item change to match.
- **Step 9, "Pick your theme"** (was "Pick your color"):
  - the live preview no longer pushes the business name up into the cover;
  - the eight theme names show in full (today "Ambe", "Garne", "Indig" and "Fores" are cut off).
- **Unchanged:** Links, Discount & supplies, Review and You're live.

## 4. Artboards

- **What's drawn:** every screen in section 1, for each member type where the screen differs:
  - step 3, for the type-specific fields;
  - step 4, a filled-in version and an empty one;
  - step 5, all three types;
  - step 6, Producer with Food and Allied without;
  - step 7, the Mobile booking links;
  - step 8, Allied.
- **Also drawn:**
  - the step frame (progress, Save & exit, Back / Continue / Skip for now);
  - Review, Preview, One last check and You're live.
- **Sample data:** a fictional business per type. Step 5 shows sample hours with Monday closed and Christmas Day closed. The empty versions show what a brand-new member sees.
- Repo copies go in `docs/design/onboarding/` with the canvas index updated.

## 5. Member guide (after the build)

- **Page 1:** the top band as it is. Then, full page width and one under the other:
  - **Good to know:**
    - About 10 minutes; longer if you're uploading photos.
    - Photo file formats are important. Your logo must be a PNG file; if you don't have one, you can easily get it converted. All other photos can be PNG or JPG.
    - Only the first three steps are required. Everything after "The basics" can be skipped and finished later.
    - Save & exit any time. Your work is saved as you type. Sign in again to pick up where you left off.
    - Nothing goes live until you publish. Preview your page first, then publish when it looks right.
  - **How to sign in**, as it is.
- **Checklist:** as it is, two pages, renumbered to the new steps.
- **Screens section:**
  - every screenshot gets a large member-type tag above it (Producer, Mobile member, Allied Member), or **All members** when the screen is the same for every type, so a member can find the version that applies to them;
  - one step at a time, with the screenshot on top and notes under it. Side-by-side gets tested for readability and is used only if it reads better;
  - a step that differs by type gets one screenshot per type.
- **The wizard map page** is renumbered to the new steps.
- **Screenshots come from the built staging screens,** using sample members.
- Regenerate the PDF with Edge and a fresh `--user-data-dir`.

## 6. Sample members

- **Purpose:** one sample member per type, for the guide's screenshots.
- **Never published, so they never appear on the live directory**, because staging and production share one database. They stay off the directory, the map and the homepage carousel.
- **How they're made:**
  - with the service role;
  - each gets its own sign-in email under the owner's Gmail (+sample-producer and so on);
  - signed in directly, with no emails sent;
  - the sessions are revoked afterward.

## 7. Docs to keep in sync

- `docs/member-profiles.md`, section "Setup wizard, member portal and drafts" (the steps, counts, Back, the merged page);
- `docs/design/README.md` (a decision line);
- the main canvas and its menus (artboards Q/U/W/Y), and artboards G and R where they show Logo & cover and Photos;
- the onboarding map;
- the member guide and its PDF;
- `src/lib/portal/wizard-steps.ts`'s header comment.

## 8. Testing

- Unit tests for the step order and counts per type, Back from step 4, the merged portal section, and the Photos & events editor's view.
- The existing pgTAP files stay green. The only database change is the kitchen switch's column.
- `npm run test`, `npm run test:db` and `npm run build` before each push.
- The owner walks through the wizard on staging for each type.

## Out of scope

- No changes to publishing, the type lock or roles. The kitchen switch is the only new saved setting.
- No new tags or profile sections.
- Mobile members' Phase 1 food-vendor matching (GV1–GV3) is a separate proposal.
