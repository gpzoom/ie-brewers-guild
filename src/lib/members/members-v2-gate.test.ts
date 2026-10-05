import { describe, expect, it } from "vitest";
import { isMembersV2Host } from "./members-v2-gate";

describe("isMembersV2Host (/members-2 never shows on the live site)", () => {
  it.each([
    ["https://iscbrewersguild.org/members-2", false],
    ["https://www.iscbrewersguild.org/members-2", false],
    ["https://ISCBrewersGuild.org/members-2", false],
    ["https://ie-brewers-guild-staging.boblelle77.workers.dev/members-2", true],
    ["http://localhost:5199/members-2", true],
    ["not a url", false],
  ])("%s -> %s", (url, allowed) => {
    expect(isMembersV2Host(url)).toBe(allowed);
  });
});
