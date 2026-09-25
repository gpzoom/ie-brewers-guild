# Member portal, setup wizard, drafts & Photos & events role: plan

**Spec:** `docs/member-profiles.md` → "Setup wizard, member portal and drafts" (incl. "People and permissions"). **Structure map:** `docs/design/onboarding/`. **Look:** `docs/design/artboards/` + `docs/design/README.md`.
**Status:** DRAFT for owner approval. Open questions are at the end; nothing is built until they're answered.

## Facts from the code that shape this plan

- Every profile editor today writes **live** tables through the session client; RLS (`is_member_editor`) is the only permission check and **ignores `member_users.role`**. With the public anon key, any linked user can also write live tables directly over the REST API, so role limits must be enforced in the database, not the UI.
- `member_users.role` allows only `owner`/`editor`. Only Guild admins can insert `member_users` rows.
- `audit_log` accepts inserts only from Guild admins; nothing records a member's own actions.
- `/signin` has no `next` parameter; `/auth/callback` routes by role (Guild admin → `/guild`, member → `/admin`, picking the oldest `member_users` row).
- The Guild invite creates the auth account immediately and fails if the email already has an account.
- `uploadMemberLogo` sets the live `logo_asset_id` on upload. No member-facing editor writes `member_categories`.
- Deleting a gallery photo today removes it from the carousel and silently clears logo/cover/social image (FKs are `on delete set null`).
- `/api/member-media` only serves assets referenced by a published member's live profile, so a draft preview must load images through `/api/admin-media` (owner check).
- There is no database test harness and no Docker; staging and production share one Supabase database.
- The profile template's children already render purely from the `MemberProfileData` object (no child fetches). Cover/carousel URLs are chosen with `isPreview`.

## Phase 1: Database

One migration file per concern, applied with `supabase db push` (dry run first). Nothing here changes current behavior, so staging keeps working before phase 2.

1. **`members` columns:** `type_confirmed_at timestamptz`, `type_confirmed_by_user_id uuid → auth.users`, `setup_completed_at timestamptz`. Extend `members_enforce_owner_write_limits`: non-Guild-admins can't change `member_type` once `type_confirmed_at` is set, and can't set or clear the three new columns directly (only through the functions below).
2. **`member_users.role`:** check becomes `in ('owner','editor','media_events')`. At most one owner per member (partial unique index on `member_id where role = 'owner'`).
3. **Role helpers (SECURITY DEFINER, `search_path = public`):**
   - `member_role(member_id) → text` (the caller's role or null).
   - `can_edit_section(member_id, section) → bool`: Guild admin → true; `owner`/`editor` → any section; `media_events` → only `media`.
   - `is_member_full_editor(member_id)`: owner/editor/Guild admin.
4. **`member_drafts`** as the spec defines it: `member_id pk`, `data jsonb` keyed `basics | media | links | discount | theme`, `dirty_sections text[] default '{}'`, `media_updated_by_user_id`, `updated_at`, `updated_by_user_id`. RLS: select for any linked user or Guild admin; **no insert/update/delete policies** (function-only writes).
   - `data` shape, the same as the template's profile object:
     - `basics`: member fields, `hours[]`, `special_hours[]`, `logo_asset_id`, `logo_background`, `cover_asset_id`, `cover_crop`
     - `media`: `slides[]` with `asset_id`, `crop`, `outbound_url`, `sort_order`
     - `links`: `links[]`
     - `discount`: discount fields and `category_ids[]`
     - `theme`: `theme`
   - `phone`, `contact_email` and `og_image_asset_id` go wherever questions 2–3 decide.
5. **`member_invites`** exactly as specified. RLS on with no policies (service role only).
6. **`support_requests`** as specified. RLS: insert/select own member for linked `owner`/`editor`, all for Guild admin.
7. **SQL functions** (SECURITY DEFINER, each checks `auth.uid()` first):
   - `ensure_member_draft(member_id)`: creates the draft from live if missing and returns it.
   - `save_member_draft_section(member_id, section, data jsonb)`:
     - Rejects unless `can_edit_section`. Validates the section's JSON shape and allowlisted keys, never `member_type`/`status`/slug.
     - Writes the section, adds it to `dirty_sections`, sets `updated_by_user_id = auth.uid()`, and sets `media_updated_by_user_id` for media.
     - Audits when the caller is a Guild admin, i.e. impersonating.
   - `publish_member_draft(member_id, sections text[], confirm_hours boolean)`:
     - Rejects any section the caller can't edit. `media_events` → media only.
     - If `basics` is included, `confirm_hours` must be true for non-mobile members.
     - Writes the named sections into the live tables (members columns; delete-and-insert for `hours`, `special_hours`, `carousel_slides`, `member_links`, `member_categories`). Sets `published_at`, `hours_confirmed_at` when confirmed, and `status = 'published'` only when the caller is a full editor. Removes the sections from `dirty_sections`.
     - All in the function's single transaction, so any error rolls everything back.
     - Checks that every referenced asset belongs to the member and is approved.
   - `discard_member_draft_sections(member_id, sections text[])`: same role rule; resets those sections from live.
   - `confirm_member_type(member_id, new_type)`: allowed once (`type_confirmed_at is null`), full editors only. Sets type + confirmation. Always writes an audit row with the real actor, even for a member. Returns old/new type so the app can email the Guild.
   - `complete_member_setup(member_id)`: requires type confirmed and non-empty name + city in the draft; sets `setup_completed_at` once.
8. **Role-aware RLS on non-drafted tables:** `events`, `media_assets`, `upload_tokens` stay writable by all three roles; `calendar_connections` writes become owner-only (+ Guild admin).
9. **Tests.** The pgTAP extension runs SQL tests in a transaction that is always rolled back, run with `supabase test db --linked`, so nothing is ever committed (see question 11). They cover:
   - a `media_events` user can save and publish `media` but gets an error on every other section, on publish of a mixed list, on discard of other sections, and on direct REST writes to `member_drafts` and the live tables;
   - an `editor` can do everything except owner-only calendar writes;
   - a publish that fails part-way (e.g. an asset belonging to another member in the media section) leaves every live table exactly as before;
   - the hours rule on publish.
   - Plus vitest unit tests for the TypeScript draft/section helpers.

## Phase 2: Drafts in the existing editors

- **Editors:** each save path moves from live-table writes to one server function per section that calls `save_member_draft_section`. The client keeps a local copy of the section (from the draft) and sends the whole section. The same editor components are kept; their loaders read the draft (`ensure_member_draft`) instead of live rows.
- **Live tables:** remove direct member write policies on `members` (for drafted columns), `hours`, `special_hours`, `carousel_slides`, `member_links` and `member_categories`. Live data then changes only through `publish_member_draft`, Guild-admin actions and the service-role paths (confirm-hours link, creator upload).
- **Not drafted, per spec:** events and overlays, and the gallery itself (upload, approve/reject, creator links). Logo upload now adds the file to the gallery and sets the **draft** logo.
- **Gallery delete:** blocked when the asset is used by the live profile or the draft (see question 5).
- **Profile template:** refactor `getMemberProfileData` into two parts:
  - `buildProfileObject(memberRow, hours, slides, …)`: pure and testable, the template's single input.
  - A loader that fills it from live tables or from a draft.
  - `MemberProfileTemplate` takes the profile object plus `mediaMode: 'live' | 'preview'`, replacing the `isPreview` URL switch. `/members/$slug` renders live.
- **Preview route:** renders the draft (or, for `media_events`, live + the media draft only) behind a "Preview · not live yet" band.
- **Top bar:** Preview, **Publish changes** (runs the hours check only when `basics` is dirty and publishable by the viewer), **Discard changes** (confirm dialog; hidden when nothing is dirty or never published), and an **Unpublished changes** label. The owner also sees "Photo changes from [person] waiting to publish". The save note returns to "Changes save as you type. Publishing needs one more step."
- **Scope:** the `/admin` editors get the draft behavior too (see question 1).

## Phase 3: Getting in

- **Footer:** Footer "Member Portal" link directly under "Member sign in" → `/signin?next=/portal`.
- **`/signin`:** accepts `next`, validated against an allowlist (`/portal` and `/portal/*` only; anything else is dropped), and passes it through `emailRedirectTo=/auth/callback?next=…`. `/auth/callback` re-validates and redirects there after the session exchange. The Guild admin still goes to `/guild` unless `next` is a `/portal` path while they're impersonating. Without `next` nothing changes (Member sign in → `/admin`).
- **Invites:** on arrival at `/portal`, pending `member_invites` for the user's email are accepted (service role; creates the `member_users` row). This also works for people who already have an account.
- **`/portal` route:** resolves the member (question 9), then setup incomplete → wizard step, else portal. A `media_events` user always gets the portal. `/portal` is added to the canvas and bare route lists.

## Phase 4: The wizard

- **Routes:** `/portal/setup/$step` with step names `welcome, type, basics, logo-cover, hours, events, photos, links, discount, theme, review`, filtered by member type, then preview → publish → live.
- **Chrome:** the `WizardStep` wrapper has progress ("Step N of M"), Save & exit, Back / Skip for now / Continue, and the StepAnatomy layout.
  - Steps 2 and 3 are required: Confirm type (with the Guild email when changed) and The basics (Continue → `complete_member_setup`).
  - Steps 4–10 wrap the portal section components unchanged.
- **Review:** the checklist comes from a shared `sectionCompleteness(draft)` function, which the portal's Finish card also uses.
- **Final screens:** Preview, the publish check (the existing dialog), "You're live" (link, Copy, Share, Go to your portal).

## Phase 5: The portal

- **Shell:** `/portal/$section` reuses the AdminShell pieces with a nav list per role (full: Basics & hours, Logo & cover, Photos & video, Events, Links & contact, Discount & supplies (Allied), Theme, People (owner)). `media_events` gets Photos & video + Events and "Publish photos".
- **Finish your profile card.**
- **Basics:** member type read-only, with a "Request a type change" dialog (→ `support_requests` + email).
- **People (owner):** list, invite (email + role), resend, cancel, remove. The owner can't remove themselves. Server-side owner check; invite emails via Resend.
- **Guild inquiries:** the Guild admin sees open support requests on the Inquiries screen (small addition).

## Phase 6: New emails

`member_type_changed_in_setup`, `type_change_requested` (→ Guild, link to the roster row), `editor_invited` (→ invitee: inviter, member, role, Member Portal link). The existing `member_invited` link changes to `/signin?next=/portal`.

## Components: reuse vs new

- **Reuse as-is or with a new save target:** BasicsForm, HoursEditor, LogoUploader, CoverEditor, CropEditor, CarouselEditor, MediaGallery, ReviewTray, CreatorLinkPanel, SocialImageEditor, LinksContactEditor, DiscountEditor, ThemePicker, EventsEditor, CalendarConnectionPanel, PublishGateDialog, MemberProfileTemplate (+ children), the AppChrome shell pieces.
- **New:** WizardStep chrome, Welcome, ConfirmType, Review checklist, You're live, FinishProfileCard, Unpublished/Discard controls, PreviewBand, SupplyCategoriesPicker (no member UI exists today), RequestTypeChangeDialog, PeopleSection, member chooser (if question 9 says so), the draft server functions, the invite-acceptance step.

## Decisions (owner, 2026-09-25: "go with your recommendations")

1. **/admin uses drafts too** and stays in place as the fallback; one save path, no live-vs-draft overwrites.
2. **Phone and sales email (`phone`, `contact_email`)** move to Basics & hours and belong to the `basics` section.
3. **Social sharing image (`og_image_asset_id`)** belongs to `basics` (owner and full editors only, like logo and cover).
4. **New "Logo & cover" portal section** (wizard step 4) holding logo, logo background and cover; all in `basics`.
5. **Gallery delete is blocked** while the photo is used by the live profile or the draft, with a message saying where. This replaces the 2026-09-25 "remove from carousel too" behavior.
6. **Logos stay PNG-only** (SVG can carry script); copy says so.
7. **Mobile "Where we'll be"** is the calendar subscription link plus hand entry; no Google sign-in.
8. **Supply categories picker** is built into the Discount & supplies section (`discount` draft section).
9. **Someone linked to more than one member** gets a "Choose a business" screen on `/portal`.
10. **First publish:** only an owner or full editor's Publish changes can make a never-published member live, and it always runs the hours check. Publish photos never changes `status`.
11. **Database tests:** pgTAP run on the linked database, each test inside a transaction that is always rolled back (`supabase test db --linked`); a migration enables the `pgtap` extension.
12. **"Photo changes from [person]"** shows the person's email (no names are stored).
13. **Move back to draft** stays in the portal for owners and full editors.
