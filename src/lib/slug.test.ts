import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

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
