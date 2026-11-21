# Scan Pass Print Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Print kit" box on a member's Scan Pass page. It downloads three exact-size, print-ready PDFs, built in the browser: a 4×6 counter card, a folded table tent, and staff cards.

**Architecture:** Pure modules under `src/lib/tap-card/print-kit/` (wording, page geometry, vector QR, PDF renderers) take plain inputs and already-embedded fonts and images, so Vitest can run them in Node. The browser-only parts are a thin asset loader (fonts, logos through a canvas) and the `PrintKitCard` component. The component fetches fresh codes and member branding when clicked, lazy-loads the renderer, and saves the file. One new server function returns the member's branding.

**Tech Stack:** TanStack Start (`createServerFn`), React, Supabase, `pdf-lib` + `@pdf-lib/fontkit` (new), `qrcode` (already a dependency), Vitest (Node environment).

**Spec:** `docs/superpowers/specs/2026-11-21-scan-pass-print-kit-design.md`

## Global Constraints

- PDF units are points (72 per inch). Letter = 612 × 792 pt.
- Counter card 4×6 in = 288 × 432 pt. QR on the counter card and on each tent face is **≥ 180 pt (2.5 in)**.
- Staff card 3.5×2 in = 252 × 144 pt. Staff QR ≥ 86 pt (1.2 in). This is my call; the spec sets no minimum.
- QR codes: error correction "M", **quiet zone of 4 modules**, black on white, drawn as vector rectangles. Nothing (logo, band, text) is ever drawn over a QR or its quiet zone.
- Card backgrounds are white. The Scan Pass color is used only in the top band (`#B3591F`, the site's `brand` token). Ink is `#241F1A`, muted text `#6B6156`, cut lines `#9A9083` at 0.5 pt.
- The member's logo sits on a tile filled with `logoBackgroundColor(logo_background, theme)` from `src/lib/members/logo-background.ts`. Never recompute that color yourself.
- Codes never leave the browser: the PDFs are built client-side, and no code or PDF is sent to any server or third party.
- US spelling. Exact copy lives in `copy.ts` (Task 2). Don't retype strings anywhere else.
- `npm run build` must pass before any push to `staging` (it needs `.env` with the three `VITE_*` keys). Push to `staging` only, never `main`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write the message to a file and use `git commit -F` (PowerShell here-strings fail here).

## Review Focus

1. **Member with no logo:** name only, no empty tile, no crash. *(Task 5 test `counter card without a logo draws no tile`.)*
2. **Very long member name** (e.g. 48 characters): the text shrinks to fit or wraps within the card, never spills past the cut line. *(Task 3 test `fitFontSize`; Task 5 test `long name stays inside the card`.)*
3. **Logo that won't load** (network or CORS failure, or a WebP the canvas can't decode): the kit still downloads, falling back to name only. *(Task 6 test `loadLogo returns null on failure`; the renderer handles `null` per #1.)*
4. **Tall or wide logos:** aspect ratio kept, contained inside the tile, never stretched. *(Task 3 test `containRect`.)*
5. **Download right after "Make a new plate link" / "Make a new staff QR":** the PDF must carry the new code. The kit fetches `getCounterPlate` at click time and never reuses cached state. *(Task 7 step: fetch-on-click. Checked by hand on staging.)*

---

## File Structure

| File | Responsibility |
|---|---|
| `public/fonts/print-kit/*.ttf`, `OFL.txt` | Static TTFs: Bricolage Grotesque 800, Chivo 400 and 600 |
| `src/lib/tap-card/print-kit/copy.ts` | Every printed string, and the file names |
| `src/lib/tap-card/print-kit/layout.ts` | Page and card rectangles, cut and fold lines, `containRect`, `fitFontSize` |
| `src/lib/tap-card/print-kit/qr-vector.ts` | QR module matrix, and drawing it as rectangles on a pdf-lib page |
| `src/lib/tap-card/print-kit/render.ts` | `buildCounterCardsPdf`, `buildTableTentPdf`, `buildStaffCardsPdf` |
| `src/lib/tap-card/print-kit/types.ts` | `PrintKitInput`, `KitFonts`, `KitImages` |
| `src/lib/tap-card/print-kit/assets.ts` | Browser only: fetch fonts, load logos to PNG through a canvas |
| `src/lib/tap-card/print-kit-info.ts` | Pure mapping from a member row to `PrintKitInfo` |
| `src/lib/tap-card/print-kit.server.ts` | `getPrintKitInfo` server function |
| `src/components/portal/PrintKitCard.tsx` | The "Print kit" box and its three buttons |
| `src/components/portal/CounterPlateCard.tsx` | Reprint notices after code resets |
| `src/components/portal/TapCardSection.tsx` | Mounts `PrintKitCard` above `CounterPlateCard` |
| `docs/member-guide/member-profile-guide.html` + PDFs | "Print your counter plate" steps |

---

### Task 1: PDF library and fonts

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `public/fonts/print-kit/BricolageGrotesque-ExtraBold.ttf`, `public/fonts/print-kit/Chivo-Regular.ttf`, `public/fonts/print-kit/Chivo-SemiBold.ttf`, `public/fonts/print-kit/OFL.txt`
- Test: `src/lib/tap-card/print-kit/fonts.test.ts`

**Interfaces:**
- Produces: the three TTF files at those exact paths (served at `/fonts/print-kit/<name>.ttf`).

- [ ] **Step 1:** `npm install pdf-lib @pdf-lib/fontkit`.
- [ ] **Step 2: Get static TTFs.** Request `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Chivo:wght@400;600` with an old user agent, e.g. `curl -A "Mozilla/4.0"`. That makes the CSS list `.ttf` URLs for each weight. Download those three files to the names above. Add the SIL Open Font License text as `OFL.txt`, with both families' copyright lines.
- [ ] **Step 3: Write the failing test** `fonts.test.ts`, `embeds every print-kit font`: for each of the three files, read the bytes with `fs`, create a `PDFDocument`, `registerFontkit(fontkit)`, `embedFont(bytes, { subset: true })`, draw "Sample Brewery #1 · SCAN TO CHECK IN", `save()`. Assert the PDF byte length > 1000 and that `font.widthOfTextAtSize("SCAN", 12) > 0`.
- [ ] **Step 4:** `npx vitest run src/lib/tap-card/print-kit/fonts.test.ts`. Expected: PASS. If a file fails to embed, it isn't a static TTF; fetch again.
- [ ] **Step 5:** `npm run build`. Expected: passes.
- [ ] **Step 6: Commit:** "chore(print-kit): pdf-lib, fontkit and the print fonts".

### Task 2: Copy and file names

**Files:**
- Create: `src/lib/tap-card/print-kit/copy.ts`
- Test: `src/lib/tap-card/print-kit/copy.test.ts`

**Interfaces:**
- Produces:
  - `type KitPiece = "counter-card" | "table-tent" | "staff-cards"`
  - `PLATE_COPY: { band: string; headline: string; line: string; trailBadge: string }`
  - `STAFF_COPY: { eyebrow: string; howTo: string }`
  - `plateCodeLine(printedCode: string): string`
  - `printFooter(piece: KitPiece): string`
  - `kitFileName(piece: KitPiece, memberSlug: string): string`
  - `REPRINT_NOTICE: { plate: string; staff: string }`

- [ ] **Step 1: Write the failing tests:**
  - `PLATE_COPY` equals `{ band: "INLAND SCAN PASS", headline: "SCAN TO CHECK IN", line: "Get your free Scan Pass · earn rewards here.", trailBadge: "BEER TRAIL STOP" }`.
  - `STAFF_COPY` equals `{ eyebrow: "STAFF ONLY · keep behind the counter", howTo: "After a customer chooses at the plate, hold this up for them to scan." }`.
  - `plateCodeLine("68JJ-PT27") === "code 68JJ-PT27"`.
  - `printFooter("counter-card")` and `printFooter("staff-cards")` both equal `"Print at 100% / Actual size. Cut on the gray lines."`.
  - `printFooter("table-tent") === "Print at 100% / Actual size. Fold on the dashed line."`
  - `kitFileName("counter-card", "sample-brewery-1") === "scan-pass-counter-card-sample-brewery-1.pdf"`. Same pattern for `table-tent` and `staff-cards`.
  - `kitFileName("counter-card", "")` falls back to `"scan-pass-counter-card.pdf"`.
  - `REPRINT_NOTICE.plate === "New plate link made. Download and print a new counter card and table tent: the old ones no longer work."`
  - `REPRINT_NOTICE.staff === "New staff QR made. Download and print new staff cards: the old ones no longer work."`
  - No string contains the paid pass, a price, or "nickel" (a regex check over all copy values). This is the spec's "always-true wording" rule.
- [ ] **Step 2:** Run the tests. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `copy.ts` with exactly those strings.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** "feat(print-kit): printed copy and file names".

### Task 3: Page geometry

**Files:**
- Create: `src/lib/tap-card/print-kit/layout.ts`
- Test: `src/lib/tap-card/print-kit/layout.test.ts`

**Interfaces:**
- Produces:
  - `type Rect = { x: number; y: number; w: number; h: number }` (pdf-lib coordinates, origin bottom-left)
  - `type Line = { x1: number; y1: number; x2: number; y2: number; dashed: boolean }`
  - `COUNTER_PAGE: { width: 792; height: 612 }` (Letter, landscape) and `counterCardSlots(): Rect[]` (2 slots)
  - `TENT_PAGE: { width: 612; height: 792 }` and `tentFaces(): { rect: Rect; rotated: boolean }[]` (2 faces; the top face `rotated: true`) and `tentFoldLine(): Line`
  - `STAFF_PAGE: { width: 612; height: 792 }` and `staffCardSlots(): Rect[]` (4 slots, a 2×2 grid)
  - `cutLines(slots: Rect[]): Line[]` (each slot's four edges, solid)
  - `containRect(box: Rect, imgW: number, imgH: number): Rect`
  - `fitFontSize(text: string, maxWidth: number, startSize: number, minSize: number, widthAt: (size: number) => number): number`

- [ ] **Step 1: Write the failing tests:**
  - `counterCardSlots()` equals `[{x:90,y:90,w:288,h:432},{x:414,y:90,w:288,h:432}]`.
  - Every staff slot is 252×144. The grid has a 36 pt gap, is centered on the page, and every slot is ≥ 18 pt from every page edge.
  - `tentFaces()` gives two rects of 612×396, bottom `{x:0,y:0}`, top `{x:0,y:396}` with `rotated: true`.
  - `tentFoldLine()` is `{x1:0,y1:396,x2:612,y2:396,dashed:true}`.
  - `cutLines` of one slot returns 4 solid lines on its edges.
  - `containRect({x:0,y:0,w:100,h:100}, 400, 100)` gives `{x:0,y:37.5,w:100,h:25}`. A tall image is centered horizontally.
  - `fitFontSize` returns `startSize` when the text fits, shrinks until `widthAt(size) <= maxWidth`, and never goes below `minSize`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `layout.ts`. `fitFontSize` steps down by 0.5 pt.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit:** "feat(print-kit): page and card geometry".

### Task 4: Vector QR

**Files:**
- Create: `src/lib/tap-card/print-kit/qr-vector.ts`
- Test: `src/lib/tap-card/print-kit/qr-vector.test.ts`

**Interfaces:**
- Produces:
  - `qrMatrix(url: string): { size: number; dark: (row: number, col: number) => boolean }`. Uses `QRCode.create(url, { errorCorrectionLevel: "M" })`.
  - `QUIET_ZONE_MODULES = 4`
  - `drawQr(page: PDFPage, url: string, box: Rect): void`. Fills `box` white, then draws the dark modules as black rectangles, with 4 modules of white margin inside `box`. The box must be square.

- [ ] **Step 1: Write the failing tests:**
  - `qrMatrix("https://example.com/t/68JJPT27").size` ≥ 21, and the three finder-pattern corners are dark at (0,0), (0,size-1), (size-1,0).
  - `drawQr` on a pdf-lib page in a 200×200 box: spy on `page.drawRectangle`. No dark rectangle lies within `4 * (200 / (size + 8))` pt of the box edge. Every rectangle lies inside the box.
  - `drawQr` throws `"QR box must be square"` when `w !== h`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Merge horizontal runs of dark modules into one rectangle per run, to keep the PDF small.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit:** "feat(print-kit): QR codes as vector shapes".

### Task 5: The three PDFs

**Files:**
- Create: `src/lib/tap-card/print-kit/types.ts`, `src/lib/tap-card/print-kit/render.ts`
- Test: `src/lib/tap-card/print-kit/render.test.ts`

**Interfaces:**
- Consumes: Task 2 copy, Task 3 geometry, Task 4 `drawQr`.
- Produces:
  - ```ts
    type PrintKitInput = {
      memberName: string; memberSlug: string; trailStop: boolean;
      logoTileColor: string;             // from logoBackgroundColor
      plateUrl: string; printedCode: string;
      staffQrUrl: string; staffQrPrinted: string;
    };
    type KitFontBytes = { heading: Uint8Array; body: Uint8Array; bodySemi: Uint8Array };
    type KitImageBytes = { guildLogoPng: Uint8Array | null; memberLogoPng: Uint8Array | null };
    ```
  - `buildCounterCardsPdf(input: PrintKitInput, fonts: KitFontBytes, images: KitImageBytes): Promise<Uint8Array>`
  - `buildTableTentPdf(...same...): Promise<Uint8Array>`
  - `buildStaffCardsPdf(...same...): Promise<Uint8Array>`. The staff card uses no logo images; it accepts `images` for a uniform signature.

**Card content (from the spec; spacing is the builder's):**
- **Counter card, top to bottom:**
  - brand band: Guild logo + `PLATE_COPY.band`
  - `trailBadge` when `trailStop`
  - QR ≥ 180 pt
  - `headline` (heading font)
  - `line`
  - bottom row: logo tile (only if `memberLogoPng`), `memberName` (shrunk with `fitFontSize`), `plateCodeLine`
- **Tent face:** the same content in landscape: the QR (≥ 180 pt) on the left; the band, badge, headline, line and logo/name/code on the right. The top face is drawn rotated 180°. The fold line is dashed. No cut lines.
- **Staff card:**
  - `STAFF_COPY.eyebrow`
  - staff QR ≥ 86 pt
  - `staffQrPrinted` in small type
  - `memberName`
  - `howTo`
  - **No 4-digit staff code.** `PrintKitInput` deliberately has no field for it.
- **Every page:** `printFooter(piece)` centered, 9 pt, inside the 18 pt printable margin, outside every card.

- [ ] **Step 1: Write the failing tests.** Load fonts from `public/fonts/print-kit`. Use the input `Sample Brewery #1`, `sample-brewery-1`, codes `68JJ-PT27` / `Y77A-Q0GA`. Re-parse each output with `PDFDocument.load`:
  - The counter PDF has 1 page of 792×612. The tent has 1 page of 612×792. The staff PDF has 1 page of 612×792.
  - `counter card without a logo draws no tile`: with `memberLogoPng: null`, spy on `drawRectangle` calls with `color = logoTileColor`. Expect 0. With a 10×10 PNG, expect 2 (one per card).
  - `long name stays inside the card`: a 48-character name. The drawn text width at the chosen size ≤ card inner width. Spy on `drawText` and measure with the embedded font.
  - Staff PDF: the drawn text includes `"Y77A-Q0GA"` and contains no 4-digit number (regex `/\b\d{4}\b/` over every `drawText` string).
  - Trail badge text is drawn only when `trailStop: true`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `render.ts`. Each builder creates a `PDFDocument`, registers fontkit, embeds the fonts with `{ subset: true }`, embeds the PNGs when present, draws, and returns `save()`.
- [ ] **Step 4:** Run. Expected: PASS. Also write the three PDFs to the scratch directory and look at them once (a visual sanity check, not committed).
- [ ] **Step 5: Commit:** "feat(print-kit): counter card, table tent and staff card PDFs".

### Task 6: Member branding and browser asset loading

**Files:**
- Create: `src/lib/tap-card/print-kit-info.ts`, `src/lib/tap-card/print-kit.server.ts`, `src/lib/tap-card/print-kit/assets.ts`
- Test: `src/lib/tap-card/print-kit-info.test.ts`, `src/lib/tap-card/print-kit/assets.test.ts`

**Interfaces:**
- Produces:
  - `type PrintKitInfo = { memberName: string; memberSlug: string; trailStop: boolean; logoUrl: string | null; logoTileColor: string }`
  - `printKitInfoFromRow(row: { business_name: string; slug: string; logo_background: string | null; theme: string }, trailStop: boolean, logoUrl: string | null): PrintKitInfo`
  - `getPrintKitInfo` = `createServerFn({ method: "GET" })`, input `{ memberId: string }`, returns `PrintKitInfo`. It authorizes with `requireTapCardEditor(memberId)` (which also supplies `trailStop`). It reads the **published** `members` row (`business_name, slug, logo_asset_id, logo_background, theme`). The logo URL is `member-logos` `getPublicUrl(storage_path)` of that asset, the same way `src/lib/home/homepage.server.ts` does it.
  - `loadKitFonts(): Promise<KitFontBytes>`. Fetches the three `/fonts/print-kit/*.ttf` files.
  - `loadLogo(url: string | null, maxPx = 1200): Promise<Uint8Array | null>`. Loads the image into an `Image` with `crossOrigin = "anonymous"`, draws it to a canvas no larger than `maxPx` on its longest side, and returns PNG bytes. Returns **null** on any failure (no URL, network, CORS, decode).
  - `loadGuildLogo(): Promise<Uint8Array | null>`. The same, from the imported `@/assets/logo.svg` URL, at 1200 px.

- [ ] **Step 1: Write the failing tests:**
  - `printKitInfoFromRow` maps the fields. `logoTileColor` equals `logoBackgroundColor(row.logo_background, row.theme)` for `"light"`, `"dark"` and `"theme"`. An unknown background gives `#FFFFFF`.
  - `loadLogo returns null on failure`: with `url = null`, and with a stubbed global `Image` that fires `onerror`, the result is `null` and nothing throws.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the three files. `assets.ts` is imported only from the click handler in Task 7, never at module top level of a route.
- [ ] **Step 4:** Run. Expected: PASS. Then `npm run build`; if the import-protection allowlist in `vite.config.ts` rejects the new `.server.ts`, add it there.
- [ ] **Step 5: Commit:** "feat(print-kit): member branding and logo loading".

### Task 7: Print kit box, reprint notices, staging review

**Files:**
- Create: `src/components/portal/PrintKitCard.tsx`
- Modify: `src/components/portal/TapCardSection.tsx` (mount it above `CounterPlateCard`), `src/components/portal/CounterPlateCard.tsx` (notices)

**Interfaces:**
- Consumes: `getCounterPlate` (existing, `src/lib/tap-card/plate.server.ts`), `getPrintKitInfo`, `loadKitFonts`, `loadLogo`, `loadGuildLogo`, the three builders, `kitFileName`, `REPRINT_NOTICE`.
- Produces: `PrintKitCard({ memberId }: { memberId: string })`.

- [ ] **Step 1: Build `PrintKitCard`:**
  - A white card styled like `CounterPlateCard`'s section.
  - Heading **"Print kit"**.
  - Lead: "Print-ready files for your counter. Print at 100% (Actual size) at home, or take the file to a print shop."
  - Three outline buttons, at least 44 px tall: **"4×6 counter card"**, **"Table tent"**, **"Staff cards"**.
  - **On click:**
    1. Disable all three buttons and show "Making your PDF…".
    2. `await` `getCounterPlate` and `getPrintKitInfo` **fresh, every click**.
    3. `await import("@/lib/tap-card/print-kit/render")` and `assets`.
    4. Load the fonts and logos, build the piece, and save it as a `Blob` through a temporary `<a download={kitFileName(...)}>`.
  - **On error,** show "Couldn't make the PDF. Try again." in a `role="alert"` paragraph.
- [ ] **Step 2: Reprint notices.** In `CounterPlateCard`, after a successful `onReset` show `REPRINT_NOTICE.plate`, and after `onResetStaffQr` show `REPRINT_NOTICE.staff`, each in a `role="status"` line under the matching section.
- [ ] **Step 3:** Run `npx vitest run` (all pass), then `npm run build` (passes).
- [ ] **Step 4: Commit and push to `staging`:** "feat(print-kit): Print kit box on the Scan Pass page". Confirm the deploy by behavior: the box shows on staging.
- [ ] **Step 5: Check by hand on staging** as a Guild admin, using Edit as them on **Sample Brewery #1** (a draft; never publish it):
  - All three downloads open in a PDF viewer at the right size.
  - Press "Make a new plate link", download the counter card again, and confirm the new code is printed. Do the same for the staff QR.
  - Phone-scan each QR from a printed or on-screen PDF.
  - Then hand the owner the three sample PDFs, saved to the scratchpad, for the look-and-wording review the spec requires. Apply their changes before Task 8.

### Task 8: Member Guide

**Files:**
- Modify: `docs/member-guide/member-profile-guide.html` (the "Inland Scan Pass" section near line 419), and the PDFs rebuilt by `scripts/build-member-guides.mjs`

- [ ] **Step 1:** In the setup list, replace the "press **Download QR code**" and "press **Download staff QR**" items with one item:
  > Under **Print kit**, download the **4×6 counter card** (it fits an acrylic stand), the **Table tent** and **Staff cards**. Print at **100% / Actual size**, or take the file to a print shop.

  Keep "Make a new plate link / Make a new staff QR" and add: "then print the kit again".
- [ ] **Step 2:** `node scripts/build-member-guides.mjs`, which uses playwright-core with system Chrome. Check that the three PDFs rebuilt and that the Scan Pass page didn't overflow its page.
- [ ] **Step 3: Commit and push to `staging`:** "docs(guide): Print kit for the counter plate and staff cards".
