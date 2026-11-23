import { cleanStaffName } from "@/lib/tap-card/staff-codes";
import type { CodeKind, StaffCodesView } from "@/lib/tap-card/staff-codes-core";

/** Wording and small rules of the Staff QR codes box and the "Staff cards" chooser (spec 2026-11-23). */

type Person = StaffCodesView["staff"][number];

export const COUNTER_REPLACE_CONFIRM = "Make a new staff QR code? The one you have now will stop working right away.";
export const NOBODY_CAN_TYPE = "After this, nobody can type a code or undo a reward. Staff QR codes will still work.";
/** The same, while it lasts. */
export const NOBODY_CAN_TYPE_NOW = "Nobody can type a code or undo a reward right now. Staff QR codes still work.";
/** With no shared code stored, the last personal code is what keeps the plate on. */
export const PLATE_WILL_BE_OFF = "After this, your plate will be off: no check-ins until you set up a staff code.";
export const PLATE_IS_OFF = "Your plate is off: no check-ins until you set up a staff code.";
export const SHARED_OFF_LIVE_NOTE = "The live site keeps accepting the shared code until this feature goes live.";
export const STAFF_QR_GONE = "That staff QR was turned off. Choose another.";

function willStop(name: string, what: string): string {
  return `${name}'s current ${what} will stop working right away.`;
}

export function replaceConfirm(name: string, kind: CodeKind): string {
  return willStop(name, kind === "qr" ? "QR" : "4-digit code");
}

/** Null when there's nothing active to lose, so nothing to ask. */
export function makeConfirm(person: Person | undefined): string | null {
  if (!person || (!person.qr && person.pin === null)) return null;
  if (person.qr && person.pin !== null) return willStop(person.name, "QR and 4-digit code");
  return replaceConfirm(person.name, person.qr ? "qr" : "pin");
}

/** Turning off or removing someone. Null when they have no active codes. */
export function endCodesConfirm(view: StaffCodesView, person: Person): string | null {
  const stops = makeConfirm(person);
  if (!stops) return null;
  const last = person.pin !== null && !view.staff.some((p) => p.id !== person.id && p.pin !== null);
  if (!last) return stops;
  if (view.shared.code === null) return `${stops}\n\n${PLATE_WILL_BE_OFF}`;
  return view.shared.off ? `${stops}\n\n${NOBODY_CAN_TYPE}` : stops;
}

export function nobodyCanType(view: StaffCodesView): boolean {
  return view.shared.code !== null && view.shared.off && !view.canTurnSharedOff;
}

/** No shared code and no active personal code. */
export function plateIsOff(view: StaffCodesView): boolean {
  return view.shared.code === null && !view.canTurnSharedOff;
}

/** The listed person a typed name belongs to. */
export function findByTypedName(view: StaffCodesView, typed: string): Person | undefined {
  const cleaned = cleanStaffName(typed);
  return cleaned.ok ? view.staff.find((p) => p.name.toLowerCase() === cleaned.key) : undefined;
}

/** What to print on staff cards. `staffId` "" is the behind-the-counter QR; a person's QR is never swapped for another. */
export function staffCardChoice(view: StaffCodesView, staffId: string): { staffQrUrl: string; staffQrPrinted: string; staffName: string | null } {
  if (staffId === "") return { staffQrUrl: view.counter.url, staffQrPrinted: view.counter.printed, staffName: null };
  const person = view.staff.find((p) => p.id === staffId);
  if (!person?.qr) throw new Error(STAFF_QR_GONE);
  return { staffQrUrl: person.qr.url, staffQrPrinted: person.qr.printed, staffName: person.name };
}
