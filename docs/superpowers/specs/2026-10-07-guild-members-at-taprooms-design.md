# Guild Mobile members at taprooms, Part 1: design

**Approved:** the design in conversation (owner, 6 and 7 October 2026). **Artboards:** GV1, GV3 and GV4 on the main design canvas, section "Guild Mobile members at taprooms", also in `docs/design/artboards/GuildVendor*.dc.html`.

**What it replaces:** GV1 to GV3 were the earlier "Guild food vendor stops" proposal. This design widens it from food vendors to every Mobile member.

**Part 2** is the taproom's "Ask me first" setting, plus emails for new, changed and canceled visits (GV2). It comes next, as a separate spec.

## Goal

A Guild Mobile member, such as a food truck, a pop-up food vendor or an entertainer, lists a stop at a Guild producer's taproom. That stop should:

- count as **one of the taproom's events**. It shows in the taproom's Upcoming events and on the homepage as the taproom's event (owner: "a mobile member stop should be considered a producer event");
- for **food** members only, also fill that day of the taproom's **Food this week**;
- link **both ways**: the taproom's entry links to the member, and the member's stop links to the taproom;
- be **removable by the taproom**. **Hide** takes it off the taproom's page, and **Show** undoes that.

The member does nothing new. They add the stop in Events or their synced calendar, as they do today.

## Who is a host, and which stop is "at" one

- **Hosts:** published **producer** members only. Allied Members and Mobile members are never hosts.
- **Guests:** published **Mobile** members' events (`kind = 'event'`).
- **Matching** uses the same rule the Members map uses (`placeStop` / `hostFor` in `src/lib/members/mobile-stops.ts`), so the map and the profiles always agree. A stop is at a host when:
  - **its venue name matches** the host's business name, ignoring case, spaces, punctuation and a trailing "Co." / "Company"; or
  - **its address starts with** the host's street address, which is what a venue picked from Google suggestions gives.

  If the business has several locations, the one in the stop's city counts, and if none matches, the stop isn't linked.
- **Which stops get linked:** only stops that end in the future, up to 60 days ahead. Past stops are left as they were.

## Data: `event_hosts`

A new table, one row per linked stop:

| column | |
|---|---|
| `event_id` | primary key; references `events`, deleted with it |
| `host_member_id` | references `members` (the producer), deleted with it |
| `status` | `shown` or `hidden` in Part 1. Part 2 adds `pending` and `declined`. |
| `status_set_by_user_id` | who last hid or showed it (nullable) |
| `created_at`, `updated_at` | |

**Who can read it (RLS):**
- **Visitors:** rows with `status = 'shown'`, where the host is published and the event itself is publicly readable.
- **The host's owner and editors:** all of the host's rows.
- **Guild admins:** everything.

**Who can write it:**
- **The service role,** which runs the linker, is the only writer of rows.
- **Hiding and showing** go through one SECURITY DEFINER function, `set_event_host_status(p_event_id uuid, p_status text)`.
  - **Allowed:** the host's owner, full editor or Photos & events editor (members of `member_users` with any role), or a Guild admin.
  - **`p_status`** must be `shown` or `hidden`.
  - It records who made the change.
  - When a Guild admin makes the change through Edit as them, the server function that calls it adds an audit log row, as other immediate saves do.

## The linker

A single function, `relinkStops`, decides each candidate stop's host from the current hosts and stops, then writes the difference:

- **No host now:** delete any row.
- **The same host as before:** leave the row alone. A hidden stop stays hidden.
- **A new host, or a different one:** upsert with `status = 'shown'`. A hide applied by the old host doesn't carry over.

The decision logic is pure and unit tested; a thin server wrapper does the I/O with the service role. It runs:

1. **After a Mobile member saves a stop by hand:** add, edit (title, venue, time), cancel or postpone, hide, or delete. This runs for that one member, after the save succeeds, and never fails the save.
2. **After a Mobile member's calendar sync:** for that member.
3. **In the 15-minute cron sweep:** for every Mobile member. This catches a host that was just published, a host that changed its name or address, and anything a failed run missed. Both Workers run it, which is harmless because the writes are idempotent.

A canceled, postponed or hidden stop **keeps** its row, but the places where it would appear skip it, as they already skip such events. So un-canceling a stop brings it back with the taproom's choice intact.

## Where a linked stop shows (only `status = 'shown'`)

### The taproom's profile (GV3, left)

- **Upcoming events:** the guest stop sits in date order with the taproom's own events. It shows:
  - the title: the guest's own title when they gave one ("Karaoke Night"), otherwise the guest's business name;
  - a **GUILD MEMBER** mark;
  - the time;
  - a second line, "with *Guest name*" (linked), when there's a title; otherwise the name itself is the link and the line shows the category ("food truck").

  The guest's name links to the guest's profile.
- **Food this week:** only for guests whose **first category** is Food Truck or Pop-up Food Vendor, the same rule as the map icon.
  - The guest fills that day as a vendor, with the GUILD MEMBER mark and the link.
  - **No doubles:** a vendor from the taproom's own food calendar on the same date, whose title normalizes to the same name (`normalizeBusinessName`), is dropped in favor of the linked Guild entry.
  - A day with any vendor no longer says "Bring your own food" or "Kitchen open".
  - "Closed" days stay closed, and a guest stop on a closed day still shows in Upcoming events.

### The Mobile member's profile (GV3, middle and right)

The stop reads as it does today, plus a link to the taproom:
- **Venue as the title:** "Mars Brewing Co. · **Guild taproom →**".
- **The stop has its own title:** "Karaoke Night · **at Mars Brewing Co. →**".

This shows whatever the taproom's Hide/Show choice. The member's page is theirs.

### The homepage events carousel (GV4)

- **Once, as the taproom's event.** The card uses the taproom's colors and logo, and the taproom counts for the carousel's one-per-member rotation. The title is the guest's title or name, with a "with a Guild member" line carrying the GUILD MEMBER and category tags. The footer reads "*Taproom* · See their events →".
- **No second card for the guest.**
- **If the taproom hides the stop,** or the stop isn't at a Guild taproom, the card is the guest's own, as today.

### The Members page map

No change: the guest's pin already sits beside the taproom's.

## The taproom's controls (GV1)

**Events page** (portal, and /admin for Edit as them), producers only:
- A new box below the taproom's own events: **"Guild members at your taproom"**.
- It lists the upcoming linked stops, hidden ones included, oldest first. Each row shows:
  - the date;
  - the guest name (linked);
  - the GUILD MEMBER and category tags;
  - the title, if any, and the time, with "from their schedule";
  - "On your page" with **Hide**, or "Hidden from your page" (faded) with **Show**.
- The intro reads: "Guild Mobile members, such as food trucks, pop-ups and entertainers, who list a stop at your taproom (*street*). They show with your events, and food vendors also show in your Food this week. You don't type anything. Hide any you don't want on your page."
- The footnote reads: "Hidden stops come off your profile, your Food this week and the homepage. They stay on the member's own page."
- The box is shown even when it's empty, with "No Guild members have listed a stop here yet."
- Who can use it: the owner and both editor roles (the Events page is theirs already), and Guild admins through Edit as them.

**Food page:** its 7-day preview includes Guild food vendors, with the same **Hide**.

## Out of scope (Part 2 or later)

- "Ask me first", and Approve or Decline.
- Emails to the taproom (GV2).
- Linking Allied Members or other non-producers as hosts.
- A stop at a non-member venue, which shows as it does today.

## Testing

- **Unit tests (pure):**
  - the linker's decision: no host deletes the row; the same host keeps a hide; a new host resets it to shown; past stops are skipped; Allied and Mobile members are never hosts; a host with several locations is matched by city;
  - merging guest stops into the taproom's events: date order, title and "with" line, canceled or hidden stops skipped;
  - the food week: food-category guests only, de-duplicated against the taproom's own entry, closed days stay closed;
  - the carousel: one card under the host, the guest's own card used when the link is hidden or absent, the rotation counted per host;
  - the guest-profile link text;
  - the Events-page box rows.
- **pgTAP:**
  - the table exists, and visitors read only `shown` rows of published hosts;
  - the host's owner and editors read all of the host's rows; another member reads none;
  - only the service role writes rows;
  - `set_event_host_status`: allowed for the host's owner, editors and Guild admins; refused (42501) for the guest and for strangers; a bad status is refused (22023).
- **Audit:** the hide/show server function audits a Guild admin's change (it's added to the audit-log coverage test).
- **By hand on staging:**
  1. With the owner's OK, Sample Taco Truck (published briefly) adds a stop at Sample Brewing Co., picked from Google.
  2. It appears on Sample Brewing's profile (events and food week), on the homepage card and on the truck's profile.
  3. Hide removes it from Sample Brewing and the homepage; Show restores it.
  4. A karaoke-category member's stop appears in events but not in the food week.
