import { describe, expect, it } from "vitest";
import { showsMaintenance } from "./maintenance";

describe("showsMaintenance: who sees the maintenance page (owner, 2026-11-14)", () => {
  it("off: no one", () => {
    expect(showsMaintenance("/", { on: false, isGuildAdmin: false })).toBe(false);
  });
  it("on: visitors on public pages see it", () => {
    for (const path of ["/", "/members", "/members/sample-brewery", "/events", "/jobs", "/about/"]) {
      expect(showsMaintenance(path, { on: true, isGuildAdmin: false })).toBe(true);
    }
  });
  it("on: signed-in Guild admins see the real site", () => {
    expect(showsMaintenance("/", { on: true, isGuildAdmin: true })).toBe(false);
  });
  it("on: sign-in, the portal, Guild screens and email links keep working", () => {
    for (const path of [
      "/signin",
      "/signin/help",
      "/portal/notifications",
      "/admin/events",
      "/guild/settings",
      "/auth/callback",
      "/send/abc",
      "/visit/abc",
      "/unsubscribe/abc",
      "/api/confirm-hours/abc",
      "/maintenance",
    ]) {
      expect(showsMaintenance(path, { on: true, isGuildAdmin: false })).toBe(false);
    }
  });
  it("a look-alike path isn't exempt", () => {
    expect(showsMaintenance("/guilds", { on: true, isGuildAdmin: false })).toBe(true);
  });
});
