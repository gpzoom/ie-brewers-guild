# Multi-location businesses: one manager or each location separately

Owner approved this design in conversation on 15 October 2026. Design canvas artboards come first (Rollout, step 1); where this spec and the approved artboards disagree on look and layout, the artboards win, and this spec wins on behavior.

## Goal

Some members have several locations (Hangar 24: Redlands, Riverside, Irvine, Lake Havasu City). Each location is its own `members` row with its own public profile. Today they're tied together only by an identical `business_name`, each needs its own invite and setup, and nothing records whether one person runs them all.

This feature lets the Guild record, per business, whether **one manager** runs every location or **each location is managed separately**. A one-manager business gets one invite, a location switcher, a shared logo, cover and theme, and a short setup for each location after the first.

### Success

- The Guild chooses the mode on the roster and sends one invite to the manager.
- The manager signs in once, sets up the shared look and the first location, then sets up each other location with a short setup, switching between them without signing out.
- Changing the logo, cover or theme on any location changes it on all of them.
- The manager can hand one location to its own manager and keep access to it.
- Separately managed businesses and single-location members work exactly as today.

### Owner's decisions (15 October 2026)

| Question | Decision |
|---|---|
| Who chooses the mode | A Guild admin, on the roster. The business manager can later hand off a single location. |
| What's shared in one-manager mode | Logo, cover and theme only. Everything else is per location. |
| How shared works | Always the same: a change on any location changes every location. |
| Setup | Full setup for the first location, then a short setup for each other location; a location switcher shows progress. |
| Hand-off | The location manager edits their location only; the shared look is read-only for them; the business manager keeps access. |
| Publishing | Each location goes live on its own. |
| Separate mode | Fully independent, as today (each location owns its look). |
| New locations | Added by a Guild admin on the roster. |
| Approach | A: a business record groups locations; the shared look stays on each location's row and is written to all of them in one save. Public pages are unchanged. |

## Terms

- **Business:** a group of two or more locations. Single-location members have no business.
- **Location:** one `members` row (one public profile).
- **Business manager:** in one-manager mode, the one person who manages every location and the shared look.
- **Location manager:** someone the business manager handed one location to.
- **Shared look:** `logo_asset_id`, `logo_background`, `cover_asset_id`, `cover_crop`, `og_image_asset_id` and `theme`. The link-preview image (`og_image_asset_id`) goes with the cover because members set it next to the cover and it shows the same brand.

## Data

### New table `businesses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | Display name for the roster, switcher and emails. |
| `management_mode` | text not null default `'separate'` | `'one_manager'` or `'separate'`. |
| `manager_user_id` | uuid null → `auth.users` | Set only in `one_manager` mode, once the manager is invited. |
| `created_at`, `updated_at` | timestamptz | |

- RLS: visitors may read `id` and `name` (the Members page groups by business); Guild admins manage every row; a business manager reads their own. All writes go through SECURITY DEFINER functions below, never direct client writes.
- A check constraint: `manager_user_id` is null when `management_mode = 'separate'`.

### `members.business_id`

- `uuid null references businesses(id) on delete set null`, indexed.
- **Backfill (migration):** every set of two or more members with the same trimmed `business_name` becomes one business named after them, mode `separate`, `manager_user_id` null. Nothing visible changes.

### Grouping on the public site

- `src/lib/members/directory.ts` groups locations by `business_id`, falling back to the member's own id when it has none (today: by `business_name`). The profile page's "Next location" uses the same rule.
- Mobile-stop host matching (`matchHost`) keeps matching by name and address, since it matches a calendar venue to a taproom, not locations to each other.

## Who can do what

| Action | Business manager | Location manager | Owner (separate mode or single location) | Guild admin |
|---|---|---|---|---|
| Edit a location's details, hours, photos, events, food, links, discount | every location | their location | their location | all |
| Change the shared look (one-manager mode) | yes | no (read-only) | n/a: owns their own look | yes |
| People page for a location | yes, including Hand off | yes, for their location; can't remove the business manager | yes | yes |
| Choose mode, invite the business manager, add a location | no | no | no | yes |

### Roles in `member_users`

The existing roles stay (`owner`, `editor`, `media_events`), and the one-owner-per-location index stays.

- A location the business manager runs alone: the business manager is its `owner`.
- A handed-off location: the location manager is its `owner`; the business manager's link becomes `editor`.
- Who is the business manager is read from `businesses.manager_user_id`, never from the role. That one fact grants the shared-look right and the protection from removal.
- `deleteMemberUser` / `removePortalPerson` refuse to remove the business manager's link (today they only refuse the owner).

## Database functions (all SECURITY DEFINER, all audit-logged)

1. **`save_member_draft_section` (changed).** When the member is in a `one_manager` business and the save touches shared-look fields:
   - the caller must be the business manager or a Guild admin, otherwise the save is refused with "The logo, cover and theme are shared by all [business] locations. [Manager] manages them.";
   - the shared-look fields are written into **every** location's draft in the same transaction (creating drafts where missing) and each draft is marked dirty for that section. Other fields in the same section save to this location only.
2. **`_draft_assert_own_asset` (changed).** An asset may be used by a location when it belongs to that location, or (one-manager mode only) to another location in the same business. Separate mode and single locations keep today's rule.
3. **`publish_member_draft` (changed).** Publishing a location also publishes the shared-look fields to every other location in a one-manager business that is already `published`, and clears just those fields from their dirty state. It never publishes another location's other draft fields, and never changes another location's `status`.
4. **`confirm_member_type` (changed).** In a one-manager business, confirming the type sets `member_type` and `type_confirmed_at` on every location.
5. **`set_business_mode(business_id, mode, manager_user_id, look_source_member_id)` (new, Guild admin only).**
   - To `one_manager`: copies the shared look from `look_source_member_id` to every location (live row and draft); sets `manager_user_id`; for each location the manager doesn't own, an existing owner stays its owner (it becomes a handed-off location) and the manager is linked as `editor`; locations with no owner get the manager as `owner`.
   - To `separate`: clears `manager_user_id`. Every location keeps its current copy of the look and its current owner; the business manager's `editor` links on handed-off locations are removed. To give a location to someone new, the business manager hands it off before the switch.
6. **`hand_off_location` / invite acceptance (new).** The business manager creates a hand-off invite (`member_invites` gains the role value `owner`, allowed only for hand-off invites made by the business manager; 14-day expiry as today). On acceptance, in one transaction, the invitee becomes `owner` and the business manager's link becomes `editor`.
7. **`take_back_location(member_id)` (new, business manager or Guild admin).** Removes the location manager's link and makes the business manager `owner` again.
8. **`create_member` path (changed).** The Guild's **Add member** box gains **Part of** (a business, or none). A new location in a one-manager business copies the live shared look, links the business manager as `owner`, and emails them.

## Screens

### Guild roster (`/guild/roster`)

- A business shows as one row with its locations underneath (city and status each).
- **Managed by:** *One manager* / *Each location separately*. Switching opens a box:
  - to one manager: who becomes the manager (an existing owner's email, or a new email to invite) and which location's look to keep;
  - to separate: a confirmation that explains each location keeps its look and current owner.
- One-manager rows have one **Invite** (when no manager is set), which calls a new `inviteBusinessManager(businessId, email)`: create or find the account (same rules as `inviteMemberCore`, including linking an existing account), set `manager_user_id`, link them per the role rules above, send the Business invite email.
- Separate rows keep one **Invite** per location, as today.
- **Add member** gains **Part of**.
- A Guild admin can make a single location part of a business (or take it out) from its row's actions menu; taking the last-but-one location out deletes the business.

### Location switcher (portal and /admin)

- For anyone linked to locations of a one-manager business, the sidebar's top shows **[Business] · [City] ▾**, listing every location they can open by city with *Live*, *Setting up* or *Not started*.
- The existing "Choose a business" screen (`portal-access.ts` `pickMembership`, Decision 9) lists a one-manager business as one entry; choosing it opens its first location, and the switcher moves between locations.
- The choice is the existing `portal_member` cookie, honored only for a member the user is linked to.
- `/admin` (`requireMemberSession`) honors the same cookie, validated the same way, instead of always opening the oldest link. Edit as them is unchanged (the impersonation cookie still wins).

### Setup

- **First location:** today's full setup. Logo, cover and theme are labeled "Shared by all [N] locations".
- **Other locations (short setup):** a location whose business is one-manager and has another location with `setup_completed_at` set.
  - Skips welcome, type and theme.
  - The logo, photos and cover step shows logo and cover read-only with the shared label; the gallery and carousel are this location's own.
  - Basics starts pre-filled from the first set-up location: tagline, phone, member since and (Mobile members) categories. City, address and hours start empty.
  - Links start pre-filled from the first set-up location.
  - Pre-filling happens once, the first time the location's setup opens, and only into an empty draft.
  - Finishing publishes this location only. The next screen offers "Set up [next city] next" while any location is not live.
- A location manager's setup also skips the shared-look steps.

### People page

- On each location of a one-manager business, the business manager sees **Hand off this location** (email field, Send invite). The People list shows the business manager as **Business manager**, which no one but a Guild admin can remove.
- After a hand-off, the business manager sees **Take back this location** (with a confirmation).

### Shared look, read-only

- For a location manager (and any editor who isn't the business manager), the logo, cover and theme controls show the current look with: "Shared by all [business] locations. [Manager name or email] manages this."

## Emails (all one link, replies to webmaster@ like the Member invited email)

| Trigger | To | Content |
|---|---|---|
| `business_invited` | the business manager | "You're invited to manage [business]'s [N] locations on the ISC Brewers Guild member directory." Sign-in link. |
| `location_handoff_invited` | the new location manager | "[Manager] asked you to manage [business] · [city] on the ISC Brewers Guild member directory." Sign-in link; lasts 14 days. |
| `business_location_added` | the business manager | "A new location, [business] · [city], was added to your business. Sign in to set it up." |

## Error handling

- A shared-look save by someone other than the business manager is refused by the database (not just hidden in the UI), with the message above.
- The shared-look write to every location happens in one transaction: it all saves or none of it does.
- A photo that is still used by any location is never deleted when one location replaces it.
- Mode switches refuse when a hand-off invite is pending for that business ("Cancel the pending hand-off first").
- A `portal_member` cookie naming a location the user isn't linked to is ignored (today's rule).

## Testing

- **pgTAP:** `businesses` RLS (visitor read, no client writes); backfill grouping; shared-look save by manager vs location manager vs owner in separate mode; the widened asset rule (allowed only within a one-manager business); one-transaction write to all drafts; publish copying only look fields to live siblings; type confirmation across locations; `set_business_mode` both ways; hand-off acceptance and take-back keep exactly one owner; the business manager can't be removed.
- **Vitest:** directory grouping by `business_id`; switcher and chooser grouping; short-setup step list and pre-fill rules; `/admin` cookie validation; `inviteBusinessManager` (new account, existing account, already managed); email content for the three triggers.
- **Staging walk-through:** a sample 3-location business: invite, set up all three, change the logo and publish, hand one off, take it back, switch to separate.

## Rollout (each step pushed to staging for the owner's review; production only on "go")

1. Artboards on the design canvas for: roster business row and the mode boxes; the location switcher (computer and phone); the short setup with shared marks; Hand off / People with Business manager; the read-only look. Owner approves before any code.
2. `businesses` table, backfill, Members page grouping by `business_id`, roster grouping, **Managed by**, `inviteBusinessManager`, **Part of** in Add member. Every business starts `separate`, so members see no change.
3. Location switcher in the portal and `/admin`.
4. Shared look (save, asset rule, publish) and the short setup.
5. Hand-off, take-back and mode switching.
6. Member Guide: a "Managing several locations" page, new screenshots, rebuilt PDF (`docs/member-guide/`, copied to `public/member-guide.pdf`).

## Out of scope

- Members adding their own locations (the Guild adds them).
- Sharing anything beyond logo, cover and theme (calendars, photos, links stay per location; links are only pre-filled).
- A business-level public page; each location keeps its own profile.
- Ownership transfer for single-location members (unchanged: the super admin's sign-in email change).
