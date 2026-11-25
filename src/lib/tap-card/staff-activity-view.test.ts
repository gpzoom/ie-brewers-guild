import { describe, expect, it } from "vitest";
import { buildPage, buildSummary, countBeforeTracking, isRowKey, labelsFor, parseRange, rangeStart } from "./staff-activity-view";
import type { ActivityRow, MemberHours } from "./staff-activity";

const TZ = "America/Los_Angeles";
const noHours: MemberHours = { timezone: TZ, hours: [], specialHours: [] };
const open: MemberHours = {
  timezone: TZ,
  hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "12:00", closesAt: "21:00", closesNextDay: false, isClosed: false })),
  specialHours: [],
};
// September 2026 is PDT (UTC-7).
const pdt = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, day, h + 7, m)).toISOString();
};

let seq = 0;
function row(over: Partial<ActivityRow> = {}): ActivityRow {
  seq++;
  return {
    id: `r${String(seq).padStart(4, "0")}`,
    holderId: "h1",
    visitId: null,
    at: pdt(2, "15:00"),
    event: "check-in",
    source: "staff",
    staffId: "maria",
    method: "qr",
    reward: null,
    location: null,
    ...over,
  };
}
const staff = [
  { id: "jake", name: "Jake", removed: false },
  { id: "maria", name: "maria", removed: false },
  { id: "old", name: "Old Pete", removed: true },
  { id: "gone", name: "Gone Gail", removed: true },
];
const labels = new Map([
  ["h1", "Customer AAA"],
  ["h2", "Customer BBB"],
]);

describe("parseRange and rangeStart", () => {
  it("keeps 7, 30, 90 and all, and turns anything else into 30", () => {
    expect(parseRange(7)).toBe(7);
    expect(parseRange(90)).toBe(90);
    expect(parseRange("all")).toBe("all");
    for (const bad of [0, 14, "30", null, undefined, -7, {}]) expect(parseRange(bad)).toBe(30);
  });
  it("starts N x 24 hours before now; all has no start", () => {
    const now = new Date("2026-11-23T12:00:00.000Z");
    expect(rangeStart(7, now)).toBe("2026-11-16T12:00:00.000Z");
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("isRowKey", () => {
  it("accepts rowKey formats only", () => {
    for (const ok of ["counter", "staff-code", "staff:removed", "staff:0b8f3c1e-1111-4222-8333-444455556666"]) expect(isRowKey(ok)).toBe(true);
    for (const bad of ["", "staff:", "staff:%", "Counter", "x", 5, null, "staff:abc def"]) expect(isRowKey(bad)).toBe(false);
  });
});

describe("countBeforeTracking", () => {
  it("counts visits with no activity row, whatever the row's date", () => {
    expect(countBeforeTracking(["a", "b", "c"], ["b", null, "zzz"])).toBe(2);
    expect(countBeforeTracking([], ["a"])).toBe(0);
  });
});

describe("buildSummary", () => {
  it("shows every active person, the counter and the shared code even with no activity", () => {
    const s = buildSummary({ rows: [], hours: noHours, staff, labels: new Map(), misses: [], beforeTracking: 3 });
    expect(s.rows.map((r) => [r.key, r.name, r.removed, r.checkIns])).toEqual([
      ["staff:jake", "Jake", false, 0],
      ["staff:maria", "maria", false, 0],
      ["counter", "Behind the counter", false, 0],
      ["staff-code", "Shared code", false, 0],
    ]);
    expect(s.beforeTracking).toBe(3);
  });

  it("lists a removed person only with activity, after active staff and before the counter", () => {
    const rows = [row({ staffId: "old" }), row({ source: "counter", staffId: null }), row({ staffId: "jake", event: "reward-used", reward: "Pint" })];
    const s = buildSummary({ rows, hours: noHours, staff, labels, misses: [], beforeTracking: 0 });
    expect(s.rows.map((r) => r.key)).toEqual(["staff:jake", "staff:maria", "staff:old", "counter", "staff-code"]);
    expect(s.rows[2]).toMatchObject({ name: "Old Pete", removed: true, checkIns: 1 });
    expect(s.rows[0]).toMatchObject({ rewards: 1 });
  });

  it("groups events of a deleted staff person as Removed staff, never the shared code", () => {
    const rows = [row({ staffId: null }), row({ source: "staff-code", staffId: null, method: "pin" })];
    const s = buildSummary({ rows, hours: noHours, staff, labels, misses: [], beforeTracking: 0 });
    const keys = s.rows.map((r) => r.key);
    expect(s.rows.find((r) => r.key === "staff:removed")).toMatchObject({ name: "Removed staff", removed: true, checkIns: 1 });
    expect(s.rows.find((r) => r.key === "staff-code")?.checkIns).toBe(1);
    expect(keys.indexOf("staff:removed")).toBeLessThan(keys.indexOf("counter"));
  });

  it("counts flags and turns wrong tries into labelled groups", () => {
    const rows = [row({ at: pdt(2, "03:00") })];
    const misses = Array.from({ length: 5 }, () => ({ holderId: "h2", at: pdt(2, "15:00") }));
    const s = buildSummary({ rows, hours: open, staff, labels, misses, beforeTracking: 0 });
    expect(s.rows.find((r) => r.key === "staff:maria")?.flags).toEqual({ "outside-hours": 1 });
    expect(s.wrongTries).toEqual([{ customer: "Customer BBB", day: "2026-09-02", tries: 5 }]);
  });

  it("carries no holder id or row id", () => {
    const s = buildSummary({ rows: [row()], hours: noHours, staff, labels, misses: [], beforeTracking: 0 });
    expect(JSON.stringify(s)).not.toMatch(/holder|"h1"|r00/);
  });
});

describe("buildPage", () => {
  const many = Array.from({ length: 120 }, (_, i) => row({ at: new Date(Date.UTC(2026, 8, 2, 20, i)).toISOString(), holderId: `x${i}` }));
  const page = (offset: number, key = "staff:maria") => buildPage({ rows: many, hours: noHours, labels, key, offset });

  it("returns 50 newest first, with more while rows remain", () => {
    const first = page(0);
    expect(first.items).toHaveLength(50);
    expect(first.more).toBe(true);
    expect(first.items[0].at > first.items[49].at).toBe(true);
    expect(page(100).items).toHaveLength(20);
    expect(page(100).more).toBe(false);
    expect(page(70).more).toBe(false);
    expect(page(69).more).toBe(true);
  });

  it("clamps a bad offset to a nonnegative integer", () => {
    const first = page(0).items[0].id;
    for (const offset of [-5, Number.NaN, Number.NEGATIVE_INFINITY]) expect(page(offset).items[0].id).toBe(first);
    expect(page(1.7).items[0].id).toBe(page(1).items[0].id);
  });

  it("returns an empty list for a key that is not valid", () => {
    expect(page(0, "nope")).toEqual({ items: [], more: false });
  });

  it("filters by key and computes flags over the whole range, not the page", () => {
    // Five check-ins by one customer on Maria's code flag all five, even on a later page.
    const five = Array.from({ length: 5 }, (_, i) => row({ at: pdt(2, `1${i}:00`) }));
    const other = row({ staffId: "jake", holderId: "h2" });
    const p = buildPage({ rows: [...five, other], hours: noHours, labels, key: "staff:maria", offset: 4 });
    expect(p.items).toHaveLength(1);
    expect(p.items[0].flags).toEqual(["same-customer"]);
    expect(p.items[0].customer).toBe("Customer AAA");
  });

  it("returns only the safe fields", () => {
    const [item] = buildPage({ rows: [row({ event: "reward-used", reward: "Pint" })], hours: noHours, labels, key: "staff:maria", offset: 0 }).items;
    expect(Object.keys(item).sort()).toEqual(["at", "customer", "event", "flags", "id", "location", "method", "reward"]);
  });

  it("finds Removed staff rows by their key", () => {
    const p = buildPage({ rows: [row({ staffId: null }), row()], hours: noHours, labels, key: "staff:removed", offset: 0 });
    expect(p.items).toHaveLength(1);
  });
});

describe("labelsFor", () => {
  it("gives the same customer the same label whichever range is shown", async () => {
    // Enough customers that some share their first three digits and get longer labels.
    const everyone = Array.from({ length: 6000 }, (_, i) => `holder-${i}`);
    const labelsAll = await labelsFor("m1", [everyone, everyone.slice(0, 10)]);
    const inRange = (ids: string[]) => ids.map((id, i) => row({ holderId: id, staffId: "maria", at: new Date(Date.UTC(2026, 8, 2, 20, 0, i)).toISOString() }));
    const short = buildPage({ rows: inRange(everyone.slice(0, 20)), hours: noHours, labels: labelsAll, key: "staff:maria", offset: 0 }).items;
    const long = buildPage({ rows: inRange(everyone.slice(0, 40)), hours: noHours, labels: labelsAll, key: "staff:maria", offset: 0 }).items;
    const byTime = (items: typeof short) => items.map((i) => i.customer);
    expect(byTime(long).slice(-20).sort()).toEqual(byTime(short).sort());
    expect(new Set(labelsAll.values()).size).toBe(6000);
  });
});

describe("location", () => {
  it("is on each list item", () => {
    const page = buildPage({ rows: [row({ location: "near" })], hours: noHours, labels, key: "staff:maria", offset: 0 });
    expect(page.items[0].location).toBe("near");
  });
});
