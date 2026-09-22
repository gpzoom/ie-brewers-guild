import { describe, expect, it } from "vitest";
import { computeCropStyle } from "./crop";

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
