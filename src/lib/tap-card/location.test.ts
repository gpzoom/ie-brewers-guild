import { describe, expect, it } from "vitest";
import { locationWord, parsePosition } from "./location";

const place = { memberType: "producer", lat: 34, lng: -117 };
/** A position this many meters north of the taproom. */
const north = (meters: number, accuracy: number) => ({ lat: 34 + meters / 111_195, lng: -117, accuracy });

describe("locationWord", () => {
  it.each([
    [300, 20, "near"],
    [420, 10, "far"],
    [420, 50, "near"],
    [5000, 100, "far"],
    [300, 1500, "none"],
    [1200, 3000, "none"],
    [9000, 3000, "far"],
  ] as const)("%i m away, accuracy %i m: %s", (meters, accuracy, word) => {
    expect(locationWord(north(meters, accuracy), place)).toBe(word);
  });
  it("no position is none", () => expect(locationWord(null, place)).toBe("none"));
  it("never judges mobile members or ones with no saved coordinates", () => {
    for (const p of [null, north(5000, 10)]) {
      expect(locationWord(p, { ...place, memberType: "mobile" })).toBeNull();
      expect(locationWord(p, { ...place, lat: null })).toBeNull();
      expect(locationWord(p, { ...place, lng: null })).toBeNull();
    }
  });
});

describe("parsePosition", () => {
  const good = { lat: 34, lng: -117, accuracy: 12 };
  it("keeps only the three numbers", () => expect(parsePosition({ ...good, speed: 3 })).toEqual(good));
  it.each([null, "x", {}, { lat: 34, lng: -117 }, { ...good, lat: "34" }, { ...good, lat: NaN }, { ...good, accuracy: Infinity }, { ...good, lat: 91 }, { ...good, lng: -181 }, { ...good, accuracy: -1 }])(
    "refuses %j",
    (bad) => expect(parsePosition(bad)).toBeNull(),
  );
});
