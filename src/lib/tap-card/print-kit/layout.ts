/**
 * Page geometry for the Scan Pass print kit, in PDF points (72 per inch),
 * pdf-lib coordinates (origin bottom-left). Letter paper; every card stays at
 * least 18 pt (a quarter inch) from the paper edge, inside what home
 * printers can print.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Line = { x1: number; y1: number; x2: number; y2: number; dashed: boolean };

/** Two 4x6 in portrait cards, side by side on landscape letter. */
export const COUNTER_PAGE = { width: 792, height: 612 } as const;
export const COUNTER_CARD = { w: 288, h: 432 } as const;
const COUNTER_GAP = 36;

export const TENT_PAGE = { width: 612, height: 792 } as const;

/** Four 2x3.5 in portrait staff cards (owner, 2026-11-21), a 2x2 grid on portrait letter. */
export const STAFF_PAGE = { width: 612, height: 792 } as const;
export const STAFF_CARD = { w: 144, h: 252 } as const;
const STAFF_GAP = 36;

export function counterCardSlots(): Rect[] {
  const x0 = (COUNTER_PAGE.width - 2 * COUNTER_CARD.w - COUNTER_GAP) / 2;
  const y = (COUNTER_PAGE.height - COUNTER_CARD.h) / 2;
  return [0, 1].map((i) => ({ x: x0 + i * (COUNTER_CARD.w + COUNTER_GAP), y, ...COUNTER_CARD }));
}

/** Bottom face reads upright as printed; the top face is drawn upside down so both read upright once folded. */
export function tentFaces(): { rect: Rect; rotated: boolean }[] {
  const h = TENT_PAGE.height / 2;
  return [
    { rect: { x: 0, y: 0, w: TENT_PAGE.width, h }, rotated: false },
    { rect: { x: 0, y: h, w: TENT_PAGE.width, h }, rotated: true },
  ];
}

export function tentFoldLine(): Line {
  const y = TENT_PAGE.height / 2;
  return { x1: 0, y1: y, x2: TENT_PAGE.width, y2: y, dashed: true };
}

export function staffCardSlots(): Rect[] {
  const x0 = (STAFF_PAGE.width - 2 * STAFF_CARD.w - STAFF_GAP) / 2;
  const y0 = (STAFF_PAGE.height - 2 * STAFF_CARD.h - STAFF_GAP) / 2;
  const slots: Rect[] = [];
  for (const row of [1, 0]) {
    for (const col of [0, 1]) {
      slots.push({ x: x0 + col * (STAFF_CARD.w + STAFF_GAP), y: y0 + row * (STAFF_CARD.h + STAFF_GAP), ...STAFF_CARD });
    }
  }
  return slots;
}

export function cutLines(slots: Rect[]): Line[] {
  return slots.flatMap(({ x, y, w, h }) => [
    { x1: x, y1: y, x2: x + w, y2: y, dashed: false },
    { x1: x, y1: y + h, x2: x + w, y2: y + h, dashed: false },
    { x1: x, y1: y, x2: x, y2: y + h, dashed: false },
    { x1: x + w, y1: y, x2: x + w, y2: y + h, dashed: false },
  ]);
}

/** The largest rect of the image's aspect ratio that fits in box, centered. */
export function containRect(box: Rect, imgW: number, imgH: number): Rect {
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** startSize if it fits; else step down 0.5 pt until it fits, never below minSize. */
export function fitFontSize(
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  widthAt: (size: number) => number,
): number {
  let size = startSize;
  while (size > minSize && widthAt(size) > maxWidth) size -= 0.5;
  return Math.max(size, minSize);
}
