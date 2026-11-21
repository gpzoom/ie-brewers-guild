# Scan Pass print kit — design

Owner decisions 2026-11-21. Status: draft for owner approval.

Decided with the owner:
- Members print at home, or take the file to a print shop.
- The Scan Pass leads the look, with the member's logo included (choice A).
- Three pieces: 4×6 counter card, table tent, staff card.
- The browser makes the PDFs (approach 1).
- No 4-digit code on the staff card.
- Always-true wording on the plate.

## Why

Members need good-looking, print-ready artwork for their two Scan Pass codes, without design skills, Canva or a designer. Today their Scan Pass page offers only two small PNGs (`captionedQrDataUrl` in `src/lib/tap-card/setup-qr.ts`, 300×370 px: the bare QR with its code underneath). Those are sharp up to about an inch, carry no branding and tell customers nothing. Printed at counter size they come out blurry.

The Guild also wants every counter plate in the region to look alike, so customers learn to spot the Scan Pass from taproom to taproom. That consistency is what makes the Beer Trail work.

## Goals

- From their Scan Pass page, a member downloads three ready-to-print PDFs: a **4×6 counter card**, a **folded table tent** and a **staff card**.
- The files print at exact size on a home printer at 100%, and the same file works at a print shop ("print at actual size").
- The design is led by the Scan Pass (owner's choice "A"), with the member's own logo and name on it.
- QR codes are sharp at any size and scan reliably.
- After a member replaces a code, the kit always gives the new one, and the page tells them to reprint.

## Non-goals

- No Canva, no design editor, no layout or color choices for members. The kit is one fixed design.
- No 5×7 or full-page sign (not chosen for now).
- No print-shop "bleed" files. The design keeps a white border, so it doesn't need one.
- No emailing the kit, and no server-side PDF generation.
- No Scan Pass logo design. There isn't one; the Guild logo stands in (as on the pass's own phone icon, `public/tap-card/icon-512.png`).

## Anti-goals (fails even if it "works")

- A file that prints at the wrong size or blurs on a normal home printer.
- A QR that is hard to scan: low contrast, too small, a colored or dark background behind it, or a logo over it.
- The staff QR on anything customers see. The staff card carries "Staff only — keep behind the counter".
- Wording on the plate that promises something the member doesn't offer. For example, a member who isn't a Beer Trail stop must not show a Beer Trail offer.
- The staff code leaving the member's computer. QR codes are made in the browser today; keep it that way.

## Constraints

- **Where it lives:** the member's Scan Pass section (`src/components/portal/TapCardSection.tsx`, near `CounterPlateCard`). It must also show on `/admin/scan-pass` (Edit as them), which renders the same section.
- **Plastic-card features are hidden** (commit e0606be). The kit covers only the counter plate (`/t/<code>`) and staff QR (`/s/<token>`).
- **Logos** are PNG or WebP uploads. The logo sits on the member's chosen logo tile, using the shared `logoBackgroundColor(background, theme)` from `src/lib/members/logo-background.ts`, as on the profile and directory. The tile must match every other surface.
- **Fonts:** Bricolage Grotesque (headings) and Chivo (text). Both use the SIL Open Font License, so they can be built into the PDFs.
- **US spelling.** The look follows the site's design language in `docs/design/README.md`.
- Before this goes live, the Member Guide (HTML and PDF) gets a short "Print your counter plate" section.

## Approaches considered

1. **The browser makes the PDF (chosen).** A "Print kit" box with three download buttons; each PDF is built on the member's computer.
   - Exact size, and the same file works at home or at a print shop.
   - The codes never leave the browser.
   - Costs a PDF library loaded only when the kit is used.
2. **A print page plus the browser's Print button** (like the demo kit's `print-sheet.html`). Simplest to build. But home printers often shrink the page ("Fit to page") or add margins with web addresses, and a print shop needs the member to know to choose "Save as PDF". Too fiddly for non-technical members.
3. **The server makes the PDF.** Same file as option 1, but the private staff code passes through the server, and the Worker has to handle fonts and file sizes. Nothing a member would notice over option 1.

Owner picked **1**.

## The design (decided)

**Counter card, 4×6 portrait, white background:**
- Top band in the Scan Pass color: Guild logo + "INLAND SCAN PASS".
- A large QR code, black on white, at least 2.5 in wide.
- "SCAN TO CHECK IN" in the heading font.
- One or two lines of **always-true wording** (owner, 2026-11-21). Cards sit on counters for months, but Beer Trail passes are only sometimes on sale (`signedOutButtons` in `src/lib/tap-card/plate.ts` offers only the free pass when `canJoinTrail` is false). So the card never names the paid pass, its price, or the nickel-beer offer. Draft: "Get your free Scan Pass · earn rewards here." The owner checks the final wording in the sample.
  - Beer Trail stops (`trail_eligible`) also get a **BEER TRAIL STOP** badge.
  - Every other member gets the same card without the badge.
  - If a member's trail status changes later, no notice is shown (my call: it's rare, and the Guild tells the member). The kit always reflects the current status, so a fresh download is right.
- Bottom: the member's logo on its logo tile, the member's name, and the printed plate code in small type ("code 68JJ-PT27") as a fallback.

**Table tent:** one letter page, folded in half, giving two faces about 8.5 in wide and 5.5 in tall. The 4×6 card doesn't fit a face, and shrinking it would break the 2.5 in QR minimum. So each face gets a **landscape layout** of the same content (my call): the QR on the left, and on the right the band, "SCAN TO CHECK IN", the wording, the badge and the member's logo and name. One face is printed upside down, so both read upright when it stands. The owner reviews a tent sample too.

**Staff card:** business-card size, 3.5×2 in. Plain:
- "STAFF ONLY · keep behind the counter"
- the staff QR
- the staff QR's printed code in small type (e.g. "Y77A-Q0GA"), so staff can tell an old card from a current one after "Make a new staff QR". This is my call; the code also appears on today's PNG download.
- the member's name
- one line: "After a customer chooses at the plate, hold this up for them to scan."
- **No 4-digit backup staff code** (owner, 2026-11-21). Staff learn it by heart, so changing it never means reprinting cards, and handed-around cards don't spread it. Because the card doesn't depend on the 4-digit code, it can be downloaded even when no 4-digit code is set.

**Files:**
- 4×6: two cards per letter page, so there's a spare.
- Table tent: one per page.
- Staff card: four per letter page, enough for several staff.
- Every page has thin gray cut lines (and a dashed fold line on the tent), plus a small footer outside the cut area: "Print at 100% / Actual size. Cut on the gray lines."
- File names: `scan-pass-counter-card-<member-slug>.pdf`, `…-table-tent-…`, `…-staff-cards-…`.

**After a code is replaced:**
- The kit reads the current codes when the member clicks a download, so it always uses the new ones.
- Pressing "Make a new plate link" or "Make a new staff QR" shows a notice: reprint the counter card and table tent, or the staff cards.

**The existing PNG downloads stay** (some members may want the bare QR for their own designs). The Print kit box sits above them.

## Left to the builder

- The PDF library (pdf-lib with fontkit is the obvious fit). Load it only when the kit is used.
- How to embed fonts (TTF files in the repo, since Google's WOFF2 can't be embedded), WebP logos (convert in a canvas) and the Guild's SVG logo (rasterize at print resolution, at least 300 dpi, or draw it as vector).
- Drawing the QR as vector shapes from the `qrcode` package's module matrix, with error correction "M" and a quiet zone of at least 4 modules.
- Exact type sizes, spacing and the Scan Pass band color, using the site's tokens. The look gets one owner review: the builder shows sample PDFs of all three pieces (counter card, table tent, staff cards) for Sample Brewery #1 before finishing.
- A member with no logo yet: show their name only, with no empty tile.
- Tests for the parts that don't need drawing: the wording rules by member kind, file names, page and cut-line geometry.
