import { describe, expect, it } from "vitest";
import { adminNavItemsFor } from "./AdminShell";

describe("adminNavItemsFor: Tap Card", () => {
  it("adds Tap Card after Jobs for a producer on the trail", () => {
    const paths = adminNavItemsFor("producer", { tapCard: true }).map((i) => i.to);
    expect(paths.indexOf("/admin/tap-card")).toBe(paths.indexOf("/admin/jobs") + 1);
  });

  it("leaves it out otherwise", () => {
    expect(adminNavItemsFor("producer").map((i) => i.to)).not.toContain("/admin/tap-card");
    expect(adminNavItemsFor("mobile", { tapCard: true }).map((i) => i.to)).not.toContain("/admin/tap-card");
  });
});
