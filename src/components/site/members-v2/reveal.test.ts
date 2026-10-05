import { describe, expect, it } from "vitest";
import { pickVisible } from "./reveal";

describe("pickVisible (desktop and phone lists are both in the page; scroll the shown one)", () => {
  it("returns the first node that is displayed", () => {
    const hidden = { id: "phone", offsetParent: null };
    const shown = { id: "desktop", offsetParent: {} };
    expect(pickVisible([hidden, shown])?.id).toBe("desktop");
    expect(pickVisible([hidden])).toBeNull();
  });
});

describe("nearestScrollTop (scroll only the desktop list, never the page)", async () => {
  const { nearestScrollTop } = await import("./reveal");
  it("leaves the list alone when the card is already in view", () => {
    expect(nearestScrollTop({ top: 100, height: 120 }, { scrollTop: 0, height: 600 })).toBe(0);
  });
  it("brings a card below up to the top of the list (the list's bottom can be below the window)", () => {
    expect(nearestScrollTop({ top: 900, height: 120 }, { scrollTop: 0, height: 600 })).toBe(900);
  });
  it("scrolls up to a card above", () => {
    expect(nearestScrollTop({ top: 200, height: 120 }, { scrollTop: 500, height: 600 })).toBe(200);
  });
});
