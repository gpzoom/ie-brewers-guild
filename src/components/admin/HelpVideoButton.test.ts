import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelpVideoButton } from "@/components/admin/HelpVideoButton";
import { HELP_VIDEOS } from "@/data/help-videos";

describe("HelpVideoButton", () => {
  it("shows the label and length, and doesn't load the player until opened", () => {
    const html = renderToStaticMarkup(
      createElement(HelpVideoButton, {
        video: HELP_VIDEOS.googleEventsCalendar,
        label: "Watch how to connect a Google Calendar for EVENTS",
      }),
    );
    expect(html).toContain("Watch how to connect a Google Calendar for EVENTS");
    expect(html).toContain("(2:53)");
    expect(html).not.toContain("<iframe");
  });

  it("has a food vendor video too", () => {
    const html = renderToStaticMarkup(
      createElement(HelpVideoButton, {
        video: HELP_VIDEOS.googleFoodCalendar,
        label: "Watch how to connect a Google Calendar for FOOD VENDORS",
      }),
    );
    expect(html).toContain("FOOD VENDORS");
    expect(html).toContain("(1:52)");
  });
});

describe("HELP_VIDEOS", () => {
  it("points at livid.com embed and watch pages for the same video", () => {
    for (const v of Object.values(HELP_VIDEOS)) {
      const id = v.embedUrl.match(/^https:\/\/livid\.com\/embed\/([A-Za-z0-9]+)(\?autoplay=1)?$/)?.[1];
      expect(id).toBeTruthy();
      expect(v.watchUrl).toBe(`https://livid.com/watch/${id}`);
      expect(v.duration).toMatch(/^\d+:\d\d$/);
    }
  });
});
