import { describe, expect, it } from "vitest";
import { getAdjacentInList, type DirectoryEntry } from "./list-position";

const entry = (id: string): DirectoryEntry => ({
  id,
  slug: id,
  businessName: id,
  city: "Riverside",
  memberType: "producer",
});

describe("getAdjacentInList", () => {
  it("returns null/null for a list with fewer than two items", () => {
    expect(getAdjacentInList([], "a")).toEqual({ prev: null, next: null });
    expect(getAdjacentInList([entry("a")], "a")).toEqual({ prev: null, next: null });
  });

  it("returns null/null when the current id is not in the list", () => {
    expect(getAdjacentInList([entry("a"), entry("b")], "z")).toEqual({ prev: null, next: null });
  });

  it("returns the neighbors of a middle item", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "b")).toEqual({ prev: entry("a"), next: entry("c") });
  });

  it("wraps the next pointer from the last item back to the first", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "c").next).toEqual(entry("a"));
  });

  it("wraps the prev pointer from the first item back to the last", () => {
    const items = [entry("a"), entry("b"), entry("c")];
    expect(getAdjacentInList(items, "a").prev).toEqual(entry("c"));
  });

  it("wraps both directions for a two-item list", () => {
    const items = [entry("a"), entry("b")];
    expect(getAdjacentInList(items, "a")).toEqual({ prev: entry("b"), next: entry("b") });
  });
});
