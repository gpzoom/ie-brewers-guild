import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberEditingProvider, type MemberEditingValue } from "./MemberEditingContext";
import { ThemePicker } from "./ThemePicker";
import { LogoUploader } from "./LogoUploader";
import { CoverEditor } from "./CoverEditor";
import { SocialImageEditor } from "./SocialImageEditor";
import { LogoPhotosCoverSection } from "./LogoPhotosCoverSection";
import type { MemberDraftBundle } from "@/lib/drafts/drafts.server";
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

describe("Logo, Photos & Cover shows one shared-look note for the group", () => {
  const draft = {
    member: {
      id: "m",
      slug: "s",
      status: "draft",
      member_type: "producer",
      business_name: "Hangar 24",
    },
    data: {
      basics: {
        business_name: "Hangar 24 Irvine",
        city: "Irvine",
        state: "CA",
        logo_background: "light",
        cover_asset_id: "a1",
        cover_crop: { x: 0, y: 0, w: 1, h: 1 },
        og_image_asset_id: "a1",
      },
      theme: { theme: "teal" },
      media: { slides: [] },
    },
    dirtySections: [],
    role: "owner",
    logoUrl: "https://example.test/logo.png",
  } as unknown as MemberDraftBundle;
  const section = (readOnly?: boolean) =>
    createElement(LogoPhotosCoverSection, {
      draft,
      assets: [asset],
      uploadTokens: [],
      pending: [],
      canEditLogoAndCover: true,
      peopleHref: null,
      showSocialImage: true,
      readOnly,
    });
  const count = (html: string, text: string) => html.split(text).length - 1;

  it("the manager sees the pill once, and every editor still works", () => {
    const html = render(section(), manager);
    expect(count(html, "Shared by all 4 locations")).toBe(1);
    expect(html).toContain('id="logo-upload"');
    expect(html).toContain('id="cover-choose"');
    expect(html).toContain('id="social-image-choose"');
  });

  it("anyone else sees BZ5 once, with the logo, cover and link preview locked", () => {
    const html = render(section(), nonManager);
    expect(count(html, BZ5)).toBe(1);
    expect(html).not.toContain('id="logo-upload"');
    expect(html).not.toContain('id="cover-choose"');
    expect(html).not.toContain('id="social-image-choose"');
  });

  it("read-only in short setup: the BZ3 variant once, and locked", () => {
    const html = render(section(true), manager);
    expect(count(html, "Shared by all 4 locations")).toBe(1);
    expect(count(html, BZ3)).toBe(1);
    expect(html).not.toContain('id="logo-upload"');
    expect(html).not.toContain('id="cover-choose"');
  });

  it("no shared look: no note at all", () => {
    expect(render(section(), null)).not.toContain("Shared by");
  });

  it("an editor told to hide its note stays locked without one", () => {
    const html = render(
      createElement(CoverEditor, {
        memberId: "m",
        coverAssetId: "a1",
        coverCrop: null,
        galleryAssets: [asset],
        hideSharedNote: true,
      }),
      nonManager,
    );
    expect(html).not.toContain(BZ5);
    expect(html).not.toContain('id="cover-choose"');
  });
});
