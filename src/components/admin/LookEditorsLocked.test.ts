import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberEditingProvider, type MemberEditingValue } from "./MemberEditingContext";
import { ThemePicker } from "./ThemePicker";
import { LogoUploader } from "./LogoUploader";
import { CoverEditor } from "./CoverEditor";
import { SocialImageEditor } from "./SocialImageEditor";
import type { SharedLook } from "@/lib/portal/shared-look";
import type { MediaAssetRow } from "@/lib/supabase/types";

const manager: SharedLook = {
  businessName: "Hangar 24",
  locationCount: 4,
  canChange: true,
  managerLabel: "boss@hangar24.example",
};
const nonManager: SharedLook = { ...manager, canChange: false };
const BZ5 = "Shared by all Hangar 24 locations. boss@hangar24.example manages this.";
const BZ3 = "every location updates.";

function render(element: ReactElement, sharedLook: SharedLook | null): string {
  const value: MemberEditingValue = {
    memberId: "m",
    memberName: "Hangar 24 Irvine",
    memberType: "producer",
    role: "owner",
    isImpersonating: false,
    isPublished: false,
    slug: "hangar-24-irvine",
    surface: "portal",
    sharedLook,
    paths: { basics: null, hours: null, events: null },
  };
  return renderToStaticMarkup(createElement(MemberEditingProvider, { value, children: element }));
}

const asset = {
  id: "a1",
  review_status: "approved",
  original_filename: "cover.jpg",
  width: 2000,
  height: 800,
} as unknown as MediaAssetRow;

describe("ThemePicker and the shared look", () => {
  const picker = (readOnly?: boolean) =>
    createElement(ThemePicker, {
      memberId: "m",
      currentTheme: "teal",
      showHeading: false,
      readOnly,
    });

  it("a separate business or single location: unchanged, no note", () => {
    const html = render(picker(), null);
    expect(html).not.toContain("Shared by");
    expect(html).not.toContain("disabled");
  });

  it("the manager: works as today, with the pill", () => {
    const html = render(picker(), manager);
    expect(html).toContain("Shared by all 4 locations");
    expect(html).not.toContain("disabled");
  });

  it("anyone else: the BZ5 note, every swatch disabled, the current one marked", () => {
    const html = render(picker(), nonManager);
    expect(html).toContain(BZ5);
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect((html.match(/type="radio"[^>]*disabled/g) ?? []).length).toBe(8);
    expect(html).toContain("Current");
    // Names stay at full ink for contrast: only the color bands dim.
    expect(html).not.toContain("opacity-50");
  });

  it("the manager in short setup: pill, BZ3 line, locked", () => {
    const html = render(picker(true), manager);
    expect(html).toContain("Shared by all 4 locations");
    expect(html).toContain(BZ3);
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
});

describe("LogoUploader and the shared look", () => {
  const uploader = (readOnly?: boolean) =>
    createElement(LogoUploader, {
      memberId: "m",
      initialLogoUrl: "https://example.test/logo.png",
      initialBackground: "light",
      theme: "teal",
      businessName: "Hangar 24",
      readOnly,
    });

  it("the manager: upload and background switch as today, with the pill", () => {
    const html = render(uploader(), manager);
    expect(html).toContain("Shared by all 4 locations");
    expect(html).toContain('id="logo-upload"');
    expect(html).toContain("Replace");
  });

  it("anyone else: the logo shows; no upload, background switch disabled", () => {
    const html = render(uploader(), nonManager);
    expect(html).toContain(BZ5);
    expect(html).toContain('src="https://example.test/logo.png"');
    expect(html).not.toContain('id="logo-upload"');
    expect(html).not.toContain("Replace");
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect((html.match(/type="radio"[^>]*disabled/g) ?? []).length).toBe(3);
  });

  it("read-only in short setup locks it too", () => {
    const html = render(uploader(true), manager);
    expect(html).toContain(BZ3);
    expect(html).not.toContain('id="logo-upload"');
  });
});

describe("CoverEditor and the shared look", () => {
  const cover = (readOnly?: boolean) =>
    createElement(CoverEditor, {
      memberId: "m",
      coverAssetId: "a1",
      coverCrop: { x: 0, y: 0, w: 1, h: 1 },
      galleryAssets: [asset],
      readOnly,
    });

  it("the manager: choose and remove as today, with the pill", () => {
    const html = render(cover(), manager);
    expect(html).toContain("Shared by all 4 locations");
    expect(html).toContain('id="cover-choose"');
    expect(html).toContain("Remove cover");
  });

  it("anyone else: the cover shows; no choose, crop or remove", () => {
    const html = render(cover(), nonManager);
    expect(html).toContain(BZ5);
    expect(html).toContain('src="/api/admin-media/a1"');
    expect(html).not.toContain('id="cover-choose"');
    expect(html).not.toContain("Remove cover");
    expect(html).not.toContain("Zoom");
    expect(html).not.toContain("Reset");
  });

  it("read-only in short setup locks it too", () => {
    const html = render(cover(true), manager);
    expect(html).toContain(BZ3);
    expect(html).not.toContain('id="cover-choose"');
  });
});

describe("SocialImageEditor and the shared look", () => {
  const social = (readOnly?: boolean) =>
    createElement(SocialImageEditor, {
      memberId: "m",
      memberType: "producer",
      ogImageAssetId: "a1",
      galleryAssets: [asset],
      readOnly,
    });

  it("the manager: choose and remove as today, with the pill", () => {
    const html = render(social(), manager);
    expect(html).toContain("Shared by all 4 locations");
    expect(html).toContain('id="social-image-choose"');
  });

  it("anyone else: the image shows; no choose or remove", () => {
    const html = render(social(), nonManager);
    expect(html).toContain(BZ5);
    expect(html).toContain('src="/api/admin-media/a1"');
    expect(html).not.toContain('id="social-image-choose"');
    expect(html).not.toContain("Remove");
  });

  it("read-only in short setup locks it too", () => {
    const html = render(social(true), manager);
    expect(html).toContain(BZ3);
    expect(html).not.toContain('id="social-image-choose"');
  });
});
