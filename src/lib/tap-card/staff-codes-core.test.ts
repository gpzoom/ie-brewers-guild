import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  freshQr,
  makeStaffCodesCore,
  removeStaffCore,
  renameStaffCore,
  replaceStaffCodeCore,
  resetCounterQrCore,
  saveSharedCodeCore,
  setSharedCodeOffCore,
  staffCodesView,
  turnOffStaffCore,
  type CodeRow,
  type StaffCodesStore,
  type StaffRow,
} from "./staff-codes-core";

const rpc = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClientForRequest: async () => ({ auth: { getUser }, rpc }),
  getSupabaseServiceRoleClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { member_type: "producer", trail_eligible: true }, error: null }) }) }),
    }),
  }),
}));

const M = "m1";
type DbStaff = StaffRow & { memberId: string };
type DbCode = CodeRow & { memberId: string };

/** One database, with the migration's unique indexes; `store` is one member's view of it. */
function memoryDb() {
  const staff: DbStaff[] = [];
  const codes: DbCode[] = [];
  const plates: Record<string, { staffQr: string; staffCode: string | null; sharedOff: boolean }> = {
    m1: { staffQr: "C0NTER01", staffCode: "2580", sharedOff: false },
    m2: { staffQr: "C0NTER02", staffCode: null, sharedOff: false },
  };
  const log: string[] = [];
  let n = 0;
  function store(memberId = M): StaffCodesStore {
    const mine = (id: string) => staff.find((s) => s.memberId === memberId && s.id === id)!;
    return {
      plate: async () => ({ ...plates[memberId] }),
      listStaff: async () => staff.filter((s) => s.memberId === memberId).map((s) => ({ ...s })),
      listCodes: async () => codes.filter((c) => c.memberId === memberId).map((c) => ({ ...c })),
      insertStaff: async (name, key) => {
        if (staff.some((s) => s.memberId === memberId && s.key === key)) return "clash";
        staff.push({ memberId, id: `s${++n}`, name, key, removed: false });
        return "ok";
      },
      setRemoved: async (id, removed) => {
        log.push(removed ? "remove" : "restore");
        mine(id).removed = removed;
      },
      renameStaff: async (id, name, key) => {
        if (staff.some((s) => s.memberId === memberId && s.key === key && s.id !== id)) return "clash";
        Object.assign(mine(id), { name, key });
        return "ok";
      },
      turnOffCodes: async (staffId, kind) => {
        log.push("turn-off");
        for (const c of codes) if (c.memberId === memberId && c.staffId === staffId && (!kind || c.kind === kind)) c.active = false;
      },
      insertCode: async (staffId, kind, code) => {
        const clash = codes.some(
          (c) =>
            (kind === "qr" && c.kind === "qr" && c.code === code) ||
            (kind === "pin" && c.kind === "pin" && c.memberId === memberId && c.code === code) ||
            (c.active && c.staffId === staffId && c.kind === kind),
        );
        if (clash) return "clash";
        codes.push({ memberId, staffId, kind, code, active: true });
        return "ok";
      },
      recordOldCounter: async (code) => {
        log.push("record-old");
        if (!codes.some((c) => c.kind === "qr" && c.code === code)) codes.push({ memberId, staffId: null, kind: "qr", code, active: false });
      },
      swapCounterQr: async (from, to) => {
        log.push("swap");
        if (Object.values(plates).some((p) => p.staffQr === to)) return "clash";
        if (plates[memberId].staffQr !== from) return "changed";
        plates[memberId].staffQr = to;
        return "ok";
      },
      qrTaken: async (code) => codes.some((c) => c.kind === "qr" && c.code === code) || Object.values(plates).some((p) => p.staffQr === code),
      setSharedCode: async (code) => {
        plates[memberId].staffCode = code;
      },
      setSharedOff: async (off) => {
        plates[memberId].sharedOff = off;
      },
    };
  }
  const active = (staffId: string, kind?: "qr" | "pin") => codes.filter((c) => c.active && c.staffId === staffId && (!kind || c.kind === kind));
  return { staff, codes, plates, log, store, active };
}

let db: ReturnType<typeof memoryDb>;
let s: StaffCodesStore;
beforeEach(() => {
  db = memoryDb();
  s = db.store();
});

describe("making codes", () => {
  it("gives a new name one active QR and one active 4-digit code", async () => {
    await makeStaffCodesCore(s, "Maria");
    const id = db.staff[0].id;
    expect(db.active(id, "qr")).toHaveLength(1);
    expect(db.active(id, "qr")[0].code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(db.active(id, "pin")).toHaveLength(1);
    expect(db.active(id, "pin")[0].code).toMatch(/^[0-9]{4}$/);
  });

  it("replaces both for an existing name, however it's typed, and keeps the old ones turned off", async () => {
    await makeStaffCodesCore(s, "Maria");
    const before = db.codes.map((c) => c.code);
    await makeStaffCodesCore(s, " MARIA ");
    expect(db.staff).toHaveLength(1);
    expect(db.staff[0].name).toBe("Maria");
    expect(db.codes).toHaveLength(4);
    expect(db.codes.filter((c) => before.includes(c.code)).every((c) => !c.active)).toBe(true);
    expect(db.active(db.staff[0].id)).toHaveLength(2);
  });

  it("brings a removed name back with the same id", async () => {
    await makeStaffCodesCore(s, "Maria");
    const id = db.staff[0].id;
    await removeStaffCore(s, id);
    await makeStaffCodesCore(s, "maria");
    expect(db.staff).toHaveLength(1);
    expect(db.staff[0]).toMatchObject({ id, removed: false });
    expect(db.active(id)).toHaveLength(2);
  });

  it("refuses a bad name", async () => {
    await expect(makeStaffCodesCore(s, "  ")).rejects.toThrow("Type a name of 1 to 40 characters.");
    expect(db.staff).toHaveLength(0);
  });

  it("never reissues a 4-digit code, or the shared one", async () => {
    await makeStaffCodesCore(s, "Maria");
    const id = db.staff[0].id;
    const used = db.active(id, "pin")[0].code;
    const last = ["7777", "7778"].find((c) => c !== used)!;
    // Everything but `last`, the shared 2580 and Maria's own has been issued.
    for (let i = 0; i < 10000; i++) {
      const code = String(i).padStart(4, "0");
      if (code !== last && code !== "2580" && code !== used) db.codes.push({ memberId: M, staffId: "gone", kind: "pin", code, active: false });
    }
    await replaceStaffCodeCore(s, id, "pin");
    expect(db.active(id, "pin")[0].code).toBe(last);
    await expect(replaceStaffCodeCore(s, id, "pin")).rejects.toThrow("No 4-digit codes are left.");
    expect(db.active(id, "pin")[0].code).toBe(last);
  });

  it("retries after another make takes the spot, ending with one active code per kind", async () => {
    await makeStaffCodesCore(s, "Maria");
    const id = db.staff[0].id;
    const insert = s.insertCode;
    const clashed = { qr: false, pin: false };
    s.insertCode = async (staffId, kind, code) => {
      if (!clashed[kind]) {
        clashed[kind] = true;
        await insert(staffId, kind, kind === "qr" ? "ZZZZZZZ9" : "9876");
      }
      return insert(staffId, kind, code);
    };
    await makeStaffCodesCore(s, "Maria");
    expect(clashed).toEqual({ qr: true, pin: true });
    expect(db.active(id, "qr")).toHaveLength(1);
    expect(db.active(id, "pin")).toHaveLength(1);
    expect(db.active(id, "qr")[0].code).not.toBe("ZZZZZZZ9");
  });

  it("two makes of a new name at once end with one person and one active code per kind", async () => {
    await Promise.all([makeStaffCodesCore(s, "Maria"), makeStaffCodesCore(db.store(), "maria")]);
    expect(db.staff).toHaveLength(1);
    expect(db.active(db.staff[0].id, "qr")).toHaveLength(1);
    expect(db.active(db.staff[0].id, "pin")).toHaveLength(1);
  });

  it("surfaces a failed save, and making again repairs it", async () => {
    const insert = s.insertCode;
    s.insertCode = async (staffId, kind, code) => {
      if (kind === "pin") throw new Error("That didn't work. Try again.");
      return insert(staffId, kind, code);
    };
    await expect(makeStaffCodesCore(s, "Maria")).rejects.toThrow("Try again");
    s.insertCode = insert;
    await makeStaffCodesCore(s, "Maria");
    expect(db.active(db.staff[0].id, "qr")).toHaveLength(1);
    expect(db.active(db.staff[0].id, "pin")).toHaveLength(1);
  });

  it("gives up with a plain message when every try clashes", async () => {
    s.insertCode = async () => "clash";
    await expect(makeStaffCodesCore(s, "Maria")).rejects.toThrow("Couldn't make the code. Try again.");
  });

  it("leaves no working code for someone removed in the middle of it", async () => {
    await makeStaffCodesCore(s, "Maria");
    const id = db.staff[0].id;
    const insert = s.insertCode;
    s.insertCode = async (staffId, kind, code) => {
      await removeStaffCore(db.store(), id);
      return insert(staffId, kind, code);
    };
    await expect(replaceStaffCodeCore(s, id, "qr")).rejects.toThrow("Staff member not found.");
    expect(db.active(id)).toHaveLength(0);
  });

  it("makes a new QR when one clashes with a named code or any counter QR", async () => {
    db.codes.push({ memberId: "m2", staffId: "x", kind: "qr", code: "NAMED001", active: false });
    const tries = ["NAMED001", "C0NTER02", "FRESH001"];
    expect(await freshQr(s.qrTaken, () => tries.shift()!)).toBe("FRESH001");
    await expect(freshQr(async () => true)).rejects.toThrow("Couldn't make the code. Try again.");
  });

  it("checks a person's new QR for clashes before saving it", async () => {
    const taken: string[] = [];
    s.qrTaken = async (code) => taken.length < 2 && taken.push(code) > 0;
    await makeStaffCodesCore(s, "Maria");
    expect(taken).toHaveLength(2);
    expect(taken).not.toContain(db.active(db.staff[0].id, "qr")[0].code);
  });
});

describe("replacing, turning off and removing", () => {
  let id: string;
  beforeEach(async () => {
    await makeStaffCodesCore(s, "Maria");
    id = db.staff[0].id;
    db.log.length = 0;
  });

  it.each([
    ["qr", "pin"],
    ["pin", "qr"],
  ] as const)("replacing the %s leaves the %s alone", async (kind, other) => {
    const old = db.active(id, kind)[0].code;
    const kept = db.active(id, other)[0].code;
    await replaceStaffCodeCore(s, id, kind);
    expect(db.active(id, kind)).toHaveLength(1);
    expect(db.active(id, kind)[0].code).not.toBe(old);
    expect(db.active(id, other)[0].code).toBe(kept);
  });

  it("turn off stops both and keeps the name", async () => {
    await turnOffStaffCore(s, id);
    expect(db.active(id)).toHaveLength(0);
    expect((await staffCodesView(s, "https://x")).staff).toEqual([{ id, name: "Maria", qr: null, pin: null }]);
  });

  it("remove stops both, hides the name and deletes nothing", async () => {
    await removeStaffCore(s, id);
    expect(db.active(id)).toHaveLength(0);
    expect(db.codes).toHaveLength(2);
    expect(db.staff).toHaveLength(1);
    expect((await staffCodesView(s, "https://x")).staff).toEqual([]);
    // Codes stop before the name disappears, and again after (a code made in between).
    expect(db.log).toEqual(["turn-off", "remove", "turn-off"]);
  });

  it("a removed person can't be renamed or given a code", async () => {
    await removeStaffCore(s, id);
    await expect(renameStaffCore(s, id, "Ann")).rejects.toThrow("Staff member not found.");
    await expect(replaceStaffCodeCore(s, id, "qr")).rejects.toThrow("Staff member not found.");
  });

  it("refuses another member's staff id, touching nothing", async () => {
    const other = db.store("m2");
    for (const act of [
      () => replaceStaffCodeCore(other, id, "qr"),
      () => turnOffStaffCore(other, id),
      () => renameStaffCore(other, id, "Ann"),
      () => removeStaffCore(other, id),
    ]) {
      await expect(act()).rejects.toThrow("Staff member not found.");
    }
    expect(db.active(id)).toHaveLength(2);
    expect(db.staff[0]).toMatchObject({ name: "Maria", removed: false });
  });
});

describe("renaming", () => {
  beforeEach(async () => {
    await makeStaffCodesCore(s, "Maria");
    await makeStaffCodesCore(s, "Jake");
  });
  const idOf = (name: string) => db.staff.find((x) => x.name === name)!.id;

  it("changes the name, or only its capitals", async () => {
    await renameStaffCore(s, idOf("Maria"), "Ann  Lee");
    await renameStaffCore(s, idOf("Jake"), "JAKE");
    expect(db.staff.map((x) => x.name)).toEqual(["Ann Lee", "JAKE"]);
  });

  it("refuses a name in use, including a removed person's", async () => {
    await expect(renameStaffCore(s, idOf("Maria"), " jake ")).rejects.toThrow("That name is already in use.");
    await removeStaffCore(s, idOf("Jake"));
    await expect(renameStaffCore(s, idOf("Maria"), "Jake")).rejects.toThrow("That name is already in use.");
  });

  it("refuses the same way when the name is taken in the middle of it", async () => {
    s.renameStaff = async () => "clash";
    await expect(renameStaffCore(s, idOf("Maria"), "Zoe")).rejects.toThrow("That name is already in use.");
  });
});

describe("the counter QR", () => {
  it("keeps the old token as a turned-off counter code before replacing it", async () => {
    await resetCounterQrCore(s);
    expect(db.log).toEqual(["record-old", "swap"]);
    expect(db.codes).toMatchObject([{ staffId: null, kind: "qr", code: "C0NTER01", active: false }]);
    expect(db.plates.m1.staffQr).not.toBe("C0NTER01");
  });

  it("tries another code when the new one clashes", async () => {
    const swap = s.swapCounterQr;
    let first = true;
    s.swapCounterQr = async (from, to) => {
      if (!first) return swap(from, to);
      first = false;
      return "clash";
    };
    await resetCounterQrCore(s);
    expect(db.plates.m1.staffQr).not.toBe("C0NTER01");
    expect(db.codes).toHaveLength(1);
  });

  it("can be done again after failing between the two steps", async () => {
    const swap = s.swapCounterQr;
    s.swapCounterQr = async () => {
      throw new Error("That didn't work. Try again.");
    };
    await expect(resetCounterQrCore(s)).rejects.toThrow("Try again");
    s.swapCounterQr = swap;
    await resetCounterQrCore(s);
    expect(db.plates.m1.staffQr).not.toBe("C0NTER01");
    expect(db.codes.map((c) => c.code)).toEqual(["C0NTER01"]);
  });

  it("two resets at once leave the replaced token on record and the new one working", async () => {
    await Promise.all([resetCounterQrCore(s), resetCounterQrCore(db.store())]);
    expect(db.codes.map((c) => c.code)).toEqual(["C0NTER01"]);
    expect(db.plates.m1.staffQr).not.toBe("C0NTER01");
  });
});

describe("the shared 4-digit code", () => {
  it("can't be turned off without an active personal code", async () => {
    const message = "Give at least one staff member their own code first.";
    await expect(setSharedCodeOffCore(s, true)).rejects.toThrow(message);
    await makeStaffCodesCore(s, "Maria");
    await turnOffStaffCore(s, db.staff[0].id);
    await expect(setSharedCodeOffCore(s, true)).rejects.toThrow(message);
    expect(db.plates.m1.sharedOff).toBe(false);
  });

  it("turns off with one, keeping the stored code, and on at any time", async () => {
    await makeStaffCodesCore(s, "Maria");
    await setSharedCodeOffCore(s, true);
    expect(db.plates.m1).toMatchObject({ staffCode: "2580", sharedOff: true });
    await turnOffStaffCore(s, db.staff[0].id);
    await setSharedCodeOffCore(s, false);
    expect(db.plates.m1.sharedOff).toBe(false);
  });

  it("saving leaves it off if it's off", async () => {
    db.plates.m1.sharedOff = true;
    await saveSharedCodeCore(s, " 1234 ");
    expect(db.plates.m1).toMatchObject({ staffCode: "1234", sharedOff: true });
  });

  it("refuses a bad code, or one ever issued to a person", async () => {
    await expect(saveSharedCodeCore(s, "12")).rejects.toThrow("Use 4 digits.");
    await makeStaffCodesCore(s, "Maria");
    const pin = db.active(db.staff[0].id, "pin")[0].code;
    await removeStaffCore(s, db.staff[0].id);
    await expect(saveSharedCodeCore(s, pin)).rejects.toThrow("That code belongs to a staff member. Choose another.");
    expect(db.plates.m1.staffCode).toBe("2580");
  });
});

describe("staffCodesView", () => {
  it("lists people by name with their active codes", async () => {
    await makeStaffCodesCore(s, "maria");
    await makeStaffCodesCore(s, "Jake");
    const view = await staffCodesView(s, "https://x");
    expect(view.counter).toEqual({ url: "https://x/s/C0NTER01", printed: "C0NT-ER01" });
    expect(view.shared).toEqual({ code: "2580", off: false });
    expect(view.canTurnSharedOff).toBe(true);
    expect(view.staff.map((x) => x.name)).toEqual(["Jake", "maria"]);
    const jake = db.staff.find((x) => x.name === "Jake")!.id;
    const qr = db.active(jake, "qr")[0].code;
    expect(view.staff[0]).toEqual({
      id: jake,
      name: "Jake",
      qr: { url: `https://x/s/${qr}`, printed: `${qr.slice(0, 4)}-${qr.slice(4)}` },
      pin: db.active(jake, "pin")[0].code,
    });
  });

  it("says the shared code can't be turned off with no personal code", async () => {
    expect((await staffCodesView(s, "https://x")).canTurnSharedOff).toBe(false);
  });
});

describe("requireTapCardOwner", () => {
  it("refuses anyone the database says isn't owner level", async () => {
    const { requireTapCardOwner } = await import("./tap-card-editor.server");
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireTapCardOwner(M)).rejects.toThrow("Only the owner or a co-owner can manage staff codes.");
    expect(rpc).toHaveBeenCalledWith("is_member_owner_level", { target_member_id: M });
  });

  it("passes an owner, and asks a signed-out person to sign in", async () => {
    const { requireTapCardOwner } = await import("./tap-card-editor.server");
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(requireTapCardOwner(M)).resolves.toMatchObject({ userId: "u1", trailStop: true });
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireTapCardOwner(M)).rejects.toThrow("Please sign in again.");
  });
});
