import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { PDFDocument, PDFPage, rgb, type PDFFont } from "pdf-lib";
import { buildCounterCardsPdf, buildStaffCardsPdf, buildTableTentPdf } from "./render";
import { counterCardSlots } from "./layout";
import type { KitFontBytes, KitImageBytes, PrintKitInput } from "./types";

const dir = join(process.cwd(), "public", "fonts", "print-kit");
const fonts: KitFontBytes = {
  heading: readFileSync(join(dir, "BricolageGrotesque-ExtraBold.ttf")),
  body: readFileSync(join(dir, "Chivo-Regular.ttf")),
  bodySemi: readFileSync(join(dir, "Chivo-SemiBold.ttf")),
};
const TILE = "#123456";
const input: PrintKitInput = {
  memberName: "Sample Brewery #1",
  memberSlug: "sample-brewery-1",
  trailStop: true,
  logoTileColor: TILE,
  plateUrl: "https://example.com/t/68JJPT27",
  printedCode: "68JJ-PT27",
  staffQrUrl: "https://example.com/s/Y77AQ0GA",
  staffQrPrinted: "Y77A-Q0GA",
};
const noImages: KitImageBytes = { guildLogoPng: null, memberLogoPng: null };
let pngLogo: Uint8Array;

beforeAll(async () => {
  pngLogo = await QRCode.toBuffer("logo", { width: 10 });
});
afterEach(() => vi.restoreAllMocks());

async function pageSize(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  return doc.getPage(0).getSize();
}
const tileColor = rgb(0x12 / 255, 0x34 / 255, 0x56 / 255);
const isTile = (o: { color?: unknown } | undefined) => JSON.stringify(o?.color) === JSON.stringify(tileColor);
function texts(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((c) => c[0] as string);
}

describe("print-kit PDFs", () => {
  it("makes one page of the right size for each piece", async () => {
    expect(await pageSize(await buildCounterCardsPdf(input, fonts, noImages))).toEqual({ width: 792, height: 612 });
    expect(await pageSize(await buildTableTentPdf(input, fonts, noImages))).toEqual({ width: 612, height: 792 });
    expect(await pageSize(await buildStaffCardsPdf(input, fonts, noImages))).toEqual({ width: 612, height: 792 });
  });

  it("counter card without a logo draws no tile", async () => {
    const spy = vi.spyOn(PDFPage.prototype, "drawRectangle");
    await buildCounterCardsPdf(input, fonts, noImages);
    expect(spy.mock.calls.filter((c) => isTile(c[0])).length).toBe(0);
    spy.mockClear();
    await buildCounterCardsPdf(input, fonts, { guildLogoPng: null, memberLogoPng: pngLogo });
    expect(spy.mock.calls.filter((c) => isTile(c[0])).length).toBe(2);
  });

  it("long name stays inside the card", async () => {
    const long = { ...input, memberName: "The Extraordinarily Long Name Brewing Company #2" };
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    await buildCounterCardsPdf(long, fonts, { guildLogoPng: null, memberLogoPng: pngLogo });
    const nameCalls = spy.mock.calls.filter((c) => c[0] === long.memberName);
    expect(nameCalls).toHaveLength(2);
    const slots = counterCardSlots();
    for (const [i, call] of nameCalls.entries()) {
      const o = call[1]!;
      const width = (o.font as PDFFont).widthOfTextAtSize(long.memberName, o.size!);
      expect(o.x!).toBeGreaterThanOrEqual(slots[i].x);
      expect(o.x! + width).toBeLessThanOrEqual(slots[i].x + slots[i].w);
    }
  });

  it("staff cards print the staff QR code but no 4-digit code", async () => {
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    await buildStaffCardsPdf(input, fonts, noImages);
    const all = texts(spy);
    expect(all).toContain("Y77A-Q0GA");
    for (const t of all) expect(t).not.toMatch(/\b\d{4}\b/);
  });

  it("prints the trail badge only for trail stops", async () => {
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    await buildCounterCardsPdf(input, fonts, noImages);
    expect(texts(spy)).toContain("BEER TRAIL STOP");
    spy.mockClear();
    await buildCounterCardsPdf({ ...input, trailStop: false }, fonts, noImages);
    expect(texts(spy)).not.toContain("BEER TRAIL STOP");
    spy.mockClear();
    await buildTableTentPdf({ ...input, trailStop: false }, fonts, noImages);
    expect(texts(spy)).not.toContain("BEER TRAIL STOP");
  });
});
