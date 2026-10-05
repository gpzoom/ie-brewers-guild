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
