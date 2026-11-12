import { describe, expect, it } from "vitest";
import { pickAccountUserId, pickOwnerLevelUserIds } from "./account-user";

describe("pickOwnerLevelUserIds", () => {
  it("returns the owner first, then co-owners in order, skipping editors", () => {
    expect(
      pickOwnerLevelUserIds([
        { user_id: "mgr", role: "editor" },
        { user_id: "own", role: "owner" },
        { user_id: "coA", role: "co_owner" },
        { user_id: "coB", role: "co_owner" },
      ]),
    ).toEqual(["own", "coA", "coB"]);
  });
  it("returns the co-owners when there is no owner row", () => {
    expect(
      pickOwnerLevelUserIds([
        { user_id: "ed", role: "editor" },
        { user_id: "coA", role: "co_owner" },
      ]),
    ).toEqual(["coA"]);
  });
  it("falls back to the first row when there is neither", () => {
    expect(
      pickOwnerLevelUserIds([
        { user_id: "a", role: "editor" },
        { user_id: "b", role: "editor" },
      ]),
    ).toEqual(["a"]);
  });
  it("returns [] for no rows", () => {
    expect(pickOwnerLevelUserIds([])).toEqual([]);
    expect(pickOwnerLevelUserIds(null)).toEqual([]);
  });
});

describe("pickAccountUserId", () => {
  it("still picks the owner", () => {
    expect(pickAccountUserId([{ user_id: "m", role: "editor" }, { user_id: "o", role: "owner" }])).toBe("o");
  });
});
