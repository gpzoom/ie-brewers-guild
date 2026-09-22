import { describe, expect, it } from "vitest";
import { initialCropForAspect, panCropRect, zoomCropRect } from "./crop-interaction";

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
    const crop = zoomCropRect({ x: 0.3, y: 0, w: 0.4, h: 1 }, 0.1);
    expect(crop.w).toBe(1);
    expect(crop.x).toBe(0);
  });
});
