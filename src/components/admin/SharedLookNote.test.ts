import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SharedLookNote } from "./SharedLookNote";
import type { SharedLook } from "@/lib/portal/shared-look";

const manager: SharedLook = {
  businessName: "Hangar 24",
  locationCount: 4,
  canChange: true,
  managerLabel: "boss@hangar24.example",
};
const nonManager: SharedLook = { ...manager, canChange: false };

const BZ3_LINE =
  "Change them from any location&#x27;s Logo, Photos &amp; Cover page; every location updates.";

describe("SharedLookNote", () => {
  it("shows the manager a small pill, and no info box", () => {
    const html = renderToStaticMarkup(createElement(SharedLookNote, { look: manager }));
    expect(html).toContain("Shared by all 4 locations");
    expect(html).not.toContain("manages this");
    expect(html).not.toContain(BZ3_LINE);
  });

  it("tells anyone else who manages the shared look (BZ5), in a note", () => {
    const html = renderToStaticMarkup(createElement(SharedLookNote, { look: nonManager }));
    expect(html).toContain(
      "Shared by all Hangar 24 locations. boss@hangar24.example manages this.",
    );
    expect(html).toContain('role="note"');
    expect(html).toContain("bg-canvas-2");
    expect(html).not.toContain("Shared by all 4 locations");
  });

  it("in short setup, the manager gets the pill and where to change it (BZ3)", () => {
    const html = renderToStaticMarkup(
      createElement(SharedLookNote, { look: manager, readOnlyInSetup: true }),
    );
    expect(html).toContain("Shared by all 4 locations");
    expect(html).toContain(BZ3_LINE);
    expect(html).toContain('role="note"');
  });

  it("in short setup, anyone else still gets the BZ5 sentence", () => {
    const html = renderToStaticMarkup(
      createElement(SharedLookNote, { look: nonManager, readOnlyInSetup: true }),
    );
    expect(html).toContain("boss@hangar24.example manages this.");
    expect(html).not.toContain(BZ3_LINE);
  });
});
