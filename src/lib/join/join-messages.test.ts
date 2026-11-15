import { describe, expect, it } from "vitest";
import {
  CHOOSE_MEMBER_TYPE,
  ENTER_BUSINESS_NAME,
  JOIN_BUSY,
  JOIN_CLOSED,
  SOMETHING_WRONG,
  TOO_MANY_TRIES,
  isJoinOpenValue,
  safeJoinMessage,
} from "./join-messages";

describe("safeJoinMessage", () => {
  it.each([TOO_MANY_TRIES, JOIN_CLOSED, JOIN_BUSY, ENTER_BUSINESS_NAME, CHOOSE_MEMBER_TYPE])("shows %s as-is", (message) => {
    expect(safeJoinMessage(new Error(message))).toBe(message);
  });

  it("hides any other error behind the generic message", () => {
    expect(safeJoinMessage(new Error("duplicate key value violates unique constraint"))).toBe(SOMETHING_WRONG);
    expect(safeJoinMessage(new Error(""))).toBe(SOMETHING_WRONG);
    expect(safeJoinMessage("Too many tries — please wait a minute and try again.")).toBe(SOMETHING_WRONG);
    expect(safeJoinMessage(undefined)).toBe(SOMETHING_WRONG);
  });
});

describe("isJoinOpenValue", () => {
  it("is open only for the exact string true", () => {
    expect(isJoinOpenValue("true")).toBe(true);
    for (const value of [undefined, null, "", "TRUE", "True", " true", "1", "yes", true]) {
      expect(isJoinOpenValue(value)).toBe(false);
    }
  });
});
