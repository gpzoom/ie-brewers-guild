import { describe, expect, it } from "vitest";
import { barHeading, outcomeMessage, shortDate, useByDate } from "./CheckInScreen";

describe("barHeading", () => {
  it("says the visit was recorded on the first tap of the day", () => {
    expect(barHeading({ visitNumber: 6, firstToday: true }, "Pat")).toBe("✓ Visit #6 recorded — Pat");
  });
  it("says they're already checked in on a later tap", () => {
    expect(barHeading({ visitNumber: 6, firstToday: false }, "Pat")).toBe("Already checked in today — visit #6 — Pat");
  });
});

describe("outcomeMessage", () => {
  it("explains refused uses", () => {
    expect(outcomeMessage("already-used-today")).toBe("One reward per visit — already used today.");
    expect(outcomeMessage("not-available")).toBe("That reward isn't available any more.");
    expect(outcomeMessage("used")).toBeNull();
    expect(outcomeMessage(undefined)).toBeNull();
  });
});

describe("dates", () => {
  it("shortDate reads a Pacific day without shifting it", () => {
    expect(shortDate("2026-12-31")).toBe("Dec 31");
  });
  it("useByDate shows the Pacific date of an expiry moment", () => {
    expect(useByDate("2026-07-01T05:00:00.000Z")).toBe("Jun 30");
  });
});
