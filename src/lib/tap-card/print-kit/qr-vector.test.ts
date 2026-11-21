import { describe, expect, it, vi } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { QUIET_ZONE_MODULES, drawQr, qrMatrix } from "./qr-vector";

const URL = "https://example.com/t/68JJPT27";

describe("qrMatrix", () => {
  it("has finder patterns in three corners", () => {
    const m = qrMatrix(URL);
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect(m.dark(0, 0)).toBe(true);
    expect(m.dark(0, m.size - 1)).toBe(true);
    expect(m.dark(m.size - 1, 0)).toBe(true);
    expect(m.dark(m.size - 1, m.size - 1)).toBe(false);
  });
});

describe("drawQr", () => {
  it("draws inside the box and keeps a 4-module quiet zone", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const spy = vi.spyOn(page, "drawRectangle");
    const box = { x: 100, y: 50, w: 200, h: 200 };
    drawQr(page, URL, box);
    const { size } = qrMatrix(URL);
    const module = box.w / (size + 2 * QUIET_ZONE_MODULES);
    const quiet = QUIET_ZONE_MODULES * module;
    const calls = spy.mock.calls.map((c) => c[0]!);
    const black = calls.filter((o) => JSON.stringify(o.color) === JSON.stringify(rgb(0, 0, 0)));
    expect(black.length).toBeGreaterThan(20);
    for (const r of black) {
      expect(r.x!).toBeGreaterThanOrEqual(box.x + quiet - 1e-6);
      expect(r.y!).toBeGreaterThanOrEqual(box.y + quiet - 1e-6);
      expect(r.x! + r.width!).toBeLessThanOrEqual(box.x + box.w - quiet + 1e-6);
      expect(r.y! + r.height!).toBeLessThanOrEqual(box.y + box.h - quiet + 1e-6);
    }
    // the white background covers the whole box first
    expect(calls[0]).toMatchObject({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  });

  it("refuses a box that isn't square", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    expect(() => drawQr(page, URL, { x: 0, y: 0, w: 100, h: 90 })).toThrow("QR box must be square");
  });
});
