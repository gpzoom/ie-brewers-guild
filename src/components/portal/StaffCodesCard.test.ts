import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffCodesView } from "@/lib/tap-card/staff-codes-core";

vi.mock("@/lib/tap-card/staff-codes.server", () => ({}));
const { StaffCodesBox } = await import("./StaffCodesCard");
const { NOBODY_CAN_TYPE_NOW } = await import("@/lib/tap-card/staff-codes-screen");

const LIVE_NOTE = "The live site keeps accepting the shared code until this feature goes live.";
const qr = (printed: string) => ({ url: `https://example.com/s/${printed}`, printed });
const view: StaffCodesView = {
  counter: qr("7K2M-9QX4"),
  shared: { code: "2580", off: false },
  staff: [
    { id: "j", name: "Jake", qr: null, pin: null },
    { id: "m", name: "<b>Maria</b>", qr: qr("3F8A-1TTP"), pin: "4816" },
  ],
  canTurnSharedOff: true,
};
const render = (over: Partial<StaffCodesView> = {}, busy = false) =>
  renderToStaticMarkup(
    createElement(StaffCodesBox, {
      memberId: "x",
      view: { ...view, ...over },
      busy,
      run: async () => true,
      onDownload: () => undefined,
    }),
  );

describe("StaffCodesBox", () => {
  it("shows the codes, and names as plain text", () => {
    const html = render();
    for (const t of ["7K2M-9QX4", "3F8A-1TTP", "4816", "2580", "&lt;b&gt;Maria&lt;/b&gt;", "Add a name…"]) expect(html).toContain(t);
    expect(html).not.toContain("<b>Maria</b>");
  });

  it("says whose code each button acts on", () => {
    const html = render();
    const maria = "&lt;b&gt;Maria&lt;/b&gt;";
    for (const t of [
      "Make codes for Jake",
      `New QR for ${maria}`,
      `New code for ${maria}`,
      `Turn off codes for ${maria}`,
      `Download QR for ${maria}`,
      "Download behind-the-counter QR",
    ]) {
      expect(html).toContain(`aria-label="${t}"`);
    }
    expect(html).not.toContain('aria-label="New QR for Jake"');
  });

  it("notes the live site while the shared code is off, and when nobody can type a code", () => {
    expect(render()).not.toContain(LIVE_NOTE);
    const off = render({ shared: { code: "2580", off: true } });
    expect(off).toContain(LIVE_NOTE);
    expect(off).not.toContain(NOBODY_CAN_TYPE_NOW);
    expect(off).toContain("Turn on");
    expect(render({ shared: { code: "2580", off: true }, canTurnSharedOff: false })).toContain(NOBODY_CAN_TYPE_NOW);
  });

  it("says the plate is off while there's no 4-digit code at all", () => {
    const off = "Your plate is off: no check-ins until you set up a staff code.";
    expect(render({ shared: { code: null, off: false }, canTurnSharedOff: false })).toContain(off);
    expect(render({ shared: { code: null, off: false } })).not.toContain(off);
    expect(render()).not.toContain(off);
  });

  it("locks the shared code while something is saving", () => {
    const input = (html: string) => /<input[^>]*inputMode="numeric"[^>]*>/i.exec(html)![0];
    expect(input(render())).not.toContain("disabled");
    expect(input(render({}, true))).toContain("disabled");
  });
});
