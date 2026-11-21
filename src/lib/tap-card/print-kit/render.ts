import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { PLATE_COPY, STAFF_COPY, plateCodeLine, printFooter, type KitPiece } from "./copy";
import {
  COUNTER_PAGE,
  STAFF_PAGE,
  TENT_PAGE,
  containRect,
  counterCardSlots,
  cutLines,
  fitFontSize,
  staffCardSlots,
  tentFaces,
  tentFoldLine,
  type Line,
  type Rect,
} from "./layout";
import { drawQr } from "./qr-vector";
import type { KitFontBytes, KitImageBytes, PrintKitInput } from "./types";

/** Site tokens (docs/design/README.md). */
const BRAND = hex("#B3591F");
const INK = hex("#241F1A");
const MUTED = hex("#6B6156");
const CUT = hex("#9A9083");
const WHITE = rgb(1, 1, 1);

function hex(value: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Kit = {
  doc: PDFDocument;
  heading: PDFFont;
  body: PDFFont;
  semi: PDFFont;
  guildLogo: PDFImage | null;
  memberLogo: PDFImage | null;
};

async function startKit(fonts: KitFontBytes, images: KitImageBytes): Promise<Kit> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [heading, body, semi] = await Promise.all([
    doc.embedFont(fonts.heading, { subset: true }),
    doc.embedFont(fonts.body, { subset: true }),
    doc.embedFont(fonts.bodySemi, { subset: true }),
  ]);
  const guildLogo = images.guildLogoPng ? await doc.embedPng(images.guildLogoPng) : null;
  const memberLogo = images.memberLogoPng ? await doc.embedPng(images.memberLogoPng) : null;
  return { doc, heading, body, semi, guildLogo, memberLogo };
}

/**
 * Draws in a card's own coordinates (origin at its bottom-left). A rotated
 * surface is the tent's top face: everything is turned 180 degrees so it
 * reads upright once the page is folded.
 */
class Surface {
  constructor(
    private page: PDFPage,
    private area: Rect,
    private rotated = false,
  ) {}

  get w() {
    return this.area.w;
  }
  get h() {
    return this.area.h;
  }

  /** Where a local point lands on the page. */
  private at(x: number, y: number) {
    return this.rotated
      ? { x: this.area.x + this.area.w - x, y: this.area.y + this.area.h - y }
      : { x: this.area.x + x, y: this.area.y + y };
  }

  rect(r: Rect, color: RGB) {
    const p = this.at(r.x, r.y);
    this.page.drawRectangle({ ...p, width: r.w, height: r.h, color, rotate: degrees(this.rotated ? 180 : 0) });
  }

  text(text: string, x: number, y: number, size: number, font: PDFFont, color: RGB) {
    this.page.drawText(text, { ...this.at(x, y), size, font, color, rotate: degrees(this.rotated ? 180 : 0) });
  }

  centered(text: string, cx: number, y: number, size: number, font: PDFFont, color: RGB) {
    this.text(text, cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color);
  }

  image(img: PDFImage, box: Rect) {
    const r = containRect(box, img.width, img.height);
    const p = this.at(r.x, r.y);
    this.page.drawImage(img, { ...p, width: r.w, height: r.h, rotate: degrees(this.rotated ? 180 : 0) });
  }

  /** A QR scans upside down too, so it is drawn unrotated at the mapped square. */
  qr(url: string, box: Rect) {
    const page = this.rotated
      ? { x: this.area.x + this.area.w - box.x - box.w, y: this.area.y + this.area.h - box.y - box.h, w: box.w, h: box.h }
      : { x: this.area.x + box.x, y: this.area.y + box.y, w: box.w, h: box.h };
    drawQr(this.page, url, page);
  }
}

function drawLines(page: PDFPage, lines: Line[]) {
  for (const l of lines) {
    page.drawLine({
      start: { x: l.x1, y: l.y1 },
      end: { x: l.x2, y: l.y2 },
      thickness: 0.5,
      color: CUT,
      dashArray: l.dashed ? [6, 4] : undefined,
    });
  }
}

function footer(page: PDFPage, kit: Kit, piece: KitPiece, y: number) {
  const text = printFooter(piece);
  const size = 9;
  page.drawText(text, { x: (page.getWidth() - kit.body.widthOfTextAtSize(text, size)) / 2, y, size, font: kit.body, color: MUTED });
}

/** Greedy word wrap. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A member name in at most two lines: one line, shrunk from startSize; if
 * it still doesn't fit at minSize, wrapped onto two lines at minSize, and the
 * second line shortened with "…" if even that runs over.
 */
function fitName(name: string, font: PDFFont, maxWidth: number, startSize: number, minSize: number) {
  const size = fitFontSize(name, maxWidth, startSize, minSize, (z) => font.widthOfTextAtSize(name, z));
  if (font.widthOfTextAtSize(name, size) <= maxWidth) return { size, lines: [name] };
  const lines = wrap(name, font, minSize, maxWidth);
  const first = lines[0];
  let second = lines.slice(1).join(" ");
  const fits = (t: string) => font.widthOfTextAtSize(t, minSize) <= maxWidth;
  if (lines.length > 2 || !fits(second)) {
    while (second.length > 1 && !fits(`${second}…`)) second = second.slice(0, -1).trimEnd();
    second = `${second}…`;
  }
  // A single word longer than the column: shorten it too.
  let head = first;
  while (head.length > 1 && !fits(head)) head = head.slice(0, -1);
  return { size: minSize, lines: second ? [head, second] : [head] };
}

/** The orange Scan Pass band: Guild logo tile + "INLAND SCAN PASS". */
function band(s: Surface, kit: Kit, box: Rect) {
  s.rect(box, BRAND);
  const pad = 7;
  const logoSize = box.h - 2 * pad;
  let textX = box.x + 12;
  if (kit.guildLogo) {
    s.image(kit.guildLogo, { x: box.x + pad, y: box.y + pad, w: logoSize, h: logoSize });
    textX = box.x + pad + logoSize + 10;
  }
  const size = fitFontSize(PLATE_COPY.band, box.x + box.w - textX - 8, 16, 9, (z) => kit.heading.widthOfTextAtSize(PLATE_COPY.band, z));
  s.text(PLATE_COPY.band, textX, box.y + (box.h - size * 0.7) / 2, size, kit.heading, WHITE);
}

function trailBadge(s: Surface, kit: Kit, cx: number, y: number) {
  const size = 8;
  const w = kit.semi.widthOfTextAtSize(PLATE_COPY.trailBadge, size) + 16;
  s.rect({ x: cx - w / 2, y, w, h: 16 }, INK);
  s.centered(PLATE_COPY.trailBadge, cx, y + 5, size, kit.semi, WHITE);
}

/** Member logo tile (only with a logo), name and plate code, in a row starting at x. */
function memberRow(s: Surface, kit: Kit, input: PrintKitInput, x: number, y: number, maxW: number, tile: number) {
  let textX = x;
  if (kit.memberLogo) {
    s.rect({ x, y, w: tile, h: tile }, hex(input.logoTileColor));
    s.image(kit.memberLogo, { x: x + 4, y: y + 4, w: tile - 8, h: tile - 8 });
    textX = x + tile + 10;
  }
  const room = x + maxW - textX;
  const name = fitName(input.memberName, kit.semi, room, 14, 7);
  const lineGap = name.size + 2;
  let nameY = y + tile / 2 + 2 + (name.lines.length - 1) * (lineGap / 2);
  for (const line of name.lines) {
    s.text(line, textX, nameY, name.size, kit.semi, INK);
    nameY -= lineGap;
  }
  s.text(plateCodeLine(input.printedCode), textX, nameY + lineGap - 14, 8, kit.body, MUTED);
}

/** One 4x6 counter card in its own coordinates (288 x 432). */
function counterCard(s: Surface, kit: Kit, input: PrintKitInput) {
  const cx = s.w / 2;
  const inset = 12;
  const bandH = 54;
  const bandTop = s.h - inset;
  band(s, kit, { x: inset, y: bandTop - bandH, w: s.w - 2 * inset, h: bandH });
  if (input.trailStop) trailBadge(s, kit, cx, bandTop - bandH - 22);
  // As big as the card allows (owner, 2026-11-21): the box's white margin is
  // what separates it from the badge above and the headline below.
  const qr = 232;
  const qrY = bandTop - bandH - 24 - qr;
  s.qr(input.plateUrl, { x: cx - qr / 2, y: qrY, w: qr, h: qr });
  s.centered(PLATE_COPY.headline, cx, qrY - 20, 20, kit.heading, INK);
  const lineSize = fitFontSize(PLATE_COPY.line, s.w - 36, 10, 7, (z) => kit.body.widthOfTextAtSize(PLATE_COPY.line, z));
  s.centered(PLATE_COPY.line, cx, qrY - 35, lineSize, kit.body, MUTED);
  memberRow(s, kit, input, 18, 18, s.w - 36, 44);
}

/** One tent face in its own coordinates (612 x 396): QR left, the rest right. */
function tentFace(s: Surface, kit: Kit, input: PrintKitInput) {
  const margin = 36;
  const qr = 236;
  s.qr(input.plateUrl, { x: margin, y: (s.h - qr) / 2, w: qr, h: qr });
  const colX = margin + qr + 28;
  const colW = s.w - margin - colX;
  const cx = colX + colW / 2;
  const top = s.h - margin;
  band(s, kit, { x: colX, y: top - 50, w: colW, h: 50 });
  if (input.trailStop) trailBadge(s, kit, cx, top - 50 - 28);
  s.centered(PLATE_COPY.headline, cx, top - 50 - 70, 26, kit.heading, INK);
  const lineSize = fitFontSize(PLATE_COPY.line, colW, 12, 7, (z) => kit.body.widthOfTextAtSize(PLATE_COPY.line, z));
  s.centered(PLATE_COPY.line, cx, top - 50 - 92, lineSize, kit.body, MUTED);
  memberRow(s, kit, input, colX, margin, colW, 50);
}

/**
 * One portrait staff card in its own coordinates (144 x 252), centered top to
 * bottom: STAFF ONLY, the staff QR, its printed code, the member name, how to use it.
 */
function staffCard(s: Surface, kit: Kit, input: PrintKitInput) {
  const pad = 10;
  const colW = s.w - 2 * pad;
  const cx = s.w / 2;
  const eyebrow = wrap(STAFF_COPY.eyebrow, kit.semi, 7.5, colW);
  const name = fitName(input.memberName, kit.semi, colW, 11, 6.5);
  const howTo = wrap(STAFF_COPY.howTo, kit.body, 7, colW);
  // Block height from the first baseline down to the last, so it sits centered on the card.
  const block = eyebrow.length * 9.5 + 2 + colW + 9 + 16 + name.lines.length * (name.size + 2) + 4 + (howTo.length - 1) * 9;
  let y = Math.min(s.h - pad - 8, (s.h + block) / 2);
  for (const line of eyebrow) {
    s.centered(line, cx, y, 7.5, kit.semi, INK);
    y -= 9.5;
  }
  const qr = colW;
  const qrY = y - 2 - qr;
  s.qr(input.staffQrUrl, { x: pad, y: qrY, w: qr, h: qr });
  y = qrY - 9;
  s.centered(input.staffQrPrinted, cx, y, 7, kit.body, MUTED);
  y -= 16;
  for (const line of name.lines) {
    s.centered(line, cx, y, name.size, kit.semi, INK);
    y -= name.size + 2;
  }
  y -= 4;
  for (const line of howTo) {
    s.centered(line, cx, y, 7, kit.body, MUTED);
    y -= 9;
  }
}

/** Two 4x6 counter cards on landscape letter, with cut lines. */
export async function buildCounterCardsPdf(input: PrintKitInput, fonts: KitFontBytes, images: KitImageBytes): Promise<Uint8Array> {
  const kit = await startKit(fonts, images);
  const page = kit.doc.addPage([COUNTER_PAGE.width, COUNTER_PAGE.height]);
  const slots = counterCardSlots();
  for (const slot of slots) counterCard(new Surface(page, slot), kit, input);
  drawLines(page, cutLines(slots));
  footer(page, kit, "counter-card", 40);
  return kit.doc.save();
}

/** One letter page folded in half; the top face is upside down. */
export async function buildTableTentPdf(input: PrintKitInput, fonts: KitFontBytes, images: KitImageBytes): Promise<Uint8Array> {
  const kit = await startKit(fonts, images);
  const page = kit.doc.addPage([TENT_PAGE.width, TENT_PAGE.height]);
  for (const face of tentFaces()) tentFace(new Surface(page, face.rect, face.rotated), kit, input);
  drawLines(page, [tentFoldLine()]);
  // No print footer: both faces face customers once folded, and there's no
  // cut-away area to put it in. The Print kit box tells members to print at 100%.
  return kit.doc.save();
}

/** Four staff cards on portrait letter, with cut lines. Never the 4-digit staff code. */
export async function buildStaffCardsPdf(input: PrintKitInput, fonts: KitFontBytes, _images: KitImageBytes): Promise<Uint8Array> {
  // The staff card is plain: no logos (spec). `_images` keeps the three builders' signatures alike.
  const kit = await startKit(fonts, { guildLogoPng: null, memberLogoPng: null });
  const page = kit.doc.addPage([STAFF_PAGE.width, STAFF_PAGE.height]);
  const slots = staffCardSlots();
  for (const slot of slots) staffCard(new Surface(page, slot), kit, input);
  drawLines(page, cutLines(slots));
  footer(page, kit, "staff-cards", 40);
  return kit.doc.save();
}
