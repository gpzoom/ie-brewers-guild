import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberGuideNote, MemberGuideSidebarLink } from "./MemberGuideLink";

describe("Member Guide links", () => {
  it("the portal sidebar link opens the PDF in a new tab", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideSidebarLink, { memberType: "producer" }));
    expect(html).toContain('href="/member-guide-producer.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("Member Guide");
  });

  it("each link opens the guide for the member's own type", () => {
    for (const [memberType, path] of [
      ["producer", "/member-guide-producer.pdf"],
      ["mobile", "/member-guide-mobile.pdf"],
      ["allied", "/member-guide-affiliate.pdf"],
    ] as const) {
      expect(renderToStaticMarkup(createElement(MemberGuideSidebarLink, { memberType }))).toContain(`href="${path}"`);
      expect(renderToStaticMarkup(createElement(MemberGuideNote, { memberType }))).toContain(`href="${path}"`);
    }
  });

  it("the Welcome step's note links to the PDF", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideNote, { memberType: "producer" }));
    expect(html).toContain('href="/member-guide-producer.pdf"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Member Guide");
  });
});

describe("Member Guide in the menu", () => {
  // Edit as them opens /admin, not the portal: the link lives in the shell
  // both surfaces share, so neither can lose it.
  it("is in AdminShell's sidebar, which /portal and /admin both use", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/components/admin/AdminShell.tsx"), "utf-8");
    expect(shell).toContain("<MemberGuideSidebarLink memberType=");
    const portal = readFileSync(resolve(process.cwd(), "src/routes/portal._sections.tsx"), "utf-8");
    expect(portal).not.toContain("<MemberGuideSidebarLink />");
  });
});

describe("Member Guide on the Welcome step (owner, 2026-10-02)", () => {
  it("the note takes the lede's font size instead of setting its own", () => {
    const html = renderToStaticMarkup(createElement(MemberGuideNote, { memberType: "producer" }));
    expect(html).not.toMatch(/text-\[\d+px\]/);
  });

  it("sits in the lede, right after its first sentence, above What to have handy", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/portal/setup/IntroSteps.tsx"), "utf-8");
    const welcome = src.slice(src.indexOf("export function WelcomeStep"));
    const note = welcome.indexOf("<MemberGuideNote ");
    expect(note).toBeGreaterThan(welcome.indexOf("finished later."));
    expect(note).toBeLessThan(welcome.indexOf("continueLabel="));
  });
});

describe("Welcome's type line and Get started", () => {
  const intro = readFileSync(resolve(process.cwd(), "src/components/portal/setup/IntroSteps.tsx"), "utf-8");
  const server = readFileSync(resolve(process.cwd(), "src/lib/portal/portal-setup.server.ts"), "utf-8");

  it("reads \"You're set up as a/an <type label>\"", () => {
    expect(intro).toContain("You're set up as {article}");
    expect(intro).toContain("MEMBER_TYPE_SHORT_LABEL[shell.memberType]");
  });

  it("Get started always calls the server with no type, so a stale tab just continues", () => {
    expect(intro).toContain("await confirmPortalMemberType();");
    expect(intro).not.toContain("if (!shell.typeConfirmed)");
  });

  it("the server confirms the member's own stored type and skips when already confirmed", () => {
    const fn = server.slice(server.indexOf("export const confirmPortalMemberType"), server.indexOf("export const completePortalSetup"));
    expect(fn).not.toContain("inputValidator");
    expect(fn).toContain("type_confirmed_at !== null");
    expect(fn).toContain("confirmMemberType(supabase, member.memberId, current.member_type)");
  });
});
