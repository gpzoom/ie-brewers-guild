import { describe, expect, it } from "vitest";
import {
  FLAG_LIMITS,
  customerLabels,
  flagRows,
  rowKey,
  totals,
  visitFlagged,
  wrongTryGroups,
  type ActivityRow,
  type MemberHours,
} from "./staff-activity";

const TZ = "America/Los_Angeles";

function weekly(open: string, close: string, overrides: Record<number, Partial<MemberHours["hours"][number]>> = {}) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opensAt: open,
    closesAt: close,
    closesNextDay: false,
    isClosed: false,
    ...overrides[weekday],
  }));
}

const plain: MemberHours = { timezone: TZ, hours: weekly("12:00", "21:00"), specialHours: [] };

// September 2026 is PDT (UTC-7). Sep 2 2026 is a Wednesday.
function pdt(day: number, hhmm: string, seconds = 0) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, day, h + 7, m, seconds)).toISOString();
}

let seq = 0;
function row(over: Partial<ActivityRow> = {}): ActivityRow {
  seq++;
  return {
    id: `r${seq}`,
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

function flagsFor(r: ActivityRow, hours = plain) {
  return flagRows([r], hours).get(r.id) ?? [];
}

describe("rowKey", () => {
  it("names the person, the counter or the shared code", () => {
    expect(rowKey(row({ staffId: "maria" }))).toBe("staff:maria");
    expect(rowKey(row({ source: "counter", staffId: null }))).toBe("counter");
    expect(rowKey(row({ source: "staff-code", staffId: null }))).toBe("staff-code");
  });
});

describe("outside open hours", () => {
  it("allows up to 60 minutes either side of 12:00-21:00", () => {
    expect(flagsFor(row({ at: pdt(2, "11:01") }))).toEqual([]);
    expect(flagsFor(row({ at: pdt(2, "21:59") }))).toEqual([]);
    expect(flagsFor(row({ at: pdt(2, "11:00") }))).toEqual([]);
    expect(flagsFor(row({ at: pdt(2, "22:00") }))).toEqual([]);
    expect(flagsFor(row({ at: pdt(2, "10:59") }))).toEqual(["outside-hours"]);
    expect(flagsFor(row({ at: pdt(2, "22:01") }))).toEqual(["outside-hours"]);
    expect(flagsFor(row({ at: pdt(2, "22:00", 30) }))).toEqual(["outside-hours"]);
  });

  it("applies to reward-used but never to undo or turned-off events", () => {
    expect(flagsFor(row({ event: "reward-used", at: pdt(2, "03:00") }))).toEqual(["outside-hours"]);
    expect(flagsFor(row({ event: "reward-undone", at: pdt(2, "03:00") }))).toEqual([]);
    expect(flagsFor(row({ event: "turned-off-code", at: pdt(2, "03:00") }))).toEqual(["turned-off-code"]);
  });

  it("handles a Friday close after midnight and a closed Saturday", () => {
    const hours: MemberHours = {
      timezone: TZ,
      hours: weekly("12:00", "21:00", {
        5: { closesAt: "01:00", closesNextDay: true },
        6: { opensAt: null, closesAt: null, isClosed: true },
      }),
      specialHours: [],
    };
    // Sat Sep 5 2026
    expect(flagsFor(row({ at: pdt(5, "00:30") }), hours)).toEqual([]);
    expect(flagsFor(row({ at: pdt(5, "01:59") }), hours)).toEqual([]);
    expect(flagsFor(row({ at: pdt(5, "02:01") }), hours)).toEqual(["outside-hours"]);
    expect(flagsFor(row({ at: pdt(5, "14:00") }), hours)).toEqual(["outside-hours"]);
  });

  it("flags a member whose weekly rows are all closed", () => {
    const hours: MemberHours = {
      timezone: TZ,
      hours: weekly(null as unknown as string, null as unknown as string, { 0: {}, 1: {} }).map((h) => ({
        ...h,
        opensAt: null,
        closesAt: null,
        isClosed: true,
      })),
      specialHours: [],
    };
    expect(flagsFor(row(), hours)).toEqual(["outside-hours"]);
  });

  it("uses special hours for the date", () => {
    const closed: MemberHours = {
      ...plain,
      specialHours: [{ date: "2026-09-02", isClosed: true, opensAt: null, closesAt: null, closesNextDay: false, note: null }],
    };
    expect(flagsFor(row({ at: pdt(2, "15:00") }), closed)).toEqual(["outside-hours"]);
    const opened: MemberHours = {
      timezone: TZ,
      hours: weekly(null as unknown as string, null as unknown as string).map((h) => ({
        ...h,
        opensAt: null,
        closesAt: null,
        isClosed: true,
      })),
      specialHours: [{ date: "2026-09-02", isClosed: false, opensAt: "10:00", closesAt: "14:00", closesNextDay: false, note: null }],
    };
    expect(flagsFor(row({ at: pdt(2, "11:00") }), opened)).toEqual([]);
    expect(flagsFor(row({ at: pdt(3, "11:00") }), opened)).toEqual(["outside-hours"]);
  });

  it("never flags a member with no hours posted", () => {
    expect(flagsFor(row({ at: pdt(2, "03:00") }), { timezone: TZ, hours: [], specialHours: [] })).toEqual([]);
  });

  it("copes with the Nov 1 2026 clock change", () => {
    // Noon PST = 20:00Z
    const noon = new Date(Date.UTC(2026, 10, 1, 20, 0)).toISOString();
    expect(flagsFor(row({ at: noon }))).toEqual([]);
    const early = new Date(Date.UTC(2026, 10, 1, 9, 30)).toISOString(); // 1:30 am local
    expect(flagsFor(row({ at: early }))).toEqual(["outside-hours"]);
  });

  it("does not throw on an empty list", () => {
    expect(flagRows([], plain).size).toBe(0);
  });
});

describe("several at once", () => {
  const four = (staffId: string, method: "qr" | "pin", step = 1) =>
    ["a", "b", "c", "d"].map((h, i) =>
      row({ holderId: h, staffId, method: i % 2 ? "pin" : method, at: pdt(2, `15:0${i * step}`) }),
    );

  it("flags all four different customers within 5 minutes, QR and 4-digit combined", () => {
    const rows = four("maria", "qr");
    const flags = flagRows(rows, plain);
    for (const r of rows) expect(flags.get(r.id)).toContain("burst");
  });

  it("does not flag three, or four spread beyond 5 minutes, or one customer four times", () => {
    const three = four("maria", "qr").slice(0, 3);
    expect([...flagRows(three, plain).values()].flat()).not.toContain("burst");
    const spread = ["a", "b", "c", "d"].map((h, i) => row({ holderId: h, at: pdt(2, `15:${String(i * 2).padStart(2, "0")}`) }));
    // 0, 2, 4, 6 minutes: only three fit in any 5-minute span
    expect([...flagRows(spread, plain).values()].flat()).not.toContain("burst");
    const same = [0, 1, 2, 3].map((i) => row({ holderId: "a", at: pdt(2, `15:0${i}`) }));
    expect([...flagRows(same, plain).values()].flat()).not.toContain("burst");
  });

  it("flags every check-in in the window, including ones before the fourth customer", () => {
    const rows = [
      row({ holderId: "a", at: pdt(2, "15:00") }),
      row({ holderId: "a", at: pdt(2, "15:01") }),
      row({ holderId: "b", at: pdt(2, "15:02") }),
      row({ holderId: "c", at: pdt(2, "15:03") }),
      row({ holderId: "d", at: pdt(2, "15:05") }),
    ];
    const flags = flagRows(rows, plain);
    for (const r of rows) expect(flags.get(r.id)).toContain("burst");
  });

  it("never applies to the counter or the shared code, and never mixes people", () => {
    const counter = ["a", "b", "c", "d"].map((h) => row({ holderId: h, source: "counter", staffId: null }));
    const shared = ["a", "b", "c", "d"].map((h) => row({ holderId: h, source: "staff-code", staffId: null }));
    expect([...flagRows([...counter, ...shared], plain).values()].flat()).not.toContain("burst");
    const mixed = ["a", "b", "c", "d"].map((h, i) => row({ holderId: h, staffId: i < 2 ? "maria" : "joe" }));
    expect([...flagRows(mixed, plain).values()].flat()).not.toContain("burst");
  });

  it("handles a long run quickly", () => {
    const rows = Array.from({ length: 30000 }, (_, i) =>
      row({ holderId: `h${i % 500}`, staffId: `s${i % 7}`, at: new Date(Date.UTC(2026, 8, 2, 22, 0) + i * 20_000).toISOString() }),
    );
    const t0 = Date.now();
    flagRows(rows, plain);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });
});

describe("same customer, same code", () => {
  const visits = (n: number, staffId: string, holderId = "h1", method: "qr" | "pin" = "qr") =>
    Array.from({ length: n }, (_, i) => row({ holderId, staffId, method, at: pdt(2, `1${i}:00`) }));

  it("flags the 4 on Maria when 4 of 5 are hers", () => {
    const mine = visits(4, "maria");
    const other = visits(1, "joe");
    const flags = flagRows([...mine, ...other], plain);
    for (const r of mine) expect(flags.get(r.id)).toContain("same-customer");
    expect(flags.get(other[0].id) ?? []).not.toContain("same-customer");
  });

  it("does not flag 3 of 5, or 4 of 4", () => {
    const threeOfFive = [...visits(3, "maria"), ...visits(2, "joe")];
    expect([...flagRows(threeOfFive, plain).values()].flat()).not.toContain("same-customer");
    expect([...flagRows(visits(4, "maria"), plain).values()].flat()).not.toContain("same-customer");
  });

  it("counts old and new codes of one person together", () => {
    const rows = [...visits(2, "maria", "h1", "qr"), ...visits(3, "maria", "h1", "pin")];
    const flags = flagRows(rows, plain);
    for (const r of rows) expect(flags.get(r.id)).toContain("same-customer");
  });

  it("counts counter check-ins in the denominator", () => {
    const rows = [...visits(4, "maria"), row({ source: "counter", staffId: null, holderId: "h1" })];
    const flags = flagRows(rows, plain);
    expect(flags.get(rows[0].id)).toContain("same-customer");
  });
});

describe("turned-off codes", () => {
  it("get that flag only", () => {
    const r = row({ event: "turned-off-code", at: pdt(2, "03:00") });
    expect(flagsFor(r)).toEqual(["turned-off-code"]);
  });
});

describe("totals", () => {
  it("counts gross rewards, undos apart, and turned-off as a flag only", () => {
    const rows = [
      row({ id: "a", event: "check-in" }),
      row({ id: "b", event: "reward-used" }),
      row({ id: "c", event: "reward-used" }),
      row({ id: "d", event: "reward-undone" }),
      row({ id: "e", event: "turned-off-code" }),
      row({ id: "f", source: "counter", staffId: null }),
    ];
    const flags = new Map([["e", ["turned-off-code" as const]], ["a", ["burst" as const, "same-customer" as const]]]);
    const result = totals(rows, flags);
    const maria = result.find((t) => t.key === "staff:maria")!;
    expect(maria).toEqual({
      key: "staff:maria",
      checkIns: 1,
      rewards: 2,
      undone: 1,
      flags: { "turned-off-code": 1, burst: 1, "same-customer": 1 },
    });
    expect(result.find((t) => t.key === "counter")).toMatchObject({ checkIns: 1, rewards: 0 });
  });
});

describe("wrongTryGroups", () => {
  const tries = (n: number, holderId: string, hour = 10) =>
    Array.from({ length: n }, (_, i) => ({ holderId, at: pdt(2, `${hour}:0${i}`) }));

  it("lists 5 in one local day and not 4", () => {
    expect(wrongTryGroups(tries(5, "h1"), TZ)).toEqual([{ holderId: "h1", day: "2026-09-02", tries: 5 }]);
    expect(wrongTryGroups(tries(4, "h1"), TZ)).toEqual([]);
  });

  it("uses the member's local day, not UTC", () => {
    // 23:00 local and 01:00 local next day are 2 hours apart but different days
    const misses = [
      ...Array.from({ length: 3 }, () => ({ holderId: "h1", at: pdt(2, "23:00") })),
      ...Array.from({ length: 2 }, () => ({ holderId: "h1", at: pdt(3, "01:00") })),
    ];
    expect(wrongTryGroups(misses, TZ)).toEqual([]);
  });
});

describe("customerLabels", () => {
  it("makes stable Customer labels with at least 3 uppercase hex digits", async () => {
    const a = await customerLabels("m1", ["h1", "h2"]);
    expect(a.get("h1")).toMatch(/^Customer [0-9A-F]{3,}$/);
    const b = await customerLabels("m1", ["h1"]);
    expect(b.get("h1")).toBe(a.get("h1"));
  });

  it("differs for another member", async () => {
    const a = await customerLabels("m1", ["h1"]);
    const b = await customerLabels("m2", ["h1"]);
    expect(a.get("h1")).not.toBe(b.get("h1"));
  });

  it("lengthens colliding labels until unique", async () => {
    const ids = Array.from({ length: 6000 }, (_, i) => `holder-${i}`); // 4096 3-digit buckets: collisions certain
    const labels = await customerLabels("m1", ids);
    expect(new Set(labels.values()).size).toBe(ids.length);
    expect([...labels.values()].some((l) => l.length > "Customer ".length + 3)).toBe(true);
  });

  it("copes with an empty list", async () => {
    expect((await customerLabels("m1", [])).size).toBe(0);
  });
});

describe("FLAG_LIMITS", () => {
  it("holds the agreed numbers", () => {
    expect(FLAG_LIMITS).toEqual({ graceMinutes: 60, burstCustomers: 4, burstMinutes: 5, sameVisits: 5, sameShare: 0.8, wrongTries: 5, noLocationVisits: 3 });
  });
});

describe("rowKey for a deleted person", () => {
  it("groups staff events with no staff id as staff:removed, not the shared code", () => {
    expect(rowKey(row({ source: "staff", staffId: null }))).toBe("staff:removed");
  });
});

describe("location flags", () => {
  const kinds = (rows: ActivityRow[]) => {
    const f = flagRows(rows, plain);
    return rows.map((r) => f.get(r.id) ?? []);
  };
  const at = pdt(2, "15:00");
  it("flags a far check-in, not a far reward", () => {
    expect(kinds([row({ at, location: "far" }), row({ at, event: "reward-used", location: "far" })])).toEqual([["far"], []]);
  });
  const none = () => row({ at, staffId: null, source: "counter", location: "none" });
  it("flags no location only as a pattern", () => {
    expect(kinds([none(), none()])).toEqual([[], []]);
    expect(kinds([none(), none(), none()])).toEqual([["no-location"], ["no-location"], ["no-location"]]);
    expect(kinds([none(), none(), none(), { ...none(), location: "near" }])).toEqual([[], [], [], []]);
    expect(kinds([{ ...none(), location: "far" }, none(), none()])).toEqual([["far"], ["no-location"], ["no-location"]]);
    expect(kinds([none(), none(), { ...none(), location: null }])).toEqual([[], [], []]);
    expect(kinds([none(), none(), { ...none(), holderId: "h2" }])).toEqual([[], [], []]);
  });
  it("a closed day is outside open hours", () => {
    const wed: MemberHours = { ...plain, hours: weekly("12:00", "21:00", { 3: { isClosed: true, opensAt: null, closesAt: null } }) };
    const special: MemberHours = { ...plain, specialHours: [{ date: "2026-09-02", isClosed: true, opensAt: null, closesAt: null, closesNextDay: false, note: null }] };
    for (const h of [wed, special]) expect([...flagRows([row({ at })], h).values()]).toEqual([["outside-hours"]]);
  });
});

describe("visitFlagged", () => {
  const inHours = pdt(2, "15:00");
  const check = (location: ActivityRow["location"], at = inHours, hours = plain) => visitFlagged([{ at, location }], hours);
  it("flags far away and no location, each on its own", () => {
    expect(check("far")).toBe(true);
    expect(check("none")).toBe(true);
    expect(check("near")).toBe(false);
  });
  it("doesn't flag where location isn't judged", () => expect(check(null)).toBe(false));
  it("flags outside open hours, with the same 60 minutes either side", () => {
    expect(check("near", pdt(2, "22:00"))).toBe(false);
    expect(check("near", pdt(2, "22:01"))).toBe(true);
    expect(check("near", pdt(2, "10:59"))).toBe(true);
  });
  it("flags a closed day, and never without posted hours", () => {
    expect(check("near", inHours, { ...plain, hours: weekly("12:00", "21:00", { 3: { isClosed: true } }) })).toBe(true);
    expect(check("near", pdt(2, "03:00"), { timezone: TZ, hours: [], specialHours: [] })).toBe(false);
  });
  it("flags the visit when either the check-in or the reward was", () => {
    expect(visitFlagged([{ at: inHours, location: "far" }, { at: inHours, location: "near" }], plain)).toBe(true);
    expect(visitFlagged([], plain)).toBe(false);
  });
});
