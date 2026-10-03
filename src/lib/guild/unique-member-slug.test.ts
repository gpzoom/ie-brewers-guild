import { describe, expect, it } from "vitest";
import { pickUnusedSlug } from "./unique-member-slug";

describe("pickUnusedSlug", () => {
  it("returns the base slug when it isn't taken", () => {
    expect(pickUnusedSlug("left-coast-brewing", [])).toBe("left-coast-brewing");
  });

  it("appends -2 when the base is taken once", () => {
    expect(pickUnusedSlug("left-coast-brewing", ["left-coast-brewing"])).toBe("left-coast-brewing-2");
  });

  it("keeps incrementing past multiple collisions", () => {
    expect(
      pickUnusedSlug("left-coast-brewing", ["left-coast-brewing", "left-coast-brewing-2", "left-coast-brewing-3"]),
    ).toBe("left-coast-brewing-4");
  });
});
