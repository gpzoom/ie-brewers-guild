import { describe, expect, it } from "vitest";
import {
  CURRENT_SPOTLIGHT,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  beatsOf,
  markerPath,
  zoomFor,
  type Spotlight,
} from "./spotlight";

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe("zoomFor (the glide in toward a highlighted name)", () => {
  it("centers the name in the frame", () => {
    const z = zoomFor(box(860, 490, 200, 100), 2);
    // The name's center (960, 540) lands on the frame's center.
    const cx = ((960 * z.scale) / SLIDE_WIDTH) * 100 + z.x;
    const cy = ((540 * z.scale) / SLIDE_HEIGHT) * 100 + z.y;
    expect(cx).toBeCloseTo(50);
    expect(cy).toBeCloseTo(50);
  });

  it("never zooms past the cap, and never zooms out", () => {
    expect(zoomFor(box(900, 500, 20, 10), 1.9).scale).toBe(1.9);
    expect(zoomFor(box(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT), 3).scale).toBe(1);
  });

  it("a big name gets a smaller zoom so it still fits", () => {
    expect(zoomFor(box(100, 100, 900, 100), 3).scale).toBeLessThan(
      zoomFor(box(100, 100, 300, 100), 3).scale,
    );
  });

  it("near an edge, the slide never pulls away from the frame", () => {
    for (const b of [box(0, 0, 200, 100), box(1720, 980, 200, 100)]) {
      const z = zoomFor(b, 2.5);
      // translate is in % of the frame; the scaled slide must still cover it.
      expect(z.x).toBeLessThanOrEqual(0);
      expect(z.y).toBeLessThanOrEqual(0);
      expect(z.x).toBeGreaterThanOrEqual(100 - z.scale * 100 - 1e-9);
      expect(z.y).toBeGreaterThanOrEqual(100 - z.scale * 100 - 1e-9);
    }
  });
});

describe("beatsOf (one beat per highlighted name, in order)", () => {
  it("steps through every highlight of every slide", () => {
    const s: Spotlight = {
      id: "t",
      eyebrow: "",
      title: "",
      intro: "",
      slides: [
        { image: "a", alt: "", category: "", highlights: [h(), h()] },
        { image: "b", alt: "", category: "", highlights: [h()] },
      ],
    };
    expect(beatsOf(s)).toEqual([
      { slideIndex: 0, highlightIndex: 0 },
      { slideIndex: 0, highlightIndex: 1 },
      { slideIndex: 1, highlightIndex: 0 },
    ]);
  });
});

function h() {
  return { box: box(0, 0, 10, 10), award: "gold" as const, beer: "", brewery: "", city: "" };
}

describe("the current spotlight's content", () => {
  it("is the GABF 2026 results: 5 slides, 7 names, medals first", () => {
    if (!CURRENT_SPOTLIGHT) return;
    expect(CURRENT_SPOTLIGHT.slides).toHaveLength(5);
    expect(beatsOf(CURRENT_SPOTLIGHT)).toHaveLength(7);
    const awards = CURRENT_SPOTLIGHT.slides.flatMap((s) => s.highlights.map((x) => x.award));
    expect(awards).toEqual([
      "bronze",
      "gold",
      "gold",
      "finalist",
      "finalist",
      "finalist",
      "finalist",
    ]);
  });

  it("every highlight box sits inside its slide, and every slide has a description", () => {
    for (const slide of CURRENT_SPOTLIGHT?.slides ?? []) {
      expect(slide.alt.length).toBeGreaterThan(20);
      expect(slide.image).toMatch(/^\/spotlight\//);
      for (const { box: b, memberSlug } of slide.highlights) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(SLIDE_WIDTH);
        expect(b.y + b.h).toBeLessThanOrEqual(SLIDE_HEIGHT);
        if (memberSlug !== undefined) expect(memberSlug).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe("markerPath (the hand-drawn loop)", () => {
  it("surrounds the whole name, a little outside it", () => {
    const b = box(500, 300, 400, 150);
    const nums = markerPath(b)
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeLessThan(b.x);
    expect(Math.max(...xs)).toBeGreaterThan(b.x + b.w);
    expect(Math.min(...ys)).toBeLessThan(b.y);
    expect(Math.max(...ys)).toBeGreaterThan(b.y + b.h);
    expect(markerPath(b).startsWith("M")).toBe(true);
  });
});
