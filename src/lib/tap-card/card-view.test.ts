import { describe, expect, it } from "vitest";
import { pickCardViewKind } from "./card-view";
import type { ScannerState } from "./tap-card-auth";

const device = { id: "d1", memberId: "m1", memberName: "Sample Brewery", label: "Bar iPad" };
const ok: ScannerState = { kind: "ok", device };
const blocked: ScannerState = { kind: "blocked", device };
const none: ScannerState = { kind: "none" };
const newCard = { holderId: null };
const activeCard = { holderId: "h1" };

describe("pickCardViewKind", () => {
  it("an unknown code is unknown to everyone", () => {
    expect(pickCardViewKind(ok, null, null)).toBe("unknown");
    expect(pickCardViewKind(blocked, null, null)).toBe("unknown");
    expect(pickCardViewKind(none, null, "h1")).toBe("unknown");
  });

  it("a blocked bar device says why instead of recording", () => {
    expect(pickCardViewKind(blocked, activeCard, null)).toBe("staff-blocked");
    expect(pickCardViewKind(blocked, newCard, null)).toBe("staff-blocked");
  });

  it("a working bar device activates new cards and checks in active ones", () => {
    expect(pickCardViewKind(ok, newCard, null)).toBe("staff-activate");
    expect(pickCardViewKind(ok, activeCard, null)).toBe("staff-check-in");
  });

  it("anyone else activates a new card or sees that it's active", () => {
    expect(pickCardViewKind(none, newCard, null)).toBe("customer-activate");
    expect(pickCardViewKind(none, activeCard, null)).toBe("customer-active");
    expect(pickCardViewKind(none, activeCard, "h2")).toBe("customer-active");
  });

  it("the card's own holder goes to their card page", () => {
    expect(pickCardViewKind(none, activeCard, "h1")).toBe("customer-own");
  });
});

describe("guessGuard", () => {
  it("never limits a real card or a bar device; counts only unknown codes from everyone else", async () => {
    const { guessGuard } = await import("./card-view");
    let calls = 0;
    const limit = async () => {
      calls++;
      return calls > 1;
    };
    expect(await guessGuard("none", true, limit)).toBe("ok");
    expect(await guessGuard("ok", false, limit)).toBe("ok");
    expect(calls).toBe(0);
    expect(await guessGuard("none", false, limit)).toBe("ok");
    expect(await guessGuard("blocked", false, limit)).toBe("throttled");
    expect(calls).toBe(2);
  });
});
