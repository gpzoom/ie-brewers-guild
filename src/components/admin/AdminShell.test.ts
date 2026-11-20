import { describe, expect, it } from "vitest";
import { adminNavItemsFor } from "./AdminShell";

describe("adminNavItemsFor: Scan Pass", () => {
  it("adds Scan Pass after Jobs for a producer on the trail", () => {
    const paths = adminNavItemsFor("producer", { tapCard: true }).map((i) => i.to);
    expect(paths.indexOf("/admin/scan-pass")).toBe(paths.indexOf("/admin/jobs") + 1);
  });

  it("adds it after Jobs for every member type (universal card)", () => {
    for (const type of ["mobile", "allied"] as const) {
      const paths = adminNavItemsFor(type, { tapCard: true }).map((i) => i.to);
      expect(paths.indexOf("/admin/scan-pass")).toBe(paths.indexOf("/admin/jobs") + 1);
    }
  });

  it("leaves it out when not asked for", () => {
    expect(adminNavItemsFor("producer").map((i) => i.to)).not.toContain("/admin/scan-pass");
    expect(adminNavItemsFor("mobile").map((i) => i.to)).not.toContain("/admin/scan-pass");
  });
});
