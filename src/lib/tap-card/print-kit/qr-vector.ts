import QRCode from "qrcode";
import { rgb, type PDFPage } from "pdf-lib";
import type { Rect } from "./layout";

/** White margin around the code, in modules (the QR standard's quiet zone). */
export const QUIET_ZONE_MODULES = 4;

export type QrMatrix = { size: number; dark: (row: number, col: number) => boolean };

/** The code's modules; row 0 is the top. Same error correction ("M") as the site's PNG downloads. */
export function qrMatrix(url: string): QrMatrix {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: (row, col) => Boolean(modules.get(row, col)) };
}

/**
 * Draws the code as black rectangles on a white square, so it stays sharp at
 * any print size. The box includes the quiet zone; nothing else may be drawn
 * inside it.
 */
export function drawQr(page: PDFPage, url: string, box: Rect): void {
  if (Math.abs(box.w - box.h) > 1e-6) throw new Error("QR box must be square");
  const { size, dark } = qrMatrix(url);
  const module = box.w / (size + 2 * QUIET_ZONE_MODULES);
  const left = box.x + QUIET_ZONE_MODULES * module;
  const bottom = box.y + QUIET_ZONE_MODULES * module;
  const black = rgb(0, 0, 0);

  // Each row reaches a little into the row below it, so viewers and printers
  // don't show hairline seams between rows. The bottom row stays inside the code.
  const overlap = module * 0.08;
  page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  for (let row = 0; row < size; row++) {
    const reach = row < size - 1 ? overlap : 0;
    const y = bottom + (size - 1 - row) * module - reach;
    let col = 0;
    while (col < size) {
      if (!dark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && dark(row, col)) col++;
      page.drawRectangle({ x: left + start * module, y, width: (col - start) * module, height: module + reach, color: black });
    }
  }
}
