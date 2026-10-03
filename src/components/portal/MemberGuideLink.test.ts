import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("Member Guide in the menu", () => {
  // Edit as them opens /admin, not the portal: the link lives in the shell
  // both surfaces share, so neither can lose it.
  it("is in AdminShell's sidebar, which /portal and /admin both use", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/components/admin/AdminShell.tsx"), "utf-8");
    expect(shell).toContain("<MemberGuideSidebarLink />");
    const portal = readFileSync(resolve(process.cwd(), "src/routes/portal._sections.tsx"), "utf-8");
    expect(portal).not.toContain("<MemberGuideSidebarLink />");
  });
});

describe("Member Guide on the Welcome step (owner, 2026-10-02)", () => {
  it("the note takes the lede's font size instead of setting its own", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideNote));
    expect(html).not.toMatch(/text-\[\d+px\]/);
  });

  it("sits in the lede, right after its first sentence, above What to have handy", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/portal/setup/IntroSteps.tsx"), "utf-8");
    const welcome = src.slice(src.indexOf("export function WelcomeStep"));
    const note = welcome.indexOf("<MemberGuideNote />");
    expect(note).toBeGreaterThan(welcome.indexOf("finished later."));
    expect(note).toBeLessThan(welcome.indexOf("continueLabel="));
  });
});
