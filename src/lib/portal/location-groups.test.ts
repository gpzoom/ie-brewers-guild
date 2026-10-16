import { describe, expect, it } from "vitest";
import { chooserEntries, locationStatus, locationSwitcherFor } from "./location-groups";
import { pickMembership, type PortalMembership } from "./portal-access";

function m(over: Partial<PortalMembership> & { memberId: string }): PortalMembership {
  return {
    role: "owner",
    businessName: "Hangar 24 Brewing Co.",
    typeConfirmedAt: null,
    setupCompletedAt: null,
    city: "Redlands",
    status: "draft",
    businessId: null,
    businessDisplayName: null,
    businessMode: null,
    ...over,
  };
}

const chain = (memberId: string, city: string, over: Partial<PortalMembership> = {}) =>
  m({ memberId, city, businessId: "biz", businessDisplayName: "Hangar 24 Brewing Co.", businessMode: "one_manager", ...over });

describe("locationStatus", () => {
  it("published is live; any setup progress is setting up; otherwise not started", () => {
    expect(locationStatus({ status: "published", typeConfirmedAt: null, setupCompletedAt: null })).toBe("live");
    expect(locationStatus({ status: "draft", typeConfirmedAt: "2026-10-01", setupCompletedAt: null })).toBe("setting_up");
    expect(locationStatus({ status: "draft", typeConfirmedAt: null, setupCompletedAt: null })).toBe("not_started");
  });
});

describe("chooserEntries", () => {
  it("a one-manager business shows once, with its count, opening its first location by city", () => {
    const entries = chooserEntries([chain("r", "Riverside"), chain("i", "Irvine"), m({ memberId: "o", businessName: "Other Brewing", city: "Ontario" })]);
    expect(entries).toEqual([
      { kind: "business", businessId: "biz", label: "Hangar 24 Brewing Co.", locationCount: 2, openMemberId: "i" },
      { kind: "member", memberId: "o", label: "Other Brewing", role: "owner" },
    ]);
  });

  it("same-named locations that aren't one-manager are told apart by city", () => {
    const entries = chooserEntries([
      m({ memberId: "a", city: "Redlands", businessId: "sep", businessMode: "separate" }),
      m({ memberId: "b", city: "Irvine", businessId: "sep", businessMode: "separate" }),
    ]);
    expect(entries.map((e) => e.label)).toEqual(["Hangar 24 Brewing Co. · Irvine", "Hangar 24 Brewing Co. · Redlands"]);
  });
});

describe("pickMembership with businesses", () => {
  it("linked only to one one-manager business: no chooser; no cookie opens the oldest link", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine")];
    expect(pickMembership(list, null)).toEqual({ kind: "one", membership: list[0] });
  });

  it("the cookie picks a location inside the business", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine")];
    expect(pickMembership(list, "i")).toEqual({ kind: "one", membership: list[1] });
  });

  it("a chain plus another business, no cookie: choose", () => {
    const list = [chain("r", "Riverside"), chain("i", "Irvine"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, null).kind).toBe("choose");
  });

  it("a cookie naming a location the user isn't linked to is ignored", () => {
    const list = [chain("r", "Riverside"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, "stranger").kind).toBe("choose");
  });

  it("Switch business (forceChoose) still shows the chooser when there's more than one entry", () => {
    const list = [chain("r", "Riverside"), m({ memberId: "o", businessName: "Other", city: "Ontario" })];
    expect(pickMembership(list, "r", true).kind).toBe("choose");
  });
});

describe("locationSwitcherFor", () => {
  it("lists the business's locations the user is linked to, by city, with status", () => {
    const list = [
      chain("r", "Riverside", { status: "published" }),
      chain("i", "Irvine", { typeConfirmedAt: "2026-10-01" }),
      m({ memberId: "o", businessName: "Other", city: "Ontario" }),
    ];
    expect(locationSwitcherFor(list, "r")).toEqual({
      businessName: "Hangar 24 Brewing Co.",
      currentMemberId: "r",
      locations: [
        { memberId: "i", city: "Irvine", status: "setting_up" },
        { memberId: "r", city: "Riverside", status: "live" },
      ],
    });
  });

  it("none for a separate business, a single location, or one linked location", () => {
    expect(locationSwitcherFor([m({ memberId: "a", businessId: "s", businessMode: "separate" }), m({ memberId: "b", businessId: "s", businessMode: "separate" })], "a")).toBeNull();
    expect(locationSwitcherFor([m({ memberId: "a" })], "a")).toBeNull();
    expect(locationSwitcherFor([chain("r", "Riverside")], "r")).toBeNull();
  });
});
