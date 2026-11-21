import { describe, expect, it } from "vitest";
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
} from "./layout";

describe("print-kit layout", () => {
  it("puts two 4x6 cards on a landscape letter page", () => {
    expect(COUNTER_PAGE).toEqual({ width: 792, height: 612 });
    expect(counterCardSlots()).toEqual([
      { x: 90, y: 90, w: 288, h: 432 },
      { x: 414, y: 90, w: 288, h: 432 },
    ]);
  });

  it("puts four staff cards in a centered 2x2 grid", () => {
    const slots = staffCardSlots();
    expect(STAFF_PAGE).toEqual({ width: 612, height: 792 });
    expect(slots).toHaveLength(4);
    for (const s of slots) {
      expect([s.w, s.h]).toEqual([252, 144]);
      expect(s.x).toBeGreaterThanOrEqual(18);
      expect(s.y).toBeGreaterThanOrEqual(18);
      expect(s.x + s.w).toBeLessThanOrEqual(612 - 18);
      expect(s.y + s.h).toBeLessThanOrEqual(792 - 18);
    }
    const xs = [...new Set(slots.map((s) => s.x))].sort((a, b) => a - b);
    const ys = [...new Set(slots.map((s) => s.y))].sort((a, b) => a - b);
    expect(xs[1] - (xs[0] + 252)).toBe(36);
    expect(ys[1] - (ys[0] + 144)).toBe(36);
    expect(xs[0]).toBe(612 - (xs[1] + 252));
    expect(ys[0]).toBe(792 - (ys[1] + 144));
  });

  it("splits the tent page into two faces, the top one upside down", () => {
    expect(TENT_PAGE).toEqual({ width: 612, height: 792 });
    expect(tentFaces()).toEqual([
      { rect: { x: 0, y: 0, w: 612, h: 396 }, rotated: false },
      { rect: { x: 0, y: 396, w: 612, h: 396 }, rotated: true },
    ]);
    expect(tentFoldLine()).toEqual({ x1: 0, y1: 396, x2: 612, y2: 396, dashed: true });
  });

  it("draws four solid cut lines per slot", () => {
    const lines = cutLines([{ x: 10, y: 20, w: 100, h: 50 }]);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => !l.dashed)).toBe(true);
    expect(lines).toContainEqual({ x1: 10, y1: 20, x2: 110, y2: 20, dashed: false });
    expect(lines).toContainEqual({ x1: 10, y1: 70, x2: 110, y2: 70, dashed: false });
    expect(lines).toContainEqual({ x1: 10, y1: 20, x2: 10, y2: 70, dashed: false });
    expect(lines).toContainEqual({ x1: 110, y1: 20, x2: 110, y2: 70, dashed: false });
  });

  it("containRect keeps the aspect ratio and centers", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    expect(containRect(box, 400, 100)).toEqual({ x: 0, y: 37.5, w: 100, h: 25 });
    expect(containRect(box, 100, 400)).toEqual({ x: 37.5, y: 0, w: 25, h: 100 });
    expect(containRect({ x: 10, y: 10, w: 50, h: 20 }, 50, 20)).toEqual({ x: 10, y: 10, w: 50, h: 20 });
  });

  it("fitFontSize shrinks long text but never below the minimum", () => {
    const widthAt = (text: string) => (size: number) => text.length * size * 0.5;
    expect(fitFontSize("Short", 200, 20, 8, widthAt("Short"))).toBe(20);
    const long = "A very long brewery name that will not fit at all";
    const size = fitFontSize(long, 200, 20, 8, widthAt(long));
    expect(widthAt(long)(size)).toBeLessThanOrEqual(200);
    expect(size).toBeLessThan(20);
    expect(fitFontSize(long, 10, 20, 8, widthAt(long))).toBe(8);
  });
});
