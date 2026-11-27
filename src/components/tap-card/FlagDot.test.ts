import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tap-card/plate.server", () => ({}));
vi.mock("@/lib/tap-card/card-view.server", () => ({}));

import { PlateSuccess, type PlateOk } from "./PlateSuccess";

const html = (flag?: "red" | "yellow" | null) =>
  renderToStaticMarkup(
    createElement(PlateSuccess, {
      memberName: "Sample",
      memberSlug: "sample",
      plateCode: "ABCD1234",
      initial: { kind: "ok", state: { visitNumber: 1, firstToday: true, used: null, featured: null, others: [], newlyEarned: [] }, milestoneRewards: [], flag } as PlateOk,
    }),
  );

describe("the flag dot", () => {
  it("is red for a flagged visit", () => {
    expect(html("red")).toContain('aria-label="Flagged"');
    expect(html("red")).toContain("bg-[#FF0000]");
  });
  it("is yellow when the only reason is no location", () => {
    expect(html("yellow")).toContain('aria-label="No location"');
    expect(html("yellow")).toContain("bg-[#FFC700]");
    expect(html("yellow")).not.toContain("bg-[#FF0000]");
  });
  it("doesn't show otherwise", () => {
    expect(html(null)).not.toContain("aria-label=\"Flagged\"");
    expect(html()).not.toContain("No location");
    expect(html()).not.toContain("Flagged");
  });
});
