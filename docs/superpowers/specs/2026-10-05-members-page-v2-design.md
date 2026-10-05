# Members page v2 (/members-2): design

Owner approved the artboards on 5 October 2026 and chose **B2, one card per member**. The artboards are B1–B6 on the main design canvas, section "Public — Members page v2", and in `docs/design/artboards/MembersV2*.dc.html`. Where this spec and the artboards differ, this spec wins.

## Goal

Try a new layout for the public Members page, side by side with the current one.

- The new page lives at **`/members-2`**, on staging only. It isn't linked from the menu and asks search engines not to index it (`noindex`).
- The current `/members` page doesn't change.
- Whether `/members-2` replaces `/members` later is a separate decision. Nothing here ships to the live site without the owner's "go".

Everything the current page does keeps working:
- the same published members;
- the same logos;
- the map's place is remembered in the address bar, as `mapLat`, `mapLng` and `mapZoom`;
- the profile link keeps the visitor's place.

What's new:
- the layout;
- search, a member-type filter and Near me;
- map highlighting on hover;
- food trucks' pins for today's stop.

## Page layout

### Desktop (B2): 1024px wide and up

- **No photo banner.** The page starts with the "Find a member / Members on the map." heading on the left and the intro sentence on the right.
- **Below the heading, a split view at the height of the window:**
  - On the left is a 440px column. At the top: the search box, Near me, a member-type select and the order (A–Z, or Nearest when Near me is on). Under those, a line like "16 members · 23 locations", then the cards.
  - The cards scroll inside the column.
  - On the right, the map fills the rest of the window and stays in place.
- **One card per member (business).** It shows:
  - the logo;
  - the name;
  - the type tag (MOBILE or ALLIED; producers have no tag).
- **One location:** the card shows that address with **Directions**, **Website** and **Profile →**.
- **Several locations:** the card says "N locations" and lists them, one row each, as **city · street address** with its own Directions arrow.
  - It shows the first two rows, then "+ N more locations", which opens the rest in place.
  - **Website** and **Profile →** appear once, at the bottom of the card.
- **Profile → goes to the member's first location's profile**, in the same order as today's "View profile". Clicking anywhere else on the card does the same.
  - A location row's city opens that location's profile.
  - Directions and Website open in a new tab.
  - Every link carries the current search, as `/members` links do today.

### Phone and tablet (B3–B5): under 1024px

- **Top of the page:** a compact heading, then a bar that sticks to the top while the list scrolls. The bar has:
  - the search box;
  - **Filters**, with a count badge when a filter is on;
  - **Near me**;
  - a **List / Map** switch.
- **List:** the same cards as on desktop.
- **Filters** opens a panel from the bottom of the screen (B4). It has:
  - member type: All / Producers / Mobile / Allied;
  - order: A–Z, or Nearest to me;
  - **Clear**;
  - **Show N members**.

  Filters apply when the visitor presses Show, not while they tap.
- **Map view (B5):** the map fills the screen, with a row of cards along the bottom that the visitor swipes sideways.
  - Swiping to a card moves the map to that member's first pinned location.
  - Tapping a pin brings its card into view.
  - The cards show the same content as in the list.

## Search, filter and order

- **Search** matches the business name and the city of any of its locations. Case and accents don't matter. The list updates as the visitor types.
- **Member type** uses the `filter` search parameter the profile route already understands: `producer`, `mobile`, `allied`. No value means all types.
- **Order** is A–Z by business name by default.
- **Near me:**
  1. The browser asks the visitor for their location.
  2. The cards are ordered by their nearest location, and a card's location rows by distance.
  3. Each address shows the distance in miles with one decimal, for example "1.2 mi".
  4. A food truck counts at today's stop, when it has a pin. A member with no pin goes to the end, A–Z.
  5. The location stays in the browser. It's never sent to the server or saved.
  6. If location is blocked or fails, the list stays A–Z and a one-line note explains how to allow it (B6, state 8).
- **Nothing matches:** "No members match "…"." with a link to clear the search and filters (B6, state 7).
- **The pins follow the list.** A member filtered out of the list loses its pins too.

## Map behavior

The map is still Google Maps, through the existing `@vis.gl/react-google-maps` setup.

- **Hover a card:** all of that member's pins turn orange and grow slightly.
- **Hover a location row:** that pin grows more and shows the business name and city in an orange label.
- **The map only moves when it has to.** If the highlighted pin is off-screen, the map pans to it. If several pins are highlighted and some are off-screen, it fits them all. Otherwise it doesn't move. Moving the mouse away never moves the map back.
- **Hover or click a pin:** its card is highlighted and the list scrolls to it.
  - Clicking a pin opens the existing pop-up, with the name, address, Directions and Profile →.
  - The pop-up's "Visit"/"Website" link stays as it is.
- **First load:** the map fits all pins, unless the address bar already holds a saved map position.

## Food trucks: today's stop

### Which stop is today's

Today's stop is one of the member's events that:
- is **today** in Pacific time (America/Los_Angeles);
- is not hidden;
- is not canceled or postponed.

If there are two or more, take the one happening now. If none is happening now, take the next one today.

### Where its pin goes

Use the first rule that applies:
1. **At a Guild member.** The stop's venue name matches a published member's business name, ignoring case, spaces and a trailing "Co." / "Company". Or the stop's address starts with that member's street address.
   - If that business has several locations, use the one whose city matches the stop's city.
   - If none matches, this rule doesn't apply.

   The truck's pin sits right beside that member's pin, offset slightly so both show.
2. **At a street address.** The stop has map coordinates looked up from its address (see "Data" below). The pin goes there.
3. **City only, or the address couldn't be found:** no pin.
4. **No stop today:** no pin.

### The truck pin and card

- **The pin** is a teal circle with a white truck icon, so it looks different from the red location pins. Clicking it opens a pop-up (B6, state 9): the truck's name, "Today 5–9 pm at …", Directions and Profile →.
- **The truck's card** (B6, states 1–4):
  - today at a Guild member: "Today at **All Points Brewing Co.** · 5–9 pm";
  - today at an address: "Today at [venue] · 4–10 pm", with the address under it;
  - today in a city only: "Today in Corona · 6–9 pm";
  - no stop today: "No stop today. Next: Fri · Riverside", taken from the next stop in the coming 14 days. With none in that time: "No stops scheduled".
- In states 3 and 4 the card shows **Schedule** in place of Directions. It goes to the truck's profile, where its upcoming stops are.

## Data

### What changes

- **Events get coordinates.** New nullable columns on `events`:
  - `latitude`;
  - `longitude`;
  - `geocoded_address`: the address the coordinates were looked up for, so a changed address is looked up again.

  This is a migration on the shared database. Before pushing it, the owner is asked.
- **Who can read them:** the new columns are readable by visitors in the same way as the other public event columns.
- **When stops are looked up.** The existing 15-minute cron gets a step for published mobile members' events in the next 48 hours that:
  - have an address with a street number;
  - have no coordinates for that address yet.

  The step:
  - looks up at most 20 stops per run;
  - uses the existing Google geocoding key (`GOOGLE_GEOCODING_API_KEY`) and the existing `geocodeAddress` helper;
  - never throws;
  - writes with the service-role client, to those event rows only.

  Saving a manual stop doesn't look it up straight away; the next run, within 15 minutes, does.
- **What the page loads.** The `/members-2` loader reads the same directory data as `/members`. It also reads each published mobile member's stops from today through 14 days out, using public columns only, and works out today's stop on the server, in Pacific time.

### What stays the same

- Member rows and how members are geocoded.
- Every editor.
- The `/members` page and its loader.

## Out of scope

- Replacing `/members`, changing the site menu, or anything on the live site.
- "Open now" on the cards.
- Clustering pins.
- A new map provider.

## Testing

- **Unit tests for the new pure logic:**
  - search matching;
  - type filter;
  - distance and Near-me order, including members with no pin;
  - picking today's stop, including the Pacific-time day boundary, events happening now, and canceled or hidden events;
  - pin placement rules 1–4, including venue-name matching and a business with several locations;
  - the "+ N more locations" split;
  - the card text for each truck state.
- **Database tests (pgTAP):**
  - the new columns exist;
  - visitors can read them;
  - visitors can't write them.
- **Server tests for the cron step:**
  - looks up only eligible events;
  - stops at 20;
  - skips stops already looked up for the same address;
  - survives a failed lookup.
- **Build and route checks:** the build passes; the server-function check finds every function; `/members-2` is `noindex` and not in the menu.
- **By hand on staging:**
  - hover highlight and pan-only-when-off-screen;
  - phone filters panel, List/Map switch and swipe cards;
  - Near me allowed and blocked;
  - Sample Taco Truck with a stop today at Sample Brewing Co., and one at a street address.

## Copy

US spelling. The words are the artboards' own:
- "Search members…"
- "Near me"
- "All member types"
- "Filters"
- "Show N members"
- "Profile →"
- "+ N more locations"
- "No stop today. Next: …"
