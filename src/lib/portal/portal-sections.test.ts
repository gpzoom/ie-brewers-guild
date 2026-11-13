import type { PortalShell } from "@/lib/portal/portal-shell.server";
import { describe, expect, it } from "vitest";
import {
  canOpenPortalSection,
  firstPortalSection,
  isPortalSection,
  legacyPortalSection,
  PORTAL_SECTION_LABELS,
  portalSectionsFor,
  sectionForCompletenessStep,
} from "@/lib/portal/portal-sections";

describe("portalSectionsFor", () => {
  it("gives the owner every section, with Discount only for Affiliate Members", () => {
    expect(portalSectionsFor({ role: "owner", memberType: "producer" })).toEqual([
      "notifications",
      "basics",
      "logo-cover",
      "events",
      "food",
      "links",
      "jobs",
      "theme",
      "people",
    ]);
    expect(portalSectionsFor({ role: "owner", memberType: "allied" })).toContain("discount");
  });

  it("gives Food trucks to producers only, and not to a Photos & events editor", () => {
    expect(portalSectionsFor({ role: "owner", memberType: "allied" })).not.toContain("food");
    expect(portalSectionsFor({ role: "owner", memberType: "mobile" })).not.toContain("food");
    expect(portalSectionsFor({ role: "editor", memberType: "producer" })).toContain("food");
    expect(portalSectionsFor({ role: "media_events", memberType: "producer" })).not.toContain(
      "food",
    );
  });

  it("gives a full editor everything but People", () => {
    const sections = portalSectionsFor({ role: "editor", memberType: "allied" });
    expect(sections).not.toContain("people");
    expect(sections).toContain("discount");
    expect(sections).toContain("basics");
  });

  it("gives a Photos & events editor their two sections plus Jobs (after Notifications)", () => {
    expect(portalSectionsFor({ role: "media_events", memberType: "allied" })).toEqual([
      "notifications",
      "logo-cover",
      "events",
      "jobs",
    ]);
  });

  it("logo, photos and cover are one section, which a Photos & events editor can open", () => {
    expect(PORTAL_SECTION_LABELS["logo-cover"]).toEqual({ label: "Logo, Photos & Cover", short: "Photos" });
    expect(isPortalSection("photos")).toBe(false);
    expect(portalSectionsFor({ role: "media_events", memberType: "producer" })).toEqual(["notifications", "logo-cover", "events", "jobs"]);
    expect(firstPortalSection("media_events")).toBe("logo-cover");
  });
});

describe("Jobs section", () => {
  it("opens for every member type and every role, between Links and Discount", () => {
    for (const memberType of ["producer", "mobile", "allied"] as const) {
      for (const role of ["owner", "co_owner", "editor", "media_events"] as const) {
        expect(canOpenPortalSection("jobs", { role, memberType })).toBe(true);
      }
    }
    const sections = portalSectionsFor({ role: "owner", memberType: "allied" });
    expect(sections.indexOf("jobs")).toBe(sections.indexOf("links") + 1);
    expect(sections.indexOf("discount")).toBe(sections.indexOf("jobs") + 1);
  });
});

describe("PortalShell viewer", () => {
  it("a shell-shaped viewer (editor + isBusinessManager) sees and opens People", () => {
    const shell: Pick<PortalShell, "role" | "memberType" | "isBusinessManager"> = {
      role: "editor",
      memberType: "producer",
      isBusinessManager: true,
    };
    expect(portalSectionsFor(shell)).toContain("people");
    expect(canOpenPortalSection("people", shell)).toBe(true);
  });
});

describe("canOpenPortalSection", () => {
  it("People opens for the business manager on a handed-off location (editor role)", () => {
    expect(canOpenPortalSection("people", { role: "editor", memberType: "producer", isBusinessManager: true })).toBe(true);
    expect(canOpenPortalSection("people", { role: "editor", memberType: "producer" })).toBe(false);
  });

  it("refuses People to everyone but the owner", () => {
    expect(canOpenPortalSection("people", { role: "owner", memberType: "mobile" })).toBe(true);
    expect(canOpenPortalSection("people", { role: "editor", memberType: "mobile" })).toBe(false);
    expect(canOpenPortalSection("people", { role: "media_events", memberType: "mobile" })).toBe(
      false,
    );
  });

  it("opens People, and Food on a producer, for a co-owner like the owner", () => {
    expect(canOpenPortalSection("people", { role: "co_owner", memberType: "producer" })).toBe(true);
    expect(canOpenPortalSection("food", { role: "co_owner", memberType: "producer" })).toBe(true);
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
  it("lands a Photos & events editor on Logo, Photos & Cover, everyone else on Basics", () => {
    expect(firstPortalSection("media_events")).toBe("logo-cover");
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

describe("legacyPortalSection", () => {
  it("maps the retired /portal/photos to Logo, Photos & Cover", () => {
    expect(legacyPortalSection("photos")).toBe("logo-cover");
    expect(legacyPortalSection("events")).toBeNull();
  });
});
