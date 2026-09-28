import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewerRole } from "@/lib/drafts/sections";
import { CameraRollHint, canInvitePeople } from "@/components/admin/CameraRollHint";
import {
  ADMIN_EDITING_PATHS,
  MemberEditingProvider,
  type MemberEditingValue,
} from "@/components/admin/MemberEditingContext";

function render(role: ViewerRole | null, isImpersonating = false, peopleHref: string | null = "/portal/people") {
  const value: MemberEditingValue = {
    memberId: "m-1",
    memberName: "Test Brewing",
    memberType: "producer",
    role,
    isImpersonating,
    isPublished: false,
    slug: "test-brewing",
    surface: "portal",
    paths: ADMIN_EDITING_PATHS,
  };
  return renderToStaticMarkup(
    createElement(MemberEditingProvider, {
      value,
      children: createElement(CameraRollHint, { peopleHref }),
    }),
  );
}

describe("CameraRollHint", () => {
  it("always shows the camera roll hint", () => {
    for (const role of ["owner", "editor", "media_events", "guild_admin"] as const) {
      expect(render(role)).toContain("still in your phone&#x27;s camera roll");
    }
  });

  it("links People for the owner, plus the creator link", () => {
    const html = render("owner");
    expect(html).toContain('href="/portal/people"');
    expect(html).toContain("Photos &amp; events editor</a>");
    expect(html).toContain('href="#creator-link"');
  });

  it("gives a Guild admin editing as the member the owner line", () => {
    expect(render("guild_admin")).toContain('href="/portal/people"');
    // Impersonating counts as owner rights even if the admin also has a narrower role.
    expect(render("editor", true)).toContain('href="/portal/people"');
  });

  it("shows only the creator link to full and Photos & events editors", () => {
    for (const role of ["editor", "media_events"] as const) {
      const html = render(role);
      expect(html).not.toContain("/portal/people");
      expect(html).not.toContain("Invite them");
      expect(html).toContain("Send them a <a");
      expect(html).toContain('href="#creator-link"');
    }
  });

  it("names People without a link in the setup wizard", () => {
    const html = render("owner", false, null);
    expect(html).not.toContain("/portal/people");
    expect(html).toContain("from People, once setup is done");
  });

  it("canInvitePeople: owner rights only", () => {
    expect(canInvitePeople("owner", false)).toBe(true);
    expect(canInvitePeople("guild_admin", false)).toBe(true);
    expect(canInvitePeople("editor", true)).toBe(true);
    expect(canInvitePeople("editor", false)).toBe(false);
    expect(canInvitePeople("media_events", false)).toBe(false);
    expect(canInvitePeople(null, false)).toBe(false);
  });
});

describe("where the hint is mounted", () => {
  // The three gallery upload boxes: portal Photos, wizard Photos step, /admin/media.
  // Each mounts the hint directly under <MediaGallery>.
  const files = [
    "src/components/portal/PortalSectionView.tsx",
    "src/components/portal/setup/SectionSteps.tsx",
    "src/routes/admin.media.tsx",
  ];
  for (const file of files) {
    it(`renders under the gallery in ${file}`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toMatch(/<MediaGallery[^>]*\/>\s*(\{\/\*[^]*?\*\/\}\s*)?<CameraRollHint/);
    });
  }

  it("the creator link panel carries the anchor", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/admin/CreatorLinkPanel.tsx"), "utf8");
    expect(source).toContain("id={CREATOR_LINK_ANCHOR}");
  });
});
