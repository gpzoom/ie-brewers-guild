import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_GUIDES, memberGuidePath } from "./member-guide";

const DOCS_COPY = {
  producer: "docs/member-guide/ISC-Brewers-Guild-Member-Guide-Producer.pdf",
  mobile: "docs/member-guide/ISC-Brewers-Guild-Member-Guide-Mobile.pdf",
  allied: "docs/member-guide/ISC-Brewers-Guild-Member-Guide-Affiliate.pdf",
} as const;

describe("Member Guide PDFs", () => {
  it("each member type has its own guide path", () => {
    expect(memberGuidePath("producer")).toBe("/member-guide-producer.pdf");
    expect(memberGuidePath("mobile")).toBe("/member-guide-mobile.pdf");
    expect(memberGuidePath("allied")).toBe("/member-guide-affiliate.pdf");
  });

  it("MEMBER_GUIDES lists all three with their labels, descriptions and paths", () => {
    expect(MEMBER_GUIDES).toEqual([
      {
        type: "producer",
        label: "Producers",
        description: "alcohol producers with a taproom",
        path: "/member-guide-producer.pdf",
      },
      {
        type: "mobile",
        label: "Mobile",
        description: "such as entertainment, food trucks or pop-up vendors",
        path: "/member-guide-mobile.pdf",
      },
      {
        type: "allied",
        label: "Affiliate",
        description: "industry partners such as suppliers and service providers",
        path: "/member-guide-affiliate.pdf",
      },
    ]);
  });

  for (const { type, path } of MEMBER_GUIDES) {
    it(`the site's ${type} copy matches the guide in docs/member-guide (rebuild with npm run build:guides)`, () => {
      const source = readFileSync(resolve(process.cwd(), DOCS_COPY[type]));
      const served = readFileSync(resolve(process.cwd(), "public", path.slice(1)));
      expect(served.equals(source)).toBe(true);
    });
  }
});
