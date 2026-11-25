import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tap-card/plate.server", () => ({}));
vi.mock("@/lib/tap-card/card-view.server", () => ({}));

import { PlateSuccess, type PlateOk } from "./PlateSuccess";

const html = (flagged?: boolean) =>
  renderToStaticMarkup(
    createElement(PlateSuccess, {
      memberName: "Sample",
      memberSlug: "sample",
      plateCode: "ABCD1234",
      initial: { kind: "ok", state: { visitNumber: 1, firstToday: true, used: null, featured: null, others: [], newlyEarned: [] }, milestoneRewards: [], flagged } as PlateOk,
    }),
  );

describe("the red dot", () => {
  it("shows only on a flagged visit", () => {
    expect(html(true)).toContain('aria-label="Flagged"');
    expect(html(false)).not.toContain("Flagged");
    expect(html()).not.toContain("Flagged");
  });
});
