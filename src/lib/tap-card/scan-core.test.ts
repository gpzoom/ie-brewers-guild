import { describe, expect, it, vi } from "vitest";
import { confirmScanCore, type ScanStore } from "./scan-core";
import type { PendingScan, StaffQrView } from "./staff-qr";

const now = new Date("2026-11-24T20:00:00Z");
const scan: PendingScan = { sessionId: "s1", memberId: "m1", staffCode: "ABCD1234", at: "2026-11-24T19:58:00Z" };
type Code = { memberId: string; view: StaffQrView } | null;

function store(over: { pending?: PendingScan | null; code?: Code } = {}) {
  let left = true;
  const claim = vi.fn(async () => {
    const won = left;
    left = false;
    return won;
  });
  const s: ScanStore = {
    pending: async () => (over.pending === undefined ? scan : over.pending),
    codeState: async () => (over.code === undefined ? { memberId: "m1", view: { kind: "note-scan" } } : over.code),
    claim,
  };
  return { s, claim };
}
const view = (kind: StaffQrView["kind"], memberId = "m1"): Code => ({ memberId, view: { kind } });

describe("confirmScanCore", () => {
  const cases: [string, { pending?: PendingScan | null; code?: Code }, string][] = [
    ["no scan", { pending: null }, "scan-again"],
    ["an old scan", { pending: { ...scan, at: "2026-11-24T19:54:00Z" } }, "scan-again"],
    ["a code nobody knows", { code: null }, "scan-again"],
    ["another member's code", { code: view("note-scan", "m2") }, "scan-again"],
    ["signed out", { code: view("sign-in") }, "scan-again"],
    ["turned off since", { code: view("turned-off") }, "turned-off"],
    ["closed since", { code: view("closed") }, "closed"],
  ];
  it.each(cases)("%s: not used up", async (_, over, kind) => {
    const { s, claim } = store(over);
    expect((await confirmScanCore(s, now, scan.at)).kind).toBe(kind);
    expect(claim).not.toHaveBeenCalled();
  });
  it.each(["2026-11-24T19:57:00Z", "", "nope"])("a tap on another check-in's screen (%s) never confirms this scan", async (shown) => {
    const { s, claim } = store();
    expect((await confirmScanCore(s, now, shown)).kind).toBe("scan-again");
    expect(claim).not.toHaveBeenCalled();
  });
  it("one scan is good for one confirm", async () => {
    const { s } = store();
    const kinds = (await Promise.all([confirmScanCore(s, now, scan.at), confirmScanCore(s, now, scan.at)])).map((r) => r.kind);
    expect(kinds.sort()).toEqual(["ok", "scan-again"]);
  });
});
