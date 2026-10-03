import { describe, expect, it } from "vitest";
import { slugify, locationSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates a simple name", () => {
    expect(slugify("Idyllwild BrewPub")).toBe("idyllwild-brewpub");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("Euryale Brewing Co.")).toBe("euryale-brewing-co");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  --Metabolic Brewing Co.--  ")).toBe("metabolic-brewing-co");
  });

  it("handles an ampersand and apostrophe", () => {
    expect(slugify("Bob's Brew & Barrel")).toBe("bob-s-brew-barrel");
  });

  it("returns an empty string for a name with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("locationSlug", () => {
  it("is just the business slug for a single-location business", () => {
    expect(locationSlug("Idyllwild BrewPub", "Idyllwild", false)).toBe("idyllwild-brewpub");
  });

  it("suffixes the city for a multi-location business, matching the import script", () => {
    expect(locationSlug("Left Coast Brewing Co.", "Irvine", true)).toBe("left-coast-brewing-co-irvine");
  });

  it("still suffixes the city even when it's the only location passed in", () => {
    // A caller computing the FIRST location's slug for a multi-location
    // business still passes multiLocation: true -- the suffix depends on
    // whether the business has other locations, not on how many are in
    // the caller's own hands right now.
    expect(locationSlug("Metabolic Brewing Co.", "Ontario", true)).toBe("metabolic-brewing-co-ontario");
  });
});
