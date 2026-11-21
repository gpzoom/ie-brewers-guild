import { describe, expect, it } from "vitest";
import { approvedLogoUrl, printKitInfoFromRow } from "./print-kit-info";

/** A stand-in for the Supabase client: records filters, answers from `rows`. */
function fakeClient(rows: Array<{ id: string; review_status: string; storage_path: string }>) {
  const filters: Record<string, string> = {};
  const query = {
    select: () => query,
    eq: (col: string, val: string) => {
      filters[col] = val;
      return query;
    },
    maybeSingle: async () => ({ data: rows.find((r) => Object.entries(filters).every(([k, v]) => r[k as keyof typeof r] === v)) ?? null }),
  };
  return {
    filters,
    from: () => query,
    storage: { from: (bucket: string) => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }) }) },
  };
}

describe("approvedLogoUrl", () => {
  it("returns the public URL of an approved logo", async () => {
    const db = fakeClient([{ id: "a1", review_status: "approved", storage_path: "m/logo.png" }]);
    expect(await approvedLogoUrl(db, "a1")).toBe("https://cdn/member-logos/m/logo.png");
    expect(db.filters).toMatchObject({ id: "a1", review_status: "approved" });
  });

  it("returns null for a logo that isn't approved", async () => {
    expect(await approvedLogoUrl(fakeClient([{ id: "a1", review_status: "rejected", storage_path: "m/x.png" }]), "a1")).toBeNull();
    expect(await approvedLogoUrl(fakeClient([{ id: "a1", review_status: "pending", storage_path: "m/x.png" }]), "a1")).toBeNull();
  });

  it("returns null with no logo", async () => {
    expect(await approvedLogoUrl(fakeClient([]), null)).toBeNull();
  });
});
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
