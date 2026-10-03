import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberGuideNote, MemberGuideSidebarLink } from "./MemberGuideLink";

describe("Member Guide links", () => {
  it("the portal sidebar link opens the PDF in a new tab", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideSidebarLink));
    expect(html).toContain('href="/member-guide.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("Member Guide");
  });

  it("the Welcome step's note links to the PDF", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideNote));
    expect(html).toContain('href="/member-guide.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Member Guide");
  });
});
