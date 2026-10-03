import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/portal", "/portal"],
    ["/portal/", "/portal"],
    ["/portal/setup/basics", "/portal/setup/basics"],
    ["/portal/people", "/portal/people"],
    ["/portal/setup/logo-cover", "/portal/setup/logo-cover"],
    ["/portal?switch=1", "/portal"],
    ["/portal#top", "/portal"],
    ["/portal/media?x=//evil.com", "/portal/media"],
  ])("allows %s as %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [42],
    [["/portal"]],
    [""],
    ["/"],
    ["/admin"],
    ["/guild"],
    ["/portals"],
    ["/portalx/y"],
    ["portal"],
    ["https://evil.com"],
    ["https://evil.com/portal"],
    ["//evil.com"],
    ["//evil.com/portal"],
    ["/portal//evil.com"],
    ["/\\evil.com"],
    ["/portal\\..\\admin"],
    ["/portal/../admin"],
    ["/portal/./x"],
    ["/portal/.."],
    ["/portal/%2e%2e/admin"],
    ["/portal%2F..%2Fadmin"],
    ["%2Fportal"],
    ["/portal/%2F%2Fevil.com"],
    ["/portal/%zz"],
    ["/portal/a b"],
    ["/portal/\nx"],
    ["/portal/\tx"],
    ["javascript:alert(1)"],
    ["/portal/javascript:alert(1)"],
    ["/portal//"],
    ["?next=/portal"],
    [`/portal/${"a".repeat(250)}`],
  ])("drops %j", (input) => {
    expect(safeNextPath(input)).toBeUndefined();
  });
});
