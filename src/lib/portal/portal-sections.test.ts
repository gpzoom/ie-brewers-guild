import { describe, expect, it } from "vitest";
import {
  canOpenPortalSection,
  firstPortalSection,
  isPortalSection,
  portalSectionsFor,
  sectionForCompletenessStep,
} from "@/lib/portal/portal-sections";

describe("portalSectionsFor", () => {
  it("gives the owner every section, with Discount only for Allied Members", () => {
    expect(portalSectionsFor({ role: "owner", memberType: "producer" })).toEqual([
      "basics",
      "logo-cover",
      "photos",
      "events",
      "links",
      "theme",
      "people",
    ]);
    expect(portalSectionsFor({ role: "owner", memberType: "allied" })).toContain("discount");
  });

  it("gives a full editor everything but People", () => {
    const sections = portalSectionsFor({ role: "editor", memberType: "allied" });
    expect(sections).not.toContain("people");
    expect(sections).toContain("discount");
    expect(sections).toContain("basics");
  });

  it("gives a Photos & events editor only their two sections", () => {
    expect(portalSectionsFor({ role: "media_events", memberType: "allied" })).toEqual([
      "photos",
      "events",
    ]);
  });
});

describe("canOpenPortalSection", () => {
  it("refuses People to everyone but the owner", () => {
    expect(canOpenPortalSection("people", { role: "owner", memberType: "mobile" })).toBe(true);
    expect(canOpenPortalSection("people", { role: "editor", memberType: "mobile" })).toBe(false);
    expect(canOpenPortalSection("people", { role: "media_events", memberType: "mobile" })).toBe(
      false,
    );
  });

  it("refuses Basics to a Photos & events editor", () => {
    expect(canOpenPortalSection("basics", { role: "media_events", memberType: "producer" })).toBe(
      false,
    );
  });

  it("refuses Discount to a producer, even the owner", () => {
    expect(canOpenPortalSection("discount", { role: "owner", memberType: "producer" })).toBe(false);
  });
});

describe("firstPortalSection", () => {
  it("lands a Photos & events editor on Photos, everyone else on Basics", () => {
    expect(firstPortalSection("media_events")).toBe("photos");
    expect(firstPortalSection("editor")).toBe("basics");
    expect(firstPortalSection("owner")).toBe("basics");
  });
});

describe("sectionForCompletenessStep", () => {
  it("sends hours to Basics & hours, or to Events for a mobile member", () => {
    expect(sectionForCompletenessStep("hours", "producer")).toEqual({
      section: "basics",
      hash: "hours",
    });
    expect(sectionForCompletenessStep("hours", "mobile")).toEqual({ section: "events" });
  });

  it("maps the other steps to the section of the same name", () => {
    expect(sectionForCompletenessStep("photos", "producer")).toEqual({ section: "photos" });
    expect(sectionForCompletenessStep("logo-cover", "allied")).toEqual({ section: "logo-cover" });
    expect(sectionForCompletenessStep("type", "allied")).toEqual({ section: "basics" });
  });
});

describe("isPortalSection", () => {
  it("accepts section names only", () => {
    expect(isPortalSection("people")).toBe(true);
    expect(isPortalSection("setup")).toBe(false);
    expect(isPortalSection(undefined)).toBe(false);
  });
});
