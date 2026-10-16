import { describe, expect, it } from "vitest";
import { resolveDetailLine } from "./roster-detail";
import type { RosterEntry } from "@/lib/guild/roster.server";
import type { RosterBusiness } from "@/lib/guild/roster-groups";
import type { MemberRow } from "@/lib/supabase/types";

const now = new Date("2026-10-15T12:00:00Z");
const entry = (
  claimState: RosterEntry["claimState"],
  member: Partial<MemberRow> = {},
): RosterEntry => ({
  member: {
    business_name: "Hangar 24 Brewing Co.",
    city: "Riverside",
    member_type: "producer",
    status: "draft",
    hours_confirmed_at: now.toISOString(),
    dues_received_at: null,
    member_since_year: 2015,
    ...member,
  } as MemberRow,
  claimState,
  ownerEmail: null,
});
const oneManager: RosterBusiness = {
  id: "b1",
  name: "Hangar 24",
  mode: "one_manager",
  hasManager: false,
  managerEmail: null,
  managerSignedIn: false,
};

describe("resolveDetailLine", () => {
  it("single location: city and its own claim state", () => {
    expect(resolveDetailLine(entry("unclaimed"), now)).toBe("Riverside · not invited yet");
    expect(resolveDetailLine(entry("invited_not_signed_in"), now)).toBe(
      "Riverside · invited, not signed in",
    );
    expect(resolveDetailLine(entry("claimed"), now)).toBe("Riverside · member since 2015");
  });

  it("one-manager location with no manager: the manager's state, not its own", () => {
    expect(resolveDetailLine(entry("unclaimed"), now, { business: oneManager })).toBe(
      "Riverside · manager not invited yet",
    );
  });

  it("one-manager location, manager invited but not signed in", () => {
    const business = { ...oneManager, hasManager: true, managerEmail: "boss@x.com" };
    expect(resolveDetailLine(entry("unclaimed"), now, { business })).toBe(
      "Riverside · manager invited, not signed in",
    );
  });

  it("one-manager location whose manager's email can't be read: still invited, not 'not invited yet'", () => {
    const business = { ...oneManager, hasManager: true, managerEmail: null };
    expect(resolveDetailLine(entry("unclaimed"), now, { business })).toBe(
      "Riverside · manager invited, not signed in",
    );
  });

  it("one-manager location, manager signed in: the usual detail, ignoring the location's own claim", () => {
    const business = { ...oneManager, hasManager: true, managerEmail: "boss@x.com", managerSignedIn: true };
    expect(resolveDetailLine(entry("unclaimed"), now, { business })).toBe(
      "Riverside · member since 2015",
    );
    expect(resolveDetailLine(entry("unclaimed", { status: "published" }), now, { business })).toBe(
      "Riverside · dues not recorded",
    );
  });

  it("separate-mode location keeps its own claim state", () => {
    const business = { ...oneManager, mode: "separate" as const };
    expect(resolveDetailLine(entry("unclaimed"), now, { business })).toBe(
      "Riverside · not invited yet",
    );
  });

  it("withoutCity drops the city (an indented row already shows it as its title)", () => {
    expect(
      resolveDetailLine(entry("unclaimed"), now, { business: oneManager, withoutCity: true }),
    ).toBe("manager not invited yet");
    expect(
      resolveDetailLine(entry("claimed", { member_since_year: null }), now, { withoutCity: true }),
    ).toBe("");
  });
});
