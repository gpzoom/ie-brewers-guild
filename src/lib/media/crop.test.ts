import { describe, expect, it } from "vitest";
import { computeCropStyle, cropForWiderFrame } from "./crop";

describe("cropForWiderFrame", () => {
  // The real stored cover from staging that triggered this: pushed to the top.
  it("keeps a top-anchored crop top-anchored", () => {
    const wide = cropForWiderFrame({ x: 0, y: 0, w: 1, h: 0.64 }, 2.5, 4);
    expect(wide.x).toBe(0);
    expect(wide.w).toBe(1);
    expect(wide.y).toBe(0);
    expect(wide.h).toBeCloseTo(0.4);
  });

  it("keeps a bottom-anchored crop bottom-anchored", () => {
    const wide = cropForWiderFrame({ x: 0, y: 0.36, w: 1, h: 0.64 }, 2.5, 4);
    expect(wide.y + wide.h).toBeCloseTo(1);
  });

  it("keeps a centered crop centered", () => {
    const wide = cropForWiderFrame({ x: 0.1, y: 0.18, w: 0.8, h: 0.64 }, 2.5, 4);
    expect(wide.y + wide.h / 2).toBeCloseTo(0.5);
    expect(wide.x).toBe(0.1);
    expect(wide.w).toBe(0.8);
  });

  it("always stays inside the original crop's vertical range", () => {
    const crop = { x: 0, y: 0.1, w: 1, h: 0.5 };
    const wide = cropForWiderFrame(crop, 2.5, 4);
    expect(wide.y).toBeGreaterThanOrEqual(crop.y);
    expect(wide.y + wide.h).toBeLessThanOrEqual(crop.y + crop.h + 1e-9);
  });

  it("centers inside a crop that already spans the full height", () => {
    const wide = cropForWiderFrame({ x: 0.2, y: 0, w: 0.6, h: 1 }, 2.5, 4);
    expect(wide.y + wide.h / 2).toBeCloseTo(0.5);
  });

  it("returns the crop unchanged when the target frame isn't wider", () => {
    const crop = { x: 0, y: 0.2, w: 1, h: 0.6 };
    expect(cropForWiderFrame(crop, 2.5, 2.5)).toBe(crop);
  });
});

describe("computeCropStyle", () => {
  it("returns a full-bleed style for the identity crop", () => {
    expect(computeCropStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      position: "absolute",
      width: "100.0000%",
      height: "100.0000%",
      left: "-0.0000%",
      top: "-0.0000%",
      maxWidth: "none",
    });
  });

  it("scales and shifts for a horizontally centered half-width crop", () => {
    const style = computeCropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(style.width).toBe("200.0000%");
    expect(style.left).toBe("-50.0000%");
    expect(style.height).toBe("100.0000%");
    expect(style.top).toBe("-0.0000%");
  });

  it("scales and shifts for a crop offset from the top-left", () => {
    const style = computeCropStyle({ x: 0.1, y: 0.2, w: 0.8, h: 0.6 });
    expect(style.width).toBe("125.0000%");
    expect(style.height).toBe("166.6667%");
    expect(style.left).toBe("-12.5000%");
    expect(style.top).toBe("-33.3333%");
  });

  it("falls back to a full-bleed style for a degenerate zero-size crop", () => {
    expect(computeCropStyle({ x: 0, y: 0, w: 0, h: 1 })).toEqual({
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
    });
  });
});
