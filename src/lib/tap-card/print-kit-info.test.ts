import { describe, expect, it } from "vitest";
import { printKitInfoFromRow } from "./print-kit-info";
import { logoBackgroundColor } from "@/lib/members/logo-background";
import type { MemberThemeName } from "@/lib/theme/member-themes";

const row = { business_name: "Sample Brewery #1", slug: "sample-brewery-1", logo_background: "light", theme: "amber" };

describe("printKitInfoFromRow", () => {
  it("maps the member row", () => {
    expect(printKitInfoFromRow(row, true, "https://x/logo.png")).toEqual({
      memberName: "Sample Brewery #1",
      memberSlug: "sample-brewery-1",
      trailStop: true,
      logoUrl: "https://x/logo.png",
      logoTileColor: "#FFFFFF",
    });
  });

  it.each(["light", "dark", "theme"])("uses the shared logo tile color for %s", (bg) => {
    const info = printKitInfoFromRow({ ...row, logo_background: bg }, false, null);
    expect(info.logoTileColor).toBe(logoBackgroundColor(bg, row.theme as MemberThemeName));
  });

  it("falls back to white for an unknown background", () => {
    expect(printKitInfoFromRow({ ...row, logo_background: null }, false, null).logoTileColor).toBe("#FFFFFF");
  });
});
