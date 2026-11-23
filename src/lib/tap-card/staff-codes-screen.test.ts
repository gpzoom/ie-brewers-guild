import { describe, expect, it } from "vitest";
import type { StaffCodesView } from "@/lib/tap-card/staff-codes-core";
import {
  NOBODY_CAN_TYPE,
  NOBODY_CAN_TYPE_NOW,
  PLATE_WILL_BE_OFF,
  plateIsOff,
  STAFF_QR_GONE,
  endCodesConfirm,
  findByTypedName,
  makeConfirm,
  nobodyCanType,
  replaceConfirm,
  staffCardChoice,
} from "./staff-codes-screen";

const qr = (code: string) => ({ url: `https://example.com/s/${code}`, printed: code });
const maria = { id: "m", name: "Maria", qr: qr("MMMM"), pin: "4816" };
const jake = { id: "j", name: "Jake", qr: null, pin: null };
const view = (over: Partial<StaffCodesView> = {}): StaffCodesView => ({
  counter: qr("CCCC"),
  shared: { code: "2580", off: false },
  staff: [jake, maria],
  canTurnSharedOff: true,
  ...over,
});
const sharedOff = { shared: { code: "2580", off: true } };

describe("confirms", () => {
  it("asks before replacing, naming what stops", () => {
    expect(makeConfirm(maria)).toBe("Maria's current QR and 4-digit code will stop working right away.");
    expect(replaceConfirm("Maria", "qr")).toBe("Maria's current QR will stop working right away.");
    expect(replaceConfirm("Maria", "pin")).toBe("Maria's current 4-digit code will stop working right away.");
  });
  it("asks nothing for a name with no active codes", () => {
    expect(makeConfirm(jake)).toBeNull();
    expect(makeConfirm(undefined)).toBeNull();
  });
  it("names only the code they have", () => {
    expect(makeConfirm({ ...maria, pin: null })).toBe("Maria's current QR will stop working right away.");
    expect(makeConfirm({ ...maria, qr: null })).toBe("Maria's current 4-digit code will stop working right away.");
  });
});

describe("the last active person with the shared code off", () => {
  it("is warned about", () => {
    expect(NOBODY_CAN_TYPE).toBe("After this, nobody can type a code or undo a reward. Staff QR codes will still work.");
    expect(endCodesConfirm(view(sharedOff), maria)).toBe(`Maria's current QR and 4-digit code will stop working right away.\n\n${NOBODY_CAN_TYPE}`);
  });
  it("is not warned about with the shared code on, or with someone else left", () => {
    expect(endCodesConfirm(view(), maria)).not.toContain(NOBODY_CAN_TYPE);
    expect(endCodesConfirm(view({ ...sharedOff, staff: [{ ...jake, pin: "1111" }, maria] }), maria)).not.toContain(NOBODY_CAN_TYPE);
    expect(endCodesConfirm(view(sharedOff), jake)).toBeNull();
  });
  it("keeps showing while true", () => {
    expect(NOBODY_CAN_TYPE_NOW).toBe("Nobody can type a code or undo a reward right now. Staff QR codes still work.");
    expect(nobodyCanType(view({ ...sharedOff, canTurnSharedOff: false }))).toBe(true);
    expect(nobodyCanType(view(sharedOff))).toBe(false);
    expect(nobodyCanType(view({ canTurnSharedOff: false }))).toBe(false);
  });
});

describe("the last active person with no shared code", () => {
  const none = { shared: { code: null, off: false } };
  it("is warned that the plate goes off", () => {
    expect(PLATE_WILL_BE_OFF).toBe("After this, your plate will be off: no check-ins until you set up a staff code.");
    for (const off of [false, true]) {
      const ask = endCodesConfirm(view({ shared: { code: null, off } }), maria);
      expect(ask).toBe(`Maria's current QR and 4-digit code will stop working right away.

${PLATE_WILL_BE_OFF}`);
    }
  });
  it("is not warned about when the plate stays on", () => {
    expect(endCodesConfirm(view(), maria)).not.toContain(PLATE_WILL_BE_OFF);
    expect(endCodesConfirm(view(sharedOff), maria)).not.toContain(PLATE_WILL_BE_OFF);
    expect(endCodesConfirm(view({ ...none, staff: [{ ...jake, pin: "1111" }, maria] }), maria)).not.toContain(PLATE_WILL_BE_OFF);
    expect(endCodesConfirm(view({ ...none, staff: [{ ...maria, pin: null }] }), { ...maria, pin: null })).not.toContain(PLATE_WILL_BE_OFF);
  });
  it("keeps showing while true, instead of the nobody-can-type note", () => {
    expect(plateIsOff(view({ ...none, canTurnSharedOff: false }))).toBe(true);
    expect(plateIsOff(view(none))).toBe(false);
    expect(plateIsOff(view({ ...sharedOff, canTurnSharedOff: false }))).toBe(false);
    expect(nobodyCanType(view({ shared: { code: null, off: true }, canTurnSharedOff: false }))).toBe(false);
  });
});

it("finds a typed name ignoring case and extra spaces", () => {
  expect(findByTypedName(view(), "  mARIA ")).toBe(maria);
  expect(findByTypedName(view(), "Mari")).toBeUndefined();
  expect(findByTypedName(view(), "")).toBeUndefined();
});

describe("staffCardChoice", () => {
  it("is the counter QR with no name, or a person's", () => {
    expect(staffCardChoice(view(), "")).toEqual({ staffQrUrl: "https://example.com/s/CCCC", staffQrPrinted: "CCCC", staffName: null });
    expect(staffCardChoice(view(), "m")).toEqual({ staffQrUrl: "https://example.com/s/MMMM", staffQrPrinted: "MMMM", staffName: "Maria" });
  });
  it("never falls back to another QR", () => {
    expect(() => staffCardChoice(view(), "j")).toThrow(STAFF_QR_GONE);
    expect(() => staffCardChoice(view(), "gone")).toThrow(STAFF_QR_GONE);
  });
});
