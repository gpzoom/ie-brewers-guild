import { formatCardCode, generateCardCode } from "@/lib/tap-card/card-code";
import { validateStaffCode } from "@/lib/tap-card/plate";
import { cleanStaffName, generatePin, sharedPinSaveError } from "@/lib/tap-card/staff-codes";
import { staffQrUrl } from "@/lib/tap-card/staff-qr";

/**
 * Managing named staff and their codes (spec 2026-11-23 staff QR tracking).
 * Nothing is ever deleted: people are removed and codes turned off, so the
 * activity history stays and a 4-digit code is never issued twice.
 */

export type CodeKind = "qr" | "pin";
export type StaffRow = { id: string; name: string; key: string; removed: boolean };
/** `staffId` is null for a behind-the-counter QR that was replaced. */
export type CodeRow = { staffId: string | null; kind: CodeKind; code: string; active: boolean };

/** One member's staff and codes. "clash" is a unique violation. */
export type StaffCodesStore = {
  plate(): Promise<{ staffQr: string; staffCode: string | null; sharedOff: boolean }>;
  /** Everyone, removed people too. */
  listStaff(): Promise<StaffRow[]>;
  /** Every code ever issued, turned-off ones too. */
  listCodes(): Promise<CodeRow[]>;
  insertStaff(name: string, key: string): Promise<"ok" | "clash">;
  setRemoved(staffId: string, removed: boolean): Promise<void>;
  renameStaff(staffId: string, name: string, key: string): Promise<"ok" | "clash">;
  /** One kind, or both when `kind` is left out. */
  turnOffCodes(staffId: string, kind?: CodeKind): Promise<void>;
  insertCode(staffId: string, kind: CodeKind, code: string): Promise<"ok" | "clash">;
  /** Already on record counts as done. */
  recordOldCounter(code: string): Promise<void>;
  /** "changed": the counter QR is no longer `from`. */
  swapCounterQr(from: string, to: string): Promise<"ok" | "clash" | "changed">;
  /** Used by any named code or any member's counter QR. */
  qrTaken(code: string): Promise<boolean>;
  setSharedCode(code: string): Promise<void>;
  setSharedOff(off: boolean): Promise<void>;
};

const ATTEMPTS = 5;
const NOT_FOUND = "Staff member not found.";
const NAME_IN_USE = "That name is already in use.";
const COULDNT_MAKE = "Couldn't make the code. Try again.";

/** A QR code nobody has (a person's QR or a counter QR, at any member). */
export async function freshQr(taken: (code: string) => Promise<boolean>, generate: () => string = generateCardCode): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const code = generate();
    if (!(await taken(code))) return code;
  }
  throw new Error(COULDNT_MAKE);
}

/** The person at this member; a removed person only when asked for. */
async function findStaff(store: StaffCodesStore, staffId: string, includeRemoved = false): Promise<StaffRow> {
  const person = (await store.listStaff()).find((s) => s.id === staffId);
  if (!person || (person.removed && !includeRemoved)) throw new Error(NOT_FOUND);
  return person;
}

function cleanName(raw: string): { name: string; key: string } {
  const cleaned = cleanStaffName(raw);
  if (!cleaned.ok) throw new Error(cleaned.message);
  return cleaned;
}

async function newCode(store: StaffCodesStore, kind: CodeKind): Promise<string> {
  if (kind === "qr") return freshQr(store.qrTaken);
  const [codes, plate] = await Promise.all([store.listCodes(), store.plate()]);
  const taken = new Set(codes.filter((c) => c.kind === "pin").map((c) => c.code));
  if (plate.staffCode !== null) taken.add(plate.staffCode);
  const pin = generatePin(taken);
  if (pin === null) throw new Error("No 4-digit codes are left.");
  return pin;
}

/**
 * Turns off the person's code of this kind, then makes a new one. Someone
 * else making one at the same moment (or a code clash) just starts over, so
 * exactly one is left active. Trying again after a failure repairs it.
 */
async function replaceCode(store: StaffCodesStore, staffId: string, kind: CodeKind): Promise<void> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const code = await newCode(store, kind);
    await store.turnOffCodes(staffId, kind);
    if ((await store.insertCode(staffId, kind, code)) === "clash") continue;
    // Removed while this ran: never leave a hidden person a working code.
    if ((await findStaff(store, staffId, true)).removed) {
      await store.turnOffCodes(staffId);
      throw new Error(NOT_FOUND);
    }
    return;
  }
  throw new Error(COULDNT_MAKE);
}

/** A new person, or the one with this name (even a removed one). */
async function findOrAddStaff(store: StaffCodesStore, rawName: string): Promise<StaffRow> {
  const { name, key } = cleanName(rawName);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const person = (await store.listStaff()).find((s) => s.key === key);
    if (person) return person;
    // Added, or beaten to it: either way the name is there next time around.
    await store.insertStaff(name, key);
  }
  throw new Error(COULDNT_MAKE);
}

/** A QR and a 4-digit code for this name; any they had stop working. */
export async function makeStaffCodesCore(store: StaffCodesStore, rawName: string): Promise<void> {
  const person = await findOrAddStaff(store, rawName);
  if (person.removed) await store.setRemoved(person.id, false);
  await replaceCode(store, person.id, "qr");
  await replaceCode(store, person.id, "pin");
}

export async function replaceStaffCodeCore(store: StaffCodesStore, staffId: string, kind: CodeKind): Promise<void> {
  await findStaff(store, staffId);
  await replaceCode(store, staffId, kind);
}

export async function turnOffStaffCore(store: StaffCodesStore, staffId: string): Promise<void> {
  await findStaff(store, staffId);
  await store.turnOffCodes(staffId);
}

export async function renameStaffCore(store: StaffCodesStore, staffId: string, rawName: string): Promise<void> {
  const { name, key } = cleanName(rawName);
  const people = await store.listStaff();
  if (!people.some((s) => s.id === staffId && !s.removed)) throw new Error(NOT_FOUND);
  // Removed people keep their names, so typing one again brings them back.
  if (people.some((s) => s.key === key && s.id !== staffId)) throw new Error(NAME_IN_USE);
  if ((await store.renameStaff(staffId, name, key)) === "clash") throw new Error(NAME_IN_USE);
}

export async function removeStaffCore(store: StaffCodesStore, staffId: string): Promise<void> {
  await findStaff(store, staffId, true);
  // Codes first, so a failure never hides someone whose codes still work;
  // again after, for a code made in between.
  await store.turnOffCodes(staffId);
  await store.setRemoved(staffId, true);
  await store.turnOffCodes(staffId);
}

/** The old token is on record before it's replaced, so later use of it is recognized. */
export async function resetCounterQrCore(store: StaffCodesStore): Promise<void> {
  const { staffQr: old } = await store.plate();
  await store.recordOldCounter(old);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // "changed": another reset already replaced this same token.
    if ((await store.swapCounterQr(old, await freshQr(store.qrTaken))) !== "clash") return;
  }
  throw new Error(COULDNT_MAKE);
}

/** Leaves the shared code on or off, whichever it was. */
export async function saveSharedCodeCore(store: StaffCodesStore, rawCode: string): Promise<void> {
  const checked = validateStaffCode(rawCode);
  if (!checked.ok) throw new Error(checked.message);
  await store.plate(); // makes the plate on first use
  const issued = new Set((await store.listCodes()).filter((c) => c.kind === "pin").map((c) => c.code));
  const refused = sharedPinSaveError(checked.code, issued);
  if (refused) throw new Error(refused);
  await store.setSharedCode(checked.code);
}

export async function setSharedCodeOffCore(store: StaffCodesStore, off: boolean): Promise<void> {
  await store.plate();
  if (off && !(await store.listCodes()).some((c) => c.kind === "pin" && c.active)) {
    throw new Error("Give at least one staff member their own code first.");
  }
  await store.setSharedOff(off);
}

export type StaffCodesView = {
  counter: { url: string; printed: string };
  shared: { code: string | null; off: boolean };
  /** Not removed, by name. */
  staff: { id: string; name: string; qr: { url: string; printed: string } | null; pin: string | null }[];
  canTurnSharedOff: boolean;
};

export async function staffCodesView(store: StaffCodesStore, siteUrl: string): Promise<StaffCodesView> {
  const [plate, people, codes] = await Promise.all([store.plate(), store.listStaff(), store.listCodes()]);
  const qrOf = (code: string) => ({ url: staffQrUrl(siteUrl, code), printed: formatCardCode(code) });
  const activeCode = (staffId: string, kind: CodeKind) => codes.find((c) => c.active && c.staffId === staffId && c.kind === kind)?.code ?? null;
  return {
    counter: qrOf(plate.staffQr),
    shared: { code: plate.staffCode, off: plate.sharedOff },
    staff: people
      .filter((p) => !p.removed)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map((p) => {
        const qr = activeCode(p.id, "qr");
        return { id: p.id, name: p.name, qr: qr ? qrOf(qr) : null, pin: activeCode(p.id, "pin") };
      }),
    canTurnSharedOff: codes.some((c) => c.kind === "pin" && c.active),
  };
}
