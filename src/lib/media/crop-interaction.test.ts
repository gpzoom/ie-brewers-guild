import { describe, expect, it } from "vitest";
import {
  cropMatchesAspect,
  fitCropToAspect,
  initialCropForAspect,
  panCropRect,
  zoomCropRect,
} from "./crop-interaction";

describe("initialCropForAspect", () => {
  it("crops the sides of a wider-than-target image", () => {
    const crop = initialCropForAspect(2000, 1000, 4 / 5); // 2:1 original, 4:5 target
    expect(crop.h).toBe(1);
    expect(crop.w).toBeCloseTo(0.4, 5);
    expect(crop.x).toBeCloseTo(0.3, 5);
    expect(crop.y).toBe(0);
  });

  it("crops the top/bottom of a taller-than-target image", () => {
    const crop = initialCropForAspect(1000, 2000, 4 / 5); // 0.5 original, 4:5 target
    expect(crop.w).toBe(1);
    expect(crop.h).toBeCloseTo(0.625, 5);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo(0.1875, 5);
  });

  it("returns the identity crop when the original already matches the target aspect", () => {
    expect(initialCropForAspect(400, 500, 4 / 5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("panCropRect", () => {
  it("pans within bounds", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 0.1, 0)).toEqual({ x: 0.4, y: 0, w: 0.4, h: 1 });
  });

  it("clamps panning at the right edge", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 10, 0).x).toBeCloseTo(0.6, 5);
  });

  it("clamps panning at the left edge", () => {
    expect(panCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, -10, 0).x).toBe(0);
  });
});

describe("zoomCropRect", () => {
  it("zooming in shrinks the crop window around its center", () => {
    const crop = zoomCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 2);
    expect(crop.w).toBeCloseTo(0.2, 5);
    expect(crop.x).toBeCloseTo(0.4, 5);
  });

  it("zooming out never exceeds the full original", () => {
    const crop = zoomCropRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.5 }, 0.1);
    expect(crop.h).toBe(1);
    expect(crop.w).toBeCloseTo(0.8, 5);
    expect(crop.y).toBe(0);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("zooming out is a no-op once one side already spans the full original", () => {
    expect(zoomCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 0.5)).toEqual({ x: 0.3, y: 0, w: 0.4, h: 1 });
  });

  it("preserves the crop's aspect ratio when a side hits a bound", () => {
    const before = { x: 0.1, y: 0.3, w: 0.8, h: 0.32 };
    const zoomedOut = zoomCropRect(before, 0.5);
    expect(zoomedOut.w / zoomedOut.h).toBeCloseTo(before.w / before.h, 6);
    expect(zoomedOut.w).toBeCloseTo(1, 6);

    const zoomedIn = zoomCropRect(before, 1000);
    expect(zoomedIn.w / zoomedIn.h).toBeCloseTo(before.w / before.h, 6);
    expect(Math.min(zoomedIn.w, zoomedIn.h)).toBeCloseTo(0.05, 6);
  });

  it("keeps the zoomed crop inside the image", () => {
    const crop = zoomCropRect({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 0.5);
    expect(crop.w).toBeCloseTo(0.2, 6);
    expect(crop.x).toBeCloseTo(0.8, 6);
    expect(crop.y).toBeCloseTo(0.8, 6);
  });
});

describe("cropMatchesAspect", () => {
  it("compares the real pixel aspect, not the fractional one", () => {
    // 3000x2000 original: w=1, h=0.6 -> 3000 / 1200 = 2.5
    expect(cropMatchesAspect({ x: 0, y: 0.2, w: 1, h: 0.6 }, 3000, 2000, 2.5)).toBe(true);
    // The legacy full-image fallback on the same photo is 1.5, not 2.5.
    expect(cropMatchesAspect({ x: 0, y: 0, w: 1, h: 1 }, 3000, 2000, 2.5)).toBe(false);
  });
});

describe("fitCropToAspect", () => {
  it("turns the legacy full-image crop into the centered fill", () => {
    const fitted = fitCropToAspect({ x: 0, y: 0, w: 1, h: 1 }, 3000, 2000, 2.5);
    const expected = initialCropForAspect(3000, 2000, 2.5);
    expect(fitted.x).toBeCloseTo(expected.x, 6);
    expect(fitted.y).toBeCloseTo(expected.y, 6);
    expect(fitted.w).toBeCloseTo(expected.w, 6);
    expect(fitted.h).toBeCloseTo(expected.h, 6);
  });

  it("returns the same crop when it already matches", () => {
    const crop = { x: 0, y: 0.2, w: 1, h: 0.6 };
    expect(fitCropToAspect(crop, 3000, 2000, 2.5)).toBe(crop);
  });

  it("keeps the same center when there's room", () => {
    const fitted = fitCropToAspect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1000, 1000, 4 / 5);
    expect(cropMatchesAspect(fitted, 1000, 1000, 4 / 5)).toBe(true);
    expect(fitted.x + fitted.w / 2).toBeCloseTo(0.5, 6);
    expect(fitted.y + fitted.h / 2).toBeCloseTo(0.5, 6);
  });

  it("stays inside the image for an off-center crop", () => {
    const fitted = fitCropToAspect({ x: 0.7, y: 0, w: 0.3, h: 1 }, 2000, 1000, 2.5);
    expect(cropMatchesAspect(fitted, 2000, 1000, 2.5)).toBe(true);
    expect(fitted.x).toBeGreaterThanOrEqual(0);
    expect(fitted.y).toBeGreaterThanOrEqual(0);
    expect(fitted.x + fitted.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(fitted.y + fitted.h).toBeLessThanOrEqual(1 + 1e-9);
  });
});
