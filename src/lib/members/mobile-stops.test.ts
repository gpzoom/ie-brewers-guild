import { describe, expect, it } from "vitest";
import {
  formatStopDay,
  formatStopTime,
  matchHost,
  pickNextStop,
  pickTodaysStop,
  needsStopGeocode,
  normalizeBusinessName,
  placeStop,
  stopCoordinates,
  summarizeStops,
  MOBILE_PIN_OFFSET_LNG,
  type StopEvent,
  type HostLocation,
} from "./mobile-stops";

function stop(overrides: Partial<StopEvent>): StopEvent {
  return {
    id: "e1",
    member_id: "m1",
    title: "Tacos",
    venue_name: null,
    city: "Riverside",
    address: null,
    starts_at: "2026-10-05T00:00:00Z",
    ends_at: null,
    all_day: false,
    overlay_status: null,
    overlay_starts_at: null,
    is_hidden: false,
    latitude: null,
    longitude: null,
    geocoded_address: null,
    ...overrides,
  };
}

// Monday 5 October 2026, 3:00 pm Pacific (PDT, UTC-7) = 22:00 UTC.
const NOW = new Date("2026-10-05T22:00:00Z");

describe("pickTodaysStop", () => {
  it("picks the stop happening now over a later one today", () => {
    const now = stop({ id: "now", starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" });
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later, now], NOW)?.id).toBe("now");
  });

  it("with nothing on now, picks the next one today", () => {
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later], NOW)?.id).toBe("later");
  });

  it("11:30 pm Pacific is still today (tomorrow in UTC)", () => {
    const late = stop({ id: "late", starts_at: "2026-10-06T06:30:00Z" });
    expect(pickTodaysStop([late], NOW)?.id).toBe("late");
  });

  it("a stop that ended earlier today is not today's stop", () => {
    const done = stop({ id: "done", starts_at: "2026-10-05T16:00:00Z", ends_at: "2026-10-05T19:00:00Z" });
    expect(pickTodaysStop([done], NOW)).toBeNull();
  });

  it("a stop with no end counts as on for 2 hours", () => {
    const open = stop({ id: "open", starts_at: "2026-10-05T20:30:00Z" });
    expect(pickTodaysStop([open], NOW)?.id).toBe("open");
    const over = stop({ id: "over", starts_at: "2026-10-05T19:30:00Z" });
    expect(pickTodaysStop([over], NOW)).toBeNull();
  });

  it("an all-day stop today is on all day", () => {
    const allDay = stop({ id: "allday", starts_at: "2026-10-05T07:00:00Z", all_day: true });
    expect(pickTodaysStop([allDay], NOW)?.id).toBe("allday");
  });

  it("skips hidden, canceled and postponed stops", () => {
    const base = { starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" };
    expect(pickTodaysStop([stop({ ...base, is_hidden: true })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "canceled" })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "postponed" })], NOW)).toBeNull();
  });

  it("a stop rescheduled onto today counts by its new time", () => {
    const moved = stop({
      id: "moved",
      starts_at: "2026-10-01T21:00:00Z",
      overlay_status: "rescheduled",
      overlay_starts_at: "2026-10-06T01:00:00Z",
    });
    expect(pickTodaysStop([moved], NOW)?.id).toBe("moved");
  });
});

describe("pickNextStop", () => {
  it("is the first live stop after today, within 14 days", () => {
    const fri = stop({ id: "fri", starts_at: "2026-10-10T00:00:00Z" });
    const wed = stop({ id: "wed", starts_at: "2026-10-07T19:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-10-25T19:00:00Z" });
    const todayLater = stop({ id: "today", starts_at: "2026-10-06T01:00:00Z" });
    expect(pickNextStop([far, fri, wed, todayLater], NOW)?.id).toBe("wed");
    expect(pickNextStop([far], NOW)).toBeNull();
  });
});

describe("formatStopTime / formatStopDay", () => {
  it.each([
    ["2026-10-06T00:00:00Z", "2026-10-06T04:00:00Z", false, "5–9 pm"],
    ["2026-10-06T00:30:00Z", "2026-10-06T04:00:00Z", false, "5:30–9 pm"],
    ["2026-10-05T18:00:00Z", "2026-10-05T21:00:00Z", false, "11 am–2 pm"],
    ["2026-10-06T01:00:00Z", null, false, "6 pm"],
    ["2026-10-05T07:00:00Z", null, true, "All day"],
  ])("%s–%s all-day=%s -> %s", (starts_at, ends_at, all_day, text) => {
    expect(formatStopTime(stop({ starts_at, ends_at, all_day }))).toBe(text);
  });

  it("day is the short Pacific weekday", () => {
    expect(formatStopDay(stop({ starts_at: "2026-10-10T00:00:00Z" }))).toBe("Fri");
  });
});


const HOSTS: HostLocation[] = [
  { name: "All Points Brewing Co.", slug: "all-points", city: "Riverside", street: "2023 Chicago Ave Unit B8", lat: 33.977, lng: -117.353 },
  { name: "Sample Brewing Co.", slug: "sample-riv", city: "Riverside", street: "3750 Main Street", lat: 33.98, lng: -117.375 },
  { name: "Sample Brewing Co.", slug: "sample-ont", city: "Ontario", street: "100 Euclid Ave", lat: 34.06, lng: -117.65 },
];
const today = { starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" };

describe("normalizeBusinessName", () => {
  it("ignores case, spaces, punctuation and a trailing Co. / Company", () => {
    expect(normalizeBusinessName("  All Points Brewing Co. ")).toBe("all points brewing");
    expect(normalizeBusinessName("ALL POINTS BREWING COMPANY")).toBe("all points brewing");
    expect(normalizeBusinessName("All  Points Brewing")).toBe("all points brewing");
  });
});

describe("placeStop", () => {
  it("rule 1: at a Guild member by venue name -> beside that member's pin", () => {
    const p = placeStop(stop({ ...today, venue_name: "All Points Brewing Company" }), HOSTS);
    expect(p).toEqual({ kind: "member", host: HOSTS[0], lat: 33.977, lng: -117.353 + MOBILE_PIN_OFFSET_LNG });
  });

  it("rule 1: by street address", () => {
    const p = placeStop(stop({ ...today, address: "2023 Chicago Ave Unit B8, Riverside, CA 92507" }), HOSTS);
    expect(p.kind).toBe("member");
  });

  it("rule 1: a business with several locations uses the one in the stop's city", () => {
    const p = placeStop(stop({ ...today, venue_name: "Sample Brewing Co.", city: "Ontario" }), HOSTS);
    expect(p.kind === "member" && p.host.slug).toBe("sample-ont");
  });

  it("rule 1: several locations and no city match -> rule doesn't apply", () => {
    const p = placeStop(stop({ ...today, venue_name: "Sample Brewing Co.", city: "Corona" }), HOSTS);
    expect(p.kind).toBe("none");
  });

  it("rule 2: coordinates looked up for the current address", () => {
    const addr = "3900 Main St, Riverside, CA";
    const p = placeStop(stop({ ...today, address: addr, latitude: 33.98, longitude: -117.37, geocoded_address: addr }), HOSTS);
    expect(p).toEqual({ kind: "address", lat: 33.98, lng: -117.37 });
  });

  it("rule 2: coordinates for an OLD address are not used", () => {
    const p = placeStop(
      stop({ ...today, address: "500 New St, Riverside, CA", latitude: 33.98, longitude: -117.37, geocoded_address: "3900 Main St, Riverside, CA" }),
      HOSTS,
    );
    expect(p.kind).toBe("none");
  });

  it("rule 3: city only -> no pin", () => {
    expect(placeStop(stop({ ...today, city: "Corona" }), HOSTS).kind).toBe("none");
  });
});

describe("summarizeStops", () => {
  it("today at a Guild member", () => {
    const r = summarizeStops([stop({ ...today, venue_name: "All Points Brewing Co." })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" });
    expect(r.placement.kind).toBe("member");
  });

  it("today at a street address", () => {
    const addr = "3900 Main St, Riverside";
    const r = summarizeStops(
      [stop({ ...today, venue_name: "Riverside Food Truck Night", address: addr, latitude: 33.98, longitude: -117.37, geocoded_address: addr })],
      HOSTS,
      NOW,
    );
    expect(r.summary).toEqual({ state: "at-address", venue: "Riverside Food Truck Night", address: addr, time: "5–9 pm" });
  });

  it("today, city only", () => {
    const r = summarizeStops([stop({ ...today, city: "Corona" })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "in-city", place: "Corona", time: "5–9 pm" });
    expect(r.placement.kind).toBe("none");
  });

  it("no stop today -> next stop", () => {
    const r = summarizeStops([stop({ starts_at: "2026-10-10T00:00:00Z", city: "Riverside" })], HOSTS, NOW);
    expect(r.summary).toEqual({ state: "next", day: "Fri", city: "Riverside" });
  });

  it("nothing in 14 days -> none", () => {
    expect(summarizeStops([], HOSTS, NOW).summary).toEqual({ state: "none" });
  });
});

describe("needsStopGeocode / stopCoordinates", () => {
  const soon = "2026-10-06T01:00:00Z";
  it("a street address in the next 48 hours, never looked up -> yes", () => {
    expect(needsStopGeocode(stop({ starts_at: soon, address: "3900 Main St, Riverside, CA" }), NOW)).toBe(true);
  });
  it("already looked up for this address -> no; address changed -> yes", () => {
    const addr = "3900 Main St, Riverside, CA";
    expect(needsStopGeocode(stop({ starts_at: soon, address: addr, geocoded_address: addr }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: soon, address: "1 New St, Riverside", geocoded_address: addr }), NOW)).toBe(true);
  });
  it("no street number, past, or more than 48 hours out -> no", () => {
    expect(needsStopGeocode(stop({ starts_at: soon, address: "Riverside, CA" }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: "2026-10-04T01:00:00Z", address: "3900 Main St" }), NOW)).toBe(false);
    expect(needsStopGeocode(stop({ starts_at: "2026-10-09T01:00:00Z", address: "3900 Main St" }), NOW)).toBe(false);
  });
  it("stopCoordinates only while geocoded_address matches", () => {
    const addr = "3900 Main St";
    expect(stopCoordinates(stop({ address: addr, geocoded_address: addr, latitude: "33.98", longitude: "-117.37" }))).toEqual({ lat: 33.98, lng: -117.37 });
    expect(stopCoordinates(stop({ address: "x", geocoded_address: addr, latitude: 1, longitude: 1 }))).toBeNull();
  });
});

describe("needsStopGeocode: a stop added after it started", () => {
  it("still looks up a stop that is on now (started hours ago, ends later)", () => {
    const allDayish = stop({ starts_at: "2026-10-05T18:00:00Z", ends_at: "2026-10-06T04:00:00Z", address: "3900 Main St, Riverside" });
    expect(needsStopGeocode(allDayish, NOW)).toBe(true);
  });
  it("doesn't look up a stop that has ended", () => {
    const over = stop({ starts_at: "2026-10-05T15:00:00Z", ends_at: "2026-10-05T19:00:00Z", address: "3900 Main St, Riverside" });
    expect(needsStopGeocode(over, NOW)).toBe(false);
  });
});

describe("placeStop with a Google-picked venue", () => {
  it("a picked place at a Guild member's street address goes beside that member", () => {
    const addr = "2023 Chicago Ave Unit B8, Riverside, CA 92507, USA";
    const p = placeStop(
      stop({ ...today, venue_name: "Some Other Name", address: addr, latitude: 33.97, longitude: -117.35, geocoded_address: addr }),
      HOSTS,
    );
    expect(p.kind === "member" && p.host.slug).toBe("all-points");
  });
});

describe("matchHost (the one rule for which taproom a stop is at)", () => {
  const hosts = [
    { id: "a", name: "Mars Brewing Co.", slug: "mars", city: "Rancho Cucamonga", street: "9728 6th St" },
    { id: "b", name: "Sample Brewing Co.", slug: "s-riv", city: "Riverside", street: "3750 Main Street" },
    { id: "c", name: "Sample Brewing Co.", slug: "s-ont", city: "Ontario", street: "100 Euclid Ave" },
  ];
  it("by Google's name for the venue", () => {
    expect(matchHost({ venue_name: "Mars Brewing Company", address: null, city: null }, hosts)?.id).toBe("a");
  });
  it("by the picked address", () => {
    expect(matchHost({ venue_name: "Somewhere", address: "9728 6th St, Rancho Cucamonga, CA 91730, USA", city: null }, hosts)?.id).toBe("a");
  });
  it("several locations: the one in the stop's city, else none", () => {
    expect(matchHost({ venue_name: "Sample Brewing Co.", address: null, city: "Ontario" }, hosts)?.id).toBe("c");
    expect(matchHost({ venue_name: "Sample Brewing Co.", address: null, city: "Corona" }, hosts)).toBeNull();
  });
  it("no venue and no address: none", () => {
    expect(matchHost({ venue_name: null, address: null, city: "Riverside" }, hosts)).toBeNull();
  });
});
