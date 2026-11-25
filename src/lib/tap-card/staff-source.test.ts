import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarReward } from "@/lib/tap-card/loyalty";
import { loadPersonalPins } from "./plate-store.server";
import { activityFor, logActivity, logTurnedOff, logVisitActivity, pinSource, sourceByQr, type Source } from "./staff-source.server";

type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };
type Tables = Record<string, Row[]>;

/** Just enough of the client: eq/is/in filters, maybeSingle, await, and insert. */
function fakeService(tables: Tables, opts: { insertError?: Failure; insertThrows?: boolean; readError?: Record<string, Failure> } = {}) {
  const inserted: Row[] = [];
  const service = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const error = opts.readError?.[table] ?? null;
      const keep = (test: (r: Row) => boolean) => {
        rows = rows.filter(test);
        return q;
      };
      const q = {
        select: () => q,
        eq: (col: string, value: unknown) => keep((r) => r[col] === value),
        is: (col: string, value: unknown) => keep((r) => (r[col] ?? null) === value),
        in: (col: string, values: unknown[]) => keep((r) => values.includes(r[col])),
        maybeSingle: async () => (error ? { data: null, error } : { data: rows[0] ?? null, error: null }),
        then: (done: (r: unknown) => unknown) => Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(done),
        insert: async (added: Row[]) => {
          if (opts.insertThrows) throw new Error("network down");
          if (opts.insertError) return { error: opts.insertError };
          inserted.push(...added);
          return { error: null };
        },
      };
      return q as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  };
  return { service: service as unknown as SupabaseClient, inserted };
}

const OFF = "2026-11-20T00:00:00Z";
const namedRow = (over: Row = {}): Row => ({ id: "c1", member_id: "m1", staff_id: "s1", kind: "qr", code: "NAMED001", turned_off_at: null, ...over });
const oldCounter = (code: string): Row => ({ id: "c9", member_id: "m1", staff_id: null, kind: "qr", code, turned_off_at: OFF });
const tables = (codes: Row[], removedAt: string | null = null): Tables => ({
  tap_card_staff_codes: codes,
  tap_card_staff: [{ id: "s1", member_id: "m1", removed_at: removedAt }],
  tap_card_plates: [{ member_id: "m1", staff_qr: "C0NTER01" }],
});

const error = vi.spyOn(console, "error");
beforeEach(() => {
  error.mockReset();
  error.mockImplementation(() => {});
});

describe("sourceByQr", () => {
  const named: Source = { source: "staff", staffId: "s1", codeId: "c1", method: "qr", codeText: "NAMED001" };
  const find = (t: Tables, token: string) => sourceByQr(fakeService(t).service, token);

  it("names the person for their active code", async () => {
    expect(await find(tables([namedRow()]), "NAMED001")).toEqual({ memberId: "m1", active: true, source: named });
  });
  it("knows a turned-off named code", async () => {
    expect(await find(tables([namedRow({ turned_off_at: OFF })]), "NAMED001")).toEqual({ memberId: "m1", active: false, source: named });
  });
  it("treats a removed person's code as turned off", async () => {
    expect((await find(tables([namedRow()], OFF), "NAMED001"))?.active).toBe(false);
  });
  it("knows a turned-off counter QR", async () => {
    expect(await find(tables([oldCounter("C0NTER00")]), "C0NTER00")).toEqual({
      memberId: "m1",
      active: false,
      source: { source: "counter", method: "qr", codeText: "C0NTER00" },
    });
  });
  const current = { memberId: "m1", active: true, source: { source: "counter", method: "qr", codeText: "C0NTER01" } };
  it("knows the current counter QR", async () => {
    expect(await find(tables([]), "C0NTER01")).toEqual(current);
  });
  it("keeps the current counter QR working when a failed reset also recorded it as turned off", async () => {
    expect(await find(tables([oldCounter("C0NTER01")]), "C0NTER01")).toEqual(current);
  });
  it("doesn't know anything else, including a 4-digit code", async () => {
    expect(await find(tables([]), "N0TH1NG0")).toBeNull();
    expect(await find(tables([namedRow({ kind: "pin", code: "4816" })]), "4816")).toBeNull();
  });
  it.each(["tap_card_staff_codes", "tap_card_staff", "tap_card_plates"])("throws when reading %s fails", async (table) => {
    const token = table === "tap_card_plates" ? "C0NTER01" : "NAMED001";
    const { service } = fakeService(tables([namedRow()]), { readError: { [table]: { message: "db down" } } });
    await expect(sourceByQr(service, token)).rejects.toThrow("That didn't work. Try again.");
  });
});

describe("loadPersonalPins", () => {
  const pin = (over: Row = {}) => namedRow({ id: "p1", kind: "pin", code: "4816", ...over });
  it("loads only this member's active 4-digit codes, never a removed person's", async () => {
    const t = tables([pin(), pin({ id: "p2", code: "1111", turned_off_at: OFF }), pin({ id: "p3", code: "2222", member_id: "m2" }), namedRow()]);
    expect(await loadPersonalPins(fakeService(t).service, "m1")).toEqual([{ codeId: "p1", staffId: "s1", code: "4816", active: true }]);
    expect(await loadPersonalPins(fakeService(tables([pin()], OFF)).service, "m1")).toEqual([]);
  });
  it.each(["tap_card_staff_codes", "tap_card_staff"])("throws when reading %s fails", async (table) => {
    const { service } = fakeService(tables([pin()]), { readError: { [table]: { message: "db down" } } });
    await expect(loadPersonalPins(service, "m1")).rejects.toThrow("That didn't work. Try again.");
  });
});

describe("pinSource", () => {
  it("never carries the 4-digit code", () => {
    expect(pinSource({ source: "staff", staffId: "s1", codeId: "p1" })).toEqual({ source: "staff", staffId: "s1", codeId: "p1", method: "pin", codeText: null });
    expect(pinSource({ source: "staff-code" })).toEqual({ source: "staff-code", method: "pin" });
    expect(pinSource(null)).toBeNull();
  });
});

const reward: BarReward = { kind: "member", id: "r1", reward: "Free pint", terms: "", expiresAt: "2027-01-01T00:00:00Z" };
const counter: Source = { source: "counter", method: "qr", codeText: "C0NTER01" };
const person: Source = { source: "staff", staffId: "s1", codeId: "p1", method: "pin", codeText: null };
const shared: Source = { source: "staff-code", method: "pin" };
const result = (firstToday: boolean, used: BarReward | null, outcome?: "used" | "already-used-today" | "not-available" | "undone" | "nothing-to-undo") => ({
  state: { firstToday, used },
  outcome,
});

describe("activityFor", () => {
  const brief = (before: BarReward | null, r: ReturnType<typeof result>) => activityFor(before, r, counter).map((a) => [a.event, a.reward]);

  it("first confirm: a check-in", () => {
    expect(brief(null, result(true, null))).toEqual([["check-in", null]]);
  });
  it("first confirm with a reward: both, with the reward's text", () => {
    expect(brief(null, result(true, reward, "used"))).toEqual([["check-in", null], ["reward-used", "Free pint"]]);
  });
  it("second confirm the same day: nothing, even with a reward used earlier", () => {
    expect(brief(null, result(false, null))).toEqual([]);
    expect(brief(null, result(false, reward))).toEqual([]);
  });
  it("second confirm with a reward: only the reward", () => {
    expect(brief(null, result(false, reward, "used"))).toEqual([["reward-used", "Free pint"]]);
  });
  it.each(["already-used-today", "not-available"] as const)("%s: no reward", (outcome) => {
    expect(brief(null, result(true, reward, outcome))).toEqual([["check-in", null]]);
    expect(brief(null, result(false, reward, outcome))).toEqual([]);
  });
  it("undo: the reward that was used", () => {
    expect(brief(reward, result(false, null, "undone"))).toEqual([["reward-undone", "Free pint"]]);
    expect(brief(null, result(false, null, "nothing-to-undo"))).toEqual([]);
  });
  it("carries the source, and never a 4-digit code's text", () => {
    const of = (source: Source) => activityFor(null, result(true, null), source)[0];
    expect(of(counter)).toMatchObject({ source: "counter", method: "qr", code_text: "C0NTER01", staff_id: null, code_id: null });
    expect(of(person)).toMatchObject({ source: "staff", method: "pin", code_text: null, staff_id: "s1", code_id: "p1" });
    expect(of(shared)).toMatchObject({ source: "staff-code", method: "pin", code_text: null, staff_id: null, code_id: null });
    expect(of({ ...person, codeText: "4816" } as Source)).toMatchObject({ code_text: null });
  });
});

// 11:30 pm Pacific on Nov 22 (already Nov 23 in UTC).
const at = new Date("2026-11-23T07:30:00Z");
const input = { holderId: "h1", memberId: "m1", cardId: null, deviceId: null, at };

describe("logVisitActivity", () => {
  it("writes each event with the visit and the Pacific day", async () => {
    const { service, inserted } = fakeService({});
    const findVisit = vi.fn(async () => ({ id: "v1", redeemedYear: null }));
    await logVisitActivity(service, { findVisit }, input, null, result(true, reward, "used"), person);
    expect(findVisit).toHaveBeenCalledWith("h1", "m1", "2026-11-22");
    expect(inserted.map((r) => r.event)).toEqual(["check-in", "reward-used"]);
    for (const row of inserted) {
      expect(row).toMatchObject({ member_id: "m1", holder_id: "h1", visit_id: "v1", day: "2026-11-22", at: at.toISOString(), code_text: null });
    }
  });
  it("still logs when the visit can't be read, and reads nothing when there's nothing to log", async () => {
    const { service, inserted } = fakeService({});
    const findVisit = vi.fn(async () => {
      throw new Error("db down");
    });
    await logVisitActivity(service, { findVisit }, input, null, result(false, null), counter);
    expect(findVisit).not.toHaveBeenCalled();
    await logVisitActivity(service, { findVisit }, input, null, result(true, null), counter);
    expect(inserted).toMatchObject([{ event: "check-in", visit_id: null }]);
  });
});

describe("location on activity", () => {
  it("goes on the check-in and the reward, never on an undo", async () => {
    const { service, inserted } = fakeService({});
    const input = { holderId: "h1", memberId: "m1", cardId: null, deviceId: null, at: new Date("2026-11-24T20:00:00Z") };
    const store = { findVisit: async () => null };
    await logVisitActivity(service, store, input, null, result(true, reward, "used"), person, "far");
    await logVisitActivity(service, store, input, reward, result(false, null, "undone"), person, "far");
    expect(inserted.map((r) => [r.event, r.location])).toEqual([["check-in", "far"], ["reward-used", "far"], ["reward-undone", null]]);
  });
});

describe("logActivity", () => {
  const rows = [{ ...activityFor(null, result(true, null), counter)[0], member_id: "m1", holder_id: "h1", visit_id: null, at: at.toISOString(), day: "2026-11-22" }];
  it("swallows a returned error and a thrown one, logging both", async () => {
    await logActivity(fakeService({}, { insertError: { code: "42P01", message: "no table" } }).service, rows);
    expect(error).toHaveBeenCalledTimes(1);
    await logActivity(fakeService({}, { insertThrows: true }).service, rows);
    expect(error).toHaveBeenCalledTimes(2);
  });
  it("says nothing about a repeat", async () => {
    await logActivity(fakeService({}, { insertError: { code: "23505", message: "duplicate" } }).service, rows);
    expect(error).not.toHaveBeenCalled();
  });
  it("doesn't write an empty list", async () => {
    await logActivity(fakeService({}, { insertThrows: true }).service, []);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("logTurnedOff", () => {
  const named: Source = { source: "staff", staffId: "s1", codeId: "c1", method: "qr", codeText: "NAMED001" };
  const tried = { holderId: "h1", memberId: "m1", token: "NAMED001", source: named, at };
  it("records the code's text and the Pacific day", async () => {
    const { service, inserted } = fakeService({ tap_card_holders: [{ id: "h1" }] });
    await logTurnedOff(service, tried);
    expect(inserted).toEqual([
      {
        member_id: "m1",
        holder_id: "h1",
        visit_id: null,
        at: at.toISOString(),
        day: "2026-11-22",
        event: "turned-off-code",
        source: "staff",
        staff_id: "s1",
        code_id: "c1",
        method: "qr",
        code_text: "NAMED001",
        reward: null,
      },
    ]);
  });
  it("records nothing for a customer who's gone, and never throws", async () => {
    const gone = fakeService({ tap_card_holders: [] });
    await logTurnedOff(gone.service, tried);
    expect(gone.inserted).toEqual([]);
    const broken = fakeService({}, { readError: { tap_card_holders: { message: "db down" } } });
    await logTurnedOff(broken.service, tried);
    expect(broken.inserted).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
