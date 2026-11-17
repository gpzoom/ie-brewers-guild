import { describe, expect, it } from "vitest";
import { activateMessage } from "./ActivateForm";

describe("activateMessage", () => {
  it("an already-used card is an error, not success", () => {
    expect(activateMessage({ kind: "already-active" }, "staff")).toBe("This card is already in use.");
    expect(activateMessage({ kind: "already-active" }, "customer")).toBe("This card is already in use.");
  });
  it("an email that already has a card is told to check that inbox", () => {
    expect(activateMessage({ kind: "existing-email" }, "customer")).toContain("We emailed it a sign-in link");
    expect(activateMessage({ kind: "existing-email" }, "staff")).toContain("We emailed the customer a sign-in link");
  });
  it("activation itself has no message", () => {
    expect(activateMessage({ kind: "activated", holderId: "h1" }, "staff")).toBeNull();
  });
});
