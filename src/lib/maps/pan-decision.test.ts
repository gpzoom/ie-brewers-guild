import { describe, expect, it } from "vitest";
import { panDecision } from "./pan-decision";

const a = { lat: 1, lng: 1 };
const b = { lat: 2, lng: 2 };

describe("panDecision (spec: the map only moves when it has to)", () => {
  it("nothing highlighted, or everything in view -> don't move", () => {
    expect(panDecision([], () => false)).toEqual({ kind: "none" });
    expect(panDecision([a, b], () => true)).toEqual({ kind: "none" });
  });
  it("one pin off-screen -> pan to it", () => {
    expect(panDecision([a], () => false)).toEqual({ kind: "pan", to: a });
  });
  it("several pins, some off-screen -> fit them all", () => {
    expect(panDecision([a, b], (p) => p === a)).toEqual({ kind: "fit", points: [a, b] });
  });
});
