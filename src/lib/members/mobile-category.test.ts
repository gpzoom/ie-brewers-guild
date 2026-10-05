import { describe, expect, it } from "vitest";
import { mobileIconFor, mobileTagFor, type MobileCategory } from "./mobile-category";

const truck: MobileCategory = { name: "Food Truck", slug: "food-truck", sort_order: 2 };
const popup: MobileCategory = { name: "Pop-up Food Vendor", slug: "pop-up-food-vendor", sort_order: 3 };
const ent: MobileCategory = { name: "Entertainment", slug: "entertainment", sort_order: 1 };
const other: MobileCategory = { name: "Face Painting", slug: "face-painting", sort_order: 0 };

describe("mobile pin icon and tag (from the first category by sort_order)", () => {
  it.each([
    [[truck], "truck", "FOOD TRUCK"],
    [[popup], "tent", "POP-UP FOOD VENDOR"],
    [[ent], "mic", "ENTERTAINMENT"],
  ] as const)("%j -> %s / %s", (cats, icon, tag) => {
    expect(mobileIconFor([...cats])).toBe(icon);
    expect(mobileTagFor([...cats])).toBe(tag);
  });

  it("several categories: the first by sort_order decides", () => {
    expect(mobileIconFor([truck, ent])).toBe("mic");
    expect(mobileTagFor([truck, ent])).toBe("ENTERTAINMENT");
  });

  it("an unknown category gets the star but keeps its own name as the tag", () => {
    expect(mobileIconFor([other, truck])).toBe("star");
    expect(mobileTagFor([other, truck])).toBe("FACE PAINTING");
  });

  it("no category: star and MOBILE", () => {
    expect(mobileIconFor([])).toBe("star");
    expect(mobileTagFor([])).toBe("MOBILE");
  });
});
