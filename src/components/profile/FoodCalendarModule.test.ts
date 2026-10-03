import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FoodCalendarModule } from "./FoodCalendarModule";

const base = {
  slots: [],
  now: new Date("2026-09-30T17:00:00Z"),
  timezone: "America/Los_Angeles",
  hours: [],
  specialHours: [],
};

describe("FoodCalendarModule", () => {
  it("says 'Kitchen open' on empty days when the taproom has its own kitchen", () => {
    const html = renderToStaticMarkup(createElement(FoodCalendarModule, { ...base, hasKitchen: true }));
    expect(html).toContain("Kitchen open");
    expect(html).not.toContain("Bring your own food");
  });

  it("still says 'Bring your own food' without the switch", () => {
    const html = renderToStaticMarkup(createElement(FoodCalendarModule, base));
    expect(html).toContain("Bring your own food");
  });
});
