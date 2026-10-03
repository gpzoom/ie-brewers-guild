import { describe, expect, it } from "vitest";
import { validateDirectorySearch } from "./search-params";

describe("validateDirectorySearch", () => {
  it("returns an empty object for no params", () => {
    expect(validateDirectorySearch({})).toEqual({});
  });

  it("accepts a valid member_type filter", () => {
    expect(validateDirectorySearch({ filter: "mobile" })).toEqual({ filter: "mobile" });
  });

  it("drops an invalid filter value", () => {
    expect(validateDirectorySearch({ filter: "brewery" })).toEqual({});
  });

  it("accepts the one supported sort value", () => {
    expect(validateDirectorySearch({ sort: "business_name" })).toEqual({ sort: "business_name" });
  });

  it("drops an unsupported sort value", () => {
    expect(validateDirectorySearch({ sort: "distance" })).toEqual({});
  });

  it("parses numeric map position from string search params", () => {
    expect(validateDirectorySearch({ mapLat: "33.95", mapLng: "-117.3", mapZoom: "9" })).toEqual({
      mapLat: 33.95,
      mapLng: -117.3,
      mapZoom: 9,
    });
  });

  it("accepts numeric map position values directly", () => {
    expect(validateDirectorySearch({ mapLat: 33.95, mapZoom: 9 })).toEqual({
      mapLat: 33.95,
      mapZoom: 9,
    });
  });

  it("drops a non-numeric map position value", () => {
    expect(validateDirectorySearch({ mapLat: "not-a-number" })).toEqual({});
  });

  it("carries every valid field at once", () => {
    expect(
      validateDirectorySearch({
        filter: "producer",
        sort: "business_name",
        mapLat: 34,
        mapLng: -117,
        mapZoom: 10,
      }),
    ).toEqual({
      filter: "producer",
      sort: "business_name",
      mapLat: 34,
      mapLng: -117,
      mapZoom: 10,
    });
  });
});
