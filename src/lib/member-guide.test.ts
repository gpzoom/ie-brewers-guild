import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_GUIDE_PATH } from "./member-guide";

describe("Member Guide PDF", () => {
  it("is served at /member-guide.pdf", () => {
    expect(MEMBER_GUIDE_PATH).toBe("/member-guide.pdf");
  });

  it("the site's copy matches the guide in docs/member-guide (re-copy it after rebuilding the PDF)", () => {
    const source = readFileSync(resolve(process.cwd(), "docs/member-guide/ISC-Brewers-Guild-Member-Profile-Guide.pdf"));
    const served = readFileSync(resolve(process.cwd(), "public/member-guide.pdf"));
    expect(served.equals(source)).toBe(true);
  });
});
