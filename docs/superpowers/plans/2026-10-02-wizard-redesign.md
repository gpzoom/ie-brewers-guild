# Setup Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the member setup wizard to match the owner-approved artboards: one "Logo, Photos & Cover" step with a live preview, Back on every screen after Welcome, a prominent member-type tag, "Pick your theme", new Food wording plus a "We have our own kitchen" switch. Then redo the member guide with sample-data screenshots.

**Architecture:** The wizard is TanStack Start routes under `/portal/setup/$step`. Its steps wrap the same editor components as the portal (`/portal/$section`) and the legacy `/admin` editor. Step order and access rules live in pure modules (`src/lib/portal/wizard-steps.ts`, `portal-sections.ts`, `section-completeness.ts`), which are unit-tested. The merged step is a new component that composes the existing editors, which report their state to a new preview through optional callbacks. The kitchen switch adds one `members` column, written through a SECURITY DEFINER function, because direct client writes to `members` are locked.

**Tech Stack:** TanStack Start (React 19, TypeScript), Tailwind v4, Supabase (Postgres, RLS, pgTAP), Vitest, Cloudflare Workers. Edge headless for the guide PDF.

**Spec:** `docs/superpowers/specs/2026-10-02-wizard-redesign-design.md`.
**Approved artboards:** `docs/design/onboarding/wizard/*.dc.html` (the live canvas is https://claude.ai/artifact/UENo3svcNBeNrgM6FMMtLV). Where wording differs between this plan and an artboard, the artboard wins, except for the Ruling lines below.

## Global Constraints

- **Branch and production:**
  - Work on `staging` only. Never merge to `main` or touch production without the owner's explicit go.
  - The Supabase database is shared by staging and production. Migrations must be additive and safe for the live site's current code.
- **Language and style:**
  - US spelling in all copy ("color", "canceled", "gray").
  - Match the surrounding code's comment density, naming and Tailwind idioms (`text-ink-muted`, `bg-canvas-2`, `rounded-[12px]`, etc.).
- **Checks before every push** (all must pass):
  - `npm run test`
  - `npm run test:db`
  - `npm run build`
  - The two type errors that already exist (MembersMap, survey) may remain; don't add new ones (`npx tsc --noEmit`).
  - Every `createSsrRpc` id still has a handler: run the server-fn check used earlier, which must report `missing=0`.
- **Member-type tag:** PRODUCER uses `#F5E2D0` on `#7A4413`, MOBILE MEMBER uses `#DCEDEC` on `#17605F`, ALLIED MEMBER uses `#E6E3F3` on `#3B4B9A`.
- **Canva link:** `https://www.canva.com/features/background-remover/`, opening in a new tab.
- **Rulings** (deviations from the artboards, decided while planning):
  - **Booking phone hint:** the Mobile hint reads "More booking links can go in the Links step." The artboard's "step 7" is the guide's number, but a Mobile member's screen calls Links step 6.
  - **Theme grid width:** the theme grid shows 2 columns when its container is narrower than 22rem and 4 columns otherwise. A fixed 4 columns is what clipped the names.

## Review Focus

1. **Back after setup:** a member whose setup is already complete clicks **Back** on step 4. The basics must open, not bounce to `/portal`. *(Task 1 test)*
2. **Old bookmarks:** `/portal/photos` and `/portal/setup/photos` must land on Logo, Photos & Cover. *(Tasks 1 and 3 tests)*
3. **Photos & events editor on the merged page:** they see Gallery and Carousel only, with no Logo or Cover parts and no error. *(Task 6 test)*
4. **Kitchen switch priorities:** with the switch on, a day the posted hours mark closed still says "Closed", and a day with a #food listing still lists it. *(Task 9 test)*
5. **Brand-new member preview:** with no logo, photos or cover, the preview shows the theme color band and a "LOGO" placeholder, never a broken image. *(Task 5 test)*

---

### Task 1: Step order, labels and access rules

**Files:**
- Modify: `src/lib/portal/wizard-steps.ts`
- Test: `src/lib/portal/wizard-steps.test.ts`

**Interfaces:**
- Produces:
  - `NUMBERED_SETUP_STEPS` without `"photos"`;
  - `SETUP_STEP_LABELS["logo-cover"] === "Logo, Photos & Cover"`;
  - `SETUP_STEP_LABELS.theme === "Pick your theme"`;
  - `resolveSetupAccess` (same signature) with the new rules below.

- [ ] **Step 1: Update the tests first.** In `wizard-steps.test.ts`:
  - Delete `"photos"` from every expected step list.
  - Change the counts in the test names: producer eight, mobile seven, allied nine.
  - Add these cases:

```ts
describe("redesign (2026-10-02)", () => {
  it("labels step 4 and step 9 with their new names", () => {
    expect(stepLabel("logo-cover", "producer")).toBe("Logo, Photos & Cover");
    expect(stepLabel("theme", "producer")).toBe("Pick your theme");
  });

  it("a producer's step 4 is step 4 of 8", () => {
    expect(stepPosition("logo-cover", "producer")).toEqual({ number: 4, total: 8 });
  });

  it("once setup is complete, Back can reach The basics, Confirm type and Welcome", () => {
    for (const step of ["welcome", "type", "basics"]) {
      expect(
        resolveSetupAccess({ step, memberType: "producer", role: "owner", typeConfirmed: true, setupCompleted: true }),
      ).toEqual({ kind: "ok" });
    }
  });

  it("Confirm type stays open once the type is confirmed (it shows the locked type)", () => {
    expect(
      resolveSetupAccess({ step: "type", memberType: "producer", role: "owner", typeConfirmed: true, setupCompleted: false }),
    ).toEqual({ kind: "ok" });
  });

  it("the old photos step goes to Logo, Photos & Cover", () => {
    expect(
      resolveSetupAccess({ step: "photos", memberType: "producer", role: "owner", typeConfirmed: true, setupCompleted: true }),
    ).toEqual({ kind: "step", step: "logo-cover" });
  });

  it("a Photos & events editor still never sees the wizard", () => {
    expect(
      resolveSetupAccess({ step: "basics", memberType: "producer", role: "media_events", typeConfirmed: true, setupCompleted: true }),
    ).toEqual({ kind: "portal" });
  });
});
```

  - Delete or rewrite these existing tests to match the new rules:
    - the ones that expect `{ kind: "portal" }` for steps 1–3 once setup is complete;
    - the one that expects `type` → `basics` when the type is confirmed.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npx vitest run src/lib/portal/wizard-steps.test.ts`
  - Expected: FAIL (the step lists still include photos, and the labels are the old ones).

- [ ] **Step 3: Implement** in `wizard-steps.ts`:
  - Remove `"photos"` from `NUMBERED_SETUP_STEPS` and from `SETUP_STEP_LABELS`. TypeScript then flags every leftover `"photos"` step use; fix those in Tasks 2–3.
  - Set `"logo-cover": "Logo, Photos & Cover"` and `theme: "Pick your theme"`.
  - Update the header comment table (drop the photos row; producer 8, mobile 7, allied 9).
  - In `resolveSetupAccess`, after the `media_events` check, add:

```ts
  // The old Photos step is part of step 4 now (redesign, 2026-10-02).
  if (input.step === "photos") return { kind: "step", step: "logo-cover" };
```

  - Replace the `if (!inSetup) {...}` block with:

```ts
  // Once setup is complete every step stays open, so Back always works.
  // "/portal never routes into the wizard" is what keeps it from showing
  // again (portal-destination), not these redirects.
  if (!inSetup) return { kind: "ok" };
```

  - Change `case "type":` to:

```ts
    case "type":
      // Open either way: confirmed, it shows the locked type with Continue.
      return { kind: "ok" };
```

  - Update the doc comment above `resolveSetupAccess` to match.

- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run src/lib/portal/wizard-steps.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/wizard-steps.ts src/lib/portal/wizard-steps.test.ts
git commit -m "feat(wizard): 8/7/9 steps, Logo Photos & Cover, Pick your theme, Back always open after setup"
```

---

### Task 2: One portal section for logo, photos and cover

**Files:**
- Modify:
  - `src/lib/portal/portal-sections.ts`
  - `src/lib/portal/section-completeness.ts`
- Test:
  - `src/lib/portal/portal-sections.test.ts`
  - `src/lib/portal/section-completeness.test.ts`

**Interfaces:**
- Consumes: Task 1's step names.
- Produces:
  - `PORTAL_SECTIONS` without `"photos"`;
  - `PORTAL_SECTION_LABELS["logo-cover"] = { label: "Logo, Photos & Cover", short: "Photos" }`;
  - `MEDIA_EVENTS_SECTIONS = ["logo-cover", "events"]`;
  - `firstPortalSection("media_events") === "logo-cover"`;
  - `CompletenessStep` without `"photos"`.

- [ ] **Step 1: Write the failing tests.** In `portal-sections.test.ts`, replace the photos expectations with:

```ts
it("logo, photos and cover are one section, which a Photos & events editor can open", () => {
  expect(PORTAL_SECTION_LABELS["logo-cover"]).toEqual({ label: "Logo, Photos & Cover", short: "Photos" });
  expect(isPortalSection("photos")).toBe(false);
  expect(portalSectionsFor({ role: "media_events", memberType: "producer" })).toEqual(["logo-cover", "events"]);
  expect(firstPortalSection("media_events")).toBe("logo-cover");
});
```

In `section-completeness.test.ts`, add the following and remove the `photos` rows from the expected lists:

```ts
it("step 4 counts as done with a logo, a cover or a slide", () => {
  const base = emptyDraftForTest(); // the file's existing draft factory
  const member = { memberType: "producer", typeConfirmed: true, eventCount: 0, hasCalendarConnection: false } as const;
  const withSlide = { ...base, media: { slides: [{ asset_id: "a", crop: { x: 0, y: 0, w: 1, h: 1 }, outbound_url: null, sort_order: 0 }] } };
  expect(sectionCompleteness(withSlide, member).find((s) => s.step === "logo-cover")?.done).toBe(true);
  expect(sectionCompleteness(base, member).map((s) => s.step)).not.toContain("photos");
});
```

If the file's draft factory has a different name, use that one, and match its member object to the existing tests' shape.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npx vitest run src/lib/portal/portal-sections.test.ts src/lib/portal/section-completeness.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `portal-sections.ts`:
    - remove `"photos"` from `PORTAL_SECTIONS` and its label;
    - set the logo-cover label as above, with `MEDIA_EVENTS_SECTIONS = ["logo-cover", "events"]`;
    - `firstPortalSection` returns `"logo-cover"` for `media_events`;
    - update the header comment table (`logo-cover` is open to all three roles);
    - the `sectionForCompletenessStep` default branch now never sees `photos`.
  - In `section-completeness.ts`:
    - remove `"photos"` from `CHECKLIST_STEPS` and from the switch;
    - make step 4's check:

```ts
    case "logo-cover":
      return (
        basics.logo_asset_id !== null ||
        basics.cover_asset_id !== null ||
        draft.media.slides.length > 0
      );
```

- [ ] **Step 4: Run the tests and see them pass.** PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(portal): Logo, Photos & Cover is one section; Photos & events editors open it"`

---

### Task 3: Data loaders and old-URL redirects

**Files:**
- Modify:
  - `src/lib/portal/section-data.server.ts`
  - `src/lib/portal/portal-shell.server.ts`
  - `src/lib/portal/portal-setup.server.ts`
  - `src/routes/portal._sections.$section.tsx`
  - `src/components/portal/setup/SetupStepView.tsx`
  - `src/components/portal/setup/SectionSteps.tsx` (delete `PhotosStep`)
- Test: `src/lib/portal/portal-sections.test.ts` (redirect helper)

**Interfaces:**
- Produces:
  - `loadLogoPhotosCoverSection(supabase, memberId): Promise<{ draft: MemberDraftBundle; assets: MediaAssetRow[]; uploadTokens: UploadTokenRow[]; pending: MediaAssetRow[] }>`;
  - `legacyPortalSection(name: string): PortalSection | null`, exported from `portal-sections.ts`;
  - step data `{ step: "logo-cover" } & Awaited<ReturnType<typeof loadLogoPhotosCoverSection>>`;
  - section data `{ section: "logo-cover" } & Loaded<typeof loadLogoPhotosCoverSection>`.

- [ ] **Step 1: Write the failing test** in `portal-sections.test.ts`:

```ts
it("maps the retired /portal/photos to Logo, Photos & Cover", () => {
  expect(legacyPortalSection("photos")).toBe("logo-cover");
  expect(legacyPortalSection("events")).toBeNull();
});
```

- [ ] **Step 2: Run it** → FAIL (`legacyPortalSection` is not exported).

- [ ] **Step 3: Implement.**
  - In `portal-sections.ts`:

```ts
/** Sections that were renamed or merged; old links still land somewhere. */
export function legacyPortalSection(name: string): PortalSection | null {
  return name === "photos" ? "logo-cover" : null;
}
```

  - In `section-data.server.ts`, replace `loadLogoCoverSection` and `loadPhotosSection` with one loader. Keep the old names out, so the compiler finds every caller:

```ts
/** Logo, Photos & Cover: the draft (logo, cover, slides), the gallery, upload links and the review tray. */
export async function loadLogoPhotosCoverSection(supabase: SessionClient, memberId: string) {
  const [draft, assets, uploadTokens, pending] = await Promise.all([
    loadMemberDraftBundle(supabase, memberId),
    listGallery(supabase, memberId),
    listTokens(supabase, memberId),
    listPending(supabase, memberId),
  ]);
  return { draft, assets, uploadTokens, pending };
}
```

  - In `portal-shell.server.ts` and `portal-setup.server.ts`:
    - drop the `photos` union members and cases;
    - point `logo-cover` at `loadLogoPhotosCoverSection`.
  - In `portal._sections.$section.tsx` `beforeLoad`, before the existing check:

```ts
    const renamed = legacyPortalSection(params.section);
    if (renamed) throw redirect({ to: "/portal/$section", params: { section: renamed } });
```

  - Delete `PhotosStep` and its `case "photos"` in `SetupStepView.tsx`. Task 6 replaces the logo-cover step's body. For now, keep `LogoCoverStep` compiling by passing it `galleryAssets={data.assets}`.

- [ ] **Step 4: Run** `npm run test` and `npx tsc --noEmit`. Expected: PASS, with no new type errors.
- [ ] **Step 5: Commit** `git commit -am "feat(portal): one loader for Logo, Photos & Cover; /portal/photos redirects"`

---

### Task 4: Step frame: a prominent type tag and a wide layout

**Files:**
- Create: `src/components/portal/setup/MemberTypeTag.tsx`
- Test: `src/components/portal/setup/MemberTypeTag.test.ts`
- Modify: `src/components/portal/setup/WizardStep.tsx`

**Interfaces:**
- Produces:
  - `MemberTypeTag({ memberType }: { memberType: MemberType })`;
  - `WizardStep` gains `wide?: boolean` (max width 1080px instead of 720px).

- [ ] **Step 1: Write the failing test**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberTypeTag } from "./MemberTypeTag";

describe("MemberTypeTag", () => {
  it.each([
    ["producer", "Producer", "#F5E2D0", "#7A4413"],
    ["mobile", "Mobile member", "#DCEDEC", "#17605F"],
    ["allied", "Allied Member", "#E6E3F3", "#3B4B9A"],
  ] as const)("%s reads %s in its own colors", (memberType, label, bg, fg) => {
    const html = renderToStaticMarkup(createElement(MemberTypeTag, { memberType }));
    expect(html).toContain(label);
    expect(html).toContain(bg);
    expect(html).toContain(fg);
    expect(html).toContain("uppercase");
  });
});
```

- [ ] **Step 2: Run it** → FAIL (module not found).

- [ ] **Step 3: Implement** `MemberTypeTag.tsx`:

```tsx
import type { MemberType } from "@/lib/supabase/types";
import { MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";

/** The guide's type colors (Producer orange, Mobile teal, Allied blue). */
const TAG_COLORS: Record<MemberType, { bg: string; fg: string }> = {
  producer: { bg: "#F5E2D0", fg: "#7A4413" },
  mobile: { bg: "#DCEDEC", fg: "#17605F" },
  allied: { bg: "#E6E3F3", fg: "#3B4B9A" },
};

/**
 * Which member type a wizard screen is for, large enough to spot in a
 * screenshot (owner, 2026-10-02). Replaces the small grey label.
 */
export function MemberTypeTag({ memberType }: { memberType: MemberType }) {
  const { bg, fg } = TAG_COLORS[memberType];
  return (
    <span
      className="inline-flex h-[30px] items-center gap-[7px] rounded-full px-3.5 text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: fg }} aria-hidden="true" />
      {MEMBER_TYPE_SHORT_LABEL[memberType]}
    </span>
  );
}
```

  In `WizardStep.tsx`:
  - Replace `<span>{MEMBER_TYPE_SHORT_LABEL[memberType]}</span>` with `<MemberTypeTag memberType={memberType} />`, and give the row `items-center`.
  - Add a `wide = false` prop: `const maxW = wide ? "max-w-[1080px]" : "max-w-[720px]";`.
  - Use `maxW` in place of each of the four literal `max-w-[720px]` classes.

- [ ] **Step 4: Run** `npx vitest run src/components/portal/setup/MemberTypeTag.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(wizard): large colored member-type tag; wide step layout"`

---

### Task 5: Live preview and editor callbacks

**Files:**
- Create:
  - `src/components/admin/ProfileHeaderPreview.tsx`
  - `src/components/admin/ProfileHeaderPreview.test.ts`
- Modify:
  - `src/components/admin/LogoUploader.tsx`
  - `src/components/admin/CoverEditor.tsx`
  - `src/components/admin/CarouselEditor.tsx`

**Interfaces:**
- Produces:
  - `ProfileHeaderPreview(props: { businessName: string; place: string | null; themeHex: string; logoUrl: string | null; logoBackground: LogoBackground; coverAssetId: string | null; firstSlideAssetId: string | null; slideCount: number })`.
  - Optional callbacks:
    - `LogoUploader`: `onPreviewChange?: (p: { logoUrl: string | null; background: LogoBackground }) => void`;
    - `CoverEditor`: `onPreviewChange?: (coverAssetId: string | null) => void`;
    - `CarouselEditor`: `onPreviewChange?: (slides: { asset_id: string }[]) => void`.
  - Images use `/api/admin-media/${assetId}`, the same URL the editors use.

- [ ] **Step 1: Write the failing test**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileHeaderPreview } from "./ProfileHeaderPreview";

const base = {
  businessName: "Sample Brewing Co.", place: "Riverside, CA", themeHex: "#B45309",
  logoUrl: null, logoBackground: "white" as const, coverAssetId: null, firstSlideAssetId: null, slideCount: 0,
};

describe("ProfileHeaderPreview", () => {
  it("a brand-new member gets the theme band and a LOGO placeholder, no images", () => {
    const html = renderToStaticMarkup(createElement(ProfileHeaderPreview, base));
    expect(html).toContain("#B45309");
    expect(html).toContain("LOGO");
    expect(html).not.toContain("<img");
    expect(html).toContain("Your slides show here");
  });

  it("shows the cover, the logo and slide 1 of N once they exist", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileHeaderPreview, { ...base, logoUrl: "https://x/logo.png", coverAssetId: "c1", firstSlideAssetId: "s1", slideCount: 3 }),
    );
    expect(html).toContain("/api/admin-media/c1");
    expect(html).toContain("/api/admin-media/s1");
    expect(html).toContain("https://x/logo.png");
    expect(html).toContain("Slide 1 of 3");
  });

  it("keeps the name below the cover band (no overlap)", () => {
    const html = renderToStaticMarkup(createElement(ProfileHeaderPreview, base));
    expect(html).not.toMatch(/-mt-[0-9]+[^"]*items-end/);
  });
});
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement** `ProfileHeaderPreview.tsx`. It matches the artboards' "Live preview" card: dark Guild frame, cover band, logo tile on its chosen background, name and city under the band, and slide 1. Get `LogoBackground` from wherever `LogoUploader` imports it.

```tsx
import type { LogoBackground } from "@/lib/supabase/types";

const LOGO_BG: Record<LogoBackground, string> = { white: "#FFFFFF", dark: "#241F1A", theme: "" };

/** Step 4's live preview: the top of the profile, from the editors' current state. */
export function ProfileHeaderPreview({
  businessName, place, themeHex, logoUrl, logoBackground, coverAssetId, firstSlideAssetId, slideCount,
}: {
  businessName: string; place: string | null; themeHex: string; logoUrl: string | null;
  logoBackground: LogoBackground; coverAssetId: string | null; firstSlideAssetId: string | null; slideCount: number;
}) {
  const tileBg = logoBackground === "theme" ? themeHex : LOGO_BG[logoBackground];
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      <div className="flex flex-col gap-2.5 rounded-2xl bg-[#14100C] p-3">
        <span className="px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#B6AC9D]">ISC Brewers Guild</span>
        <div className="overflow-hidden rounded-[12px] bg-canvas">
          {coverAssetId ? (
            <img src={`/api/admin-media/${coverAssetId}`} alt="" className="block h-[120px] w-full object-cover" />
          ) : (
            <div className="h-[120px]" style={{ backgroundColor: themeHex }} />
          )}
          <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3">
            <div
              className="flex size-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-canvas-border"
              style={{ backgroundColor: tileBg }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-[44px] max-w-[44px] object-contain" />
              ) : (
                <span className="text-[10px] tracking-[0.1em] text-ink-subtle">LOGO</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-display text-[18px] font-bold text-ink">{businessName}</span>
              {place && <span className="text-[12px] text-ink-muted">{place}</span>}
            </div>
          </div>
        </div>
        {firstSlideAssetId ? (
          <div className="px-3.5 pb-3.5">
            <img src={`/api/admin-media/${firstSlideAssetId}`} alt="" className="block h-[150px] w-full rounded-[10px] object-cover" />
            <span className="mt-1.5 block text-[10px] text-[#B6AC9D]">Slide 1 of {slideCount}</span>
          </div>
        ) : (
          <div className="mx-3.5 mb-3.5 flex h-[70px] items-center justify-center rounded-[10px] border border-dashed border-[#4A4238] text-[11px] text-ink-subtle">
            Your slides show here
          </div>
        )}
      </div>
      <p className="text-[12px] leading-[1.45] text-ink-muted">
        Updates as you go. Nothing changes on your live page until you publish.
      </p>
    </div>
  );
}
```

  Then add the callbacks. Each one is an optional prop plus an effect that reports state after it changes.
  - In `LogoUploader`:

```tsx
  useEffect(() => { onPreviewChange?.({ logoUrl, background }); }, [logoUrl, background, onPreviewChange]);
```

    Add `useEffect` to the react import.
  - In `CoverEditor`: `useEffect(() => { onPreviewChange?.(assetId); }, [assetId, onPreviewChange]);`
  - In `CarouselEditor`: `useEffect(() => { onPreviewChange?.(slides); }, [slides, onPreviewChange]);`
  - Callers that don't pass the prop behave exactly as before.

- [ ] **Step 4: Run** the preview test and `npm run test` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: live profile-header preview; logo, cover and carousel editors report their state"`

---

### Task 6: The Logo, Photos & Cover page in the wizard, the portal and /admin

**Files:**
- Create:
  - `src/components/admin/LogoPhotosCoverSection.tsx`
  - `src/components/admin/LogoPhotosCoverSection.test.ts`
  - `src/components/admin/PngHelpNote.tsx`
- Modify:
  - `src/components/portal/setup/SectionSteps.tsx` (`LogoCoverStep`)
  - `src/components/portal/setup/SetupStepView.tsx`
  - `src/components/portal/PortalSectionView.tsx` (`logo-cover` case; delete the `photos` case)
  - `src/routes/admin.media.tsx`
  - `src/routes/admin.basics.tsx` (remove its `logo` prop)
  - `src/components/admin/AdminShell.tsx` (nav label)
- Delete: `src/components/admin/LogoCoverSection.tsx`, once nothing imports it.

**Interfaces:**
- Consumes: Task 3's loader data; Task 5's `ProfileHeaderPreview` and callbacks; Task 4's `wide`.
- Produces: `LogoPhotosCoverSection(props: { draft: MemberDraftBundle; assets: MediaAssetRow[]; uploadTokens: UploadTokenRow[]; pending: MediaAssetRow[]; canEditLogoAndCover: boolean; peopleHref: string | null; showSocialImage: boolean })`.

- [ ] **Step 1: Write the failing test**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PngHelpNote } from "./PngHelpNote";

describe("PngHelpNote", () => {
  it("points to Canva's background remover in a new tab", () => {
    const html = renderToStaticMarkup(createElement(PngHelpNote));
    expect(html).toContain("You don&#x27;t have a PNG format?");
    expect(html).toContain('href="https://www.canva.com/features/background-remover/"');
    expect(html).toContain('target="_blank"');
  });
});
```

  Also add a test that the section hides Logo and Cover for a Photos & events editor. Render the pure `logoPhotosCoverParts(canEditLogoAndCover)` helper, exported from `LogoPhotosCoverSection.tsx`:

```ts
import { logoPhotosCoverParts } from "./LogoPhotosCoverSection";
it("a Photos & events editor gets Gallery and Carousel only", () => {
  expect(logoPhotosCoverParts(false)).toEqual(["gallery", "carousel"]);
  expect(logoPhotosCoverParts(true)).toEqual(["logo", "gallery", "carousel", "cover"]);
});
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement.**
  - `PngHelpNote.tsx`: the `#FCF3EA` box with a brand-colored (i) and this text: "**You don't have a PNG format?** Get it converted now with [Canva's Background Removal tool](https://www.canva.com/features/background-remover/). Download the result as a PNG, then upload it here." The link gets `target="_blank" rel="noopener"`.
  - `LogoPhotosCoverSection.tsx`:
    - export `logoPhotosCoverParts(canEditLogoAndCover)`;
    - the component renders its parts in that order, each under its artboard heading ("1 · Logo", "2 · Gallery", "3 · Carousel", "4 · Cover photo"), numbered from 1 among the parts shown;
    - it holds preview state, initialized from props, and renders `ProfileHeaderPreview` in a right column (`lg:sticky lg:top-6 lg:w-[360px]`) on large screens and below the editor on small ones.
  - The parts, using the existing components unchanged apart from Task 5's callbacks:
    - **logo:**
      - inside the white card, the `LogoUploader` (`onPreviewChange`);
      - then `<PngHelpNote />`, placed above the Logo background choice per the owner's comment. If `LogoUploader` renders the background choice itself, add a `belowUpload?: ReactNode` slot to `LogoUploader`, rendered between the upload row and the background choice, and pass the note there.
    - **gallery:**
      - the line "Everything you upload lands here first. Your slides and cover are picked from it.";
      - `MediaGallery`;
      - `CameraRollHint peopleHref={peopleHref}`;
      - `CreatorLinkPanel` plus `ReviewTray`.
    - **carousel:**
      - the line "Up to four slides that visitors swipe through. Lead with your best one. Tall (portrait) photos work best.";
      - `CarouselEditor` (`onPreviewChange`).
    - **cover:**
      - the line "The wide band across the top of your page (5:2). For example, your Facebook cover photo.";
      - `CoverEditor` (`onPreviewChange`).
    - **then:**
      - `SocialImageEditor` when `showSocialImage`;
      - the save note.
  - **Wizard** (`LogoCoverStep` in `SectionSteps.tsx`):

```tsx
export function LogoCoverStep({ data }: { data: Extract<SetupStepData, { step: "logo-cover" }> }) {
  return (
    <WizardStep
      step="logo-cover"
      wide
      title="Logo, Photos & Cover"
      lede="Your logo, the photos for your page, and the wide cover across the top. Start with the gallery: your slides and cover are picked from it."
      backTo="basics"
      skipNote="Not ready? Skip it. Without a cover, your theme color fills the band. You can add everything later."
    >
      <LogoPhotosCoverSection
        draft={data.draft} assets={data.assets} uploadTokens={data.uploadTokens} pending={data.pending}
        canEditLogoAndCover peopleHref={null} showSocialImage={false}
      />
    </WizardStep>
  );
}
```

    Update `SetupStepView` to pass `data={data}`.
  - **Portal:** the `logo-cover` case renders a `SectionHeader` titled "Logo, Photos & Cover" with the same lede, then `{notice}`, then the section with:
    - `canEditLogoAndCover={shell.role !== "media_events"}`;
    - `peopleHref="/portal/people"`;
    - `showSocialImage={shell.role !== "media_events"}`.
  - **/admin:**
    - `admin.media.tsx` gets the heading "Logo, Photos & Cover" and renders the section with `canEditLogoAndCover`, `peopleHref="/portal/people"` and `showSocialImage`. Remove its separate Carousel, Cover, CreatorLink and SocialImage blocks, because the section has them now. Load `uploadTokens` and `pending` as it does today.
    - `admin.basics.tsx` drops the `logo={<LogoUploader…/>}` prop.
    - `AdminShell` sets the nav item to `{ to: "/admin/media", label: "Logo, Photos & Cover", short: "Photos", match: ["/admin/media"] }`.

- [ ] **Step 4: Run and check by eye.**
  - Run `npm run test` and `npm run build` → PASS.
  - Then `npm run dev`. Sign in as a test producer on the local dev server, using the same method as before: generate a magic link with the service key into `.playwright-mcp/` (gitignored), then delete the session.
  - Open `/portal/setup/logo-cover` at 1280px and at 390px.
  - Compare against `W04e`, `W04` and `W04p`: the preview sits on the right at 1280px and at the bottom at 390px, and the PNG note sits above Logo background.

- [ ] **Step 5: Commit** `git commit -am "feat: Logo, Photos & Cover page (wizard step 4, portal, /admin) with live preview and Canva note"`

---

### Task 7: Copy and Back changes on the other steps

**Files:**
- Modify:
  - `src/components/portal/setup/IntroSteps.tsx`
  - `src/components/portal/setup/SectionSteps.tsx`
  - `src/components/portal/setup/FinishSteps.tsx`
  - `src/components/admin/BasicsForm.tsx` (one hint)
- Test: `src/components/portal/setup/copy.test.ts` (new)

**Interfaces:**
- Produces: `welcomeHandyItems(memberType: MemberType): { title: string; body: string }[]`, exported from `IntroSteps.tsx` so it can be tested.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { welcomeHandyItems } from "./IntroSteps";

describe("Welcome copy (redesign)", () => {
  it("the logo item points to step 4's PNG help and photos accept JPG or PNG", () => {
    const items = welcomeHandyItems("producer");
    expect(items[0].body).toContain("No PNG? You can get one made for free; step 4 shows you how.");
    expect(items[1].body.startsWith("JPG or PNG.")).toBe(true);
  });
  it("Allied Members also see the member discount item", () => {
    expect(welcomeHandyItems("allied").map((i) => i.title)).toContain("Your member discount");
  });
});
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement.** Each change matches the artboards:
  - **Welcome:**
    - pull the `handy` array into `welcomeHandyItems(memberType)`;
    - the logo body becomes "Ideally with a transparent background and at least 400px tall. No PNG? You can get one made for free; step 4 shows you how.";
    - the photos body becomes "JPG or PNG. Up to four for the slides on your page (tall photos work best), and a wide one for your cover."
  - **Confirm type** (`ConfirmTypeStep`), when `shell.typeConfirmed` is true:
    - render the type card;
    - render `WizardInfoBox` "Your type is confirmed and locked. If it ever needs to change, use Request a type change in your portal.";
    - Continue (no `hideContinue`) goes to `basics`;
    - Back goes to welcome;
    - otherwise, the current screen.
  - **The basics:**
    - `backTo="type"`;
    - the type info box reads "Your member type is set by the Guild. It decides which sections appear on your public page. If it's wrong, use **Request a type change** in your portal later." This is in `BasicsForm` where `typeConfirmed` renders it; change only that string.
  - **BasicsForm, Mobile phone hint:** "Shown on your profile as a tap-to-call link. More booking links can go in the Links step." (Ruling.)
  - **Events:**
    - the lede depends on the type. Producer: "Trivia nights, releases, open houses. Connect a calendar (only the events you tag come in) or add them by hand." Allied: "Tastings, open houses, workshops. Connect a calendar (only the events you tag come in) or add them by hand.";
    - remove the now-unused `backTo={null}` comment on `LogoCoverStep`. It's already replaced in Task 6.
  - **Theme:** title "Pick your theme".
  - **You're live:**
    - `backTo="review"`, replacing `null`;
    - update the header comments that say Back is hidden.

- [ ] **Step 4: Run** `npm run test` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(wizard): redesign copy; Back on The basics, Confirm type (locked view) and You're live"`

---

### Task 8: Theme picker fixes

**Files:**
- Modify: `src/components/admin/ThemePicker.tsx`
- Test: `src/components/admin/ThemePicker.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker layout", () => {
  const html = renderToStaticMarkup(
    createElement(ThemePicker, { memberId: "m", currentTheme: "teal", businessName: "Sample Brewing Co.", city: "Riverside", state: "CA", tagline: null, showHeading: false }),
  );
  it("the theme grid adapts to its container instead of a fixed 4 columns", () => {
    expect(html).toContain("@container");
    expect(html).toContain("@[22rem]:grid-cols-4");
  });
  it("the preview's name is never pulled up into the cover band", () => {
    expect(html).not.toContain("-mt-6 flex items-end");
  });
});
```

  If `ThemePicker` needs a router context to render, wrap the render the same way the existing component tests do. If none needs it, mock `@tanstack/react-router` with `vi.mock` returning `useRouter: () => ({ invalidate: async () => {} })`.

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement.**
  - Wrap the fieldset's parent in `@container`, and change the grid to `grid min-w-0 grid-cols-2 gap-3 border-0 p-0 @[22rem]:grid-cols-4` (Ruling).
  - Add `min-w-0` to the label span, so a long name wraps instead of being cut.
  - In the preview:

```tsx
              <div className="flex items-start gap-2.5">
                <div className="-mt-6 flex size-14 shrink-0 items-center justify-center rounded-[13px] border-[3px] border-canvas bg-white font-display text-lg font-bold text-ink-subtle">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col gap-[3px] pt-2">
```

    Only the logo tile overlaps the band. The name starts below it.

- [ ] **Step 4: Run** the tests → PASS. Then check the wizard step at 1280px and 390px: all eight names show in full, and the name sits below the band.
- [ ] **Step 5: Commit** `git commit -am "fix(theme): full theme names; preview name no longer overlaps the cover"`

---

### Task 9: Food wording and the "We have our own kitchen" switch

**Files:**
- Create:
  - `supabase/migrations/20261003100000_member_has_kitchen.sql`
  - `supabase/tests/has_kitchen.test.sql`
- Modify:
  - `src/lib/events/food-week.ts` (+ test)
  - `src/components/profile/FoodCalendarModule.tsx`
  - `src/lib/members/profile-object.ts`
  - `src/lib/members/member-profile.server.ts` (only if the member row isn't `select *`)
  - `src/lib/supabase/types.ts` (`MemberRow.has_kitchen: boolean`)
  - `src/lib/portal/section-data.server.ts` (`FoodCalendarData.hasKitchen`)
  - `src/lib/events/calendar-connection.server.ts` (new server fn)
  - `src/components/admin/FoodCalendarSection.tsx`
  - `src/components/admin/CalendarConnectionPanel.tsx` (`COPY.food.hint`)

**Interfaces:**
- Produces:
  - SQL function `public.set_member_has_kitchen(p_member_id uuid, p_has_kitchen boolean) returns boolean`;
  - server fn `setMemberHasKitchen({ memberId, hasKitchen })`;
  - `buildFoodWeek({ ..., hasKitchen?: boolean })` gives day status `"kitchen"` for an open day with no listing when `hasKitchen` is true.

- [ ] **Step 1: Write the failing tests.**
  - Vitest, in `food-week.test.ts`:

```ts
it("with our own kitchen, an open day with nothing listed is 'kitchen', closed still wins, listings still win", () => {
  const week = buildFoodWeek({ ...fixture, hasKitchen: true }); // use the file's existing fixture with one closed day and one vendor day
  expect(week.find((d) => d.date === fixture.closedDate)?.status).toBe("closed");
  expect(week.find((d) => d.date === fixture.vendorDate)?.status).toBe("vendors");
  expect(week.find((d) => d.date === fixture.emptyOpenDate)?.status).toBe("kitchen");
});
it("without the switch, the same day stays 'byo'", () => {
  expect(buildFoodWeek({ ...fixture }).find((d) => d.date === fixture.emptyOpenDate)?.status).toBe("byo");
});
```

    If the file has no shared fixture, build one inline the way its existing tests do: hours with Monday closed, one food slot, and a `now` on a known date.
  - pgTAP, in `has_kitchen.test.sql`. Use the existing `_fixtures.psql` users and members (owner f0..01 owns producer f1..01; f0..04 is a Guild admin), with `plan(5)`:
    - the column exists and defaults to false;
    - the owner calls `set_member_has_kitchen(...true)` → `members.has_kitchen` is true;
    - a Photos & events editor or a stranger → throws 42501;
    - a Guild admin → lives_ok;
    - for a non-producer member → throws 22023 ("Only producers have a kitchen switch.").

- [ ] **Step 2: Run them** → FAIL (`npx vitest run src/lib/events/food-week.test.ts`; `npm run test:db`).

- [ ] **Step 3: Implement.**
  - Migration:

```sql
-- "We have our own kitchen" (owner, 2026-10-02): a producer's switch on the
-- Food section. On, an open day with nothing tagged #food reads "Kitchen
-- open" instead of "Bring your own food". Not drafted (like the food
-- calendar it belongs to): it changes straight away. Members can't write
-- `members` directly (20260925210100), so it goes through this function.
alter table public.members add column has_kitchen boolean not null default false;

create or replace function public.set_member_has_kitchen(p_member_id uuid, p_has_kitchen boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.member_type;
begin
  if not (coalesce(public.member_role(p_member_id) = 'owner', false) or public.is_guild_admin()) then
    raise exception 'Only the profile''s owner can change this.' using errcode = '42501';
  end if;
  select member_type into v_type from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if v_type <> 'producer' then
    raise exception 'Only producers have a kitchen switch.' using errcode = '22023';
  end if;
  update public.members set has_kitchen = coalesce(p_has_kitchen, false) where id = p_member_id;
  return coalesce(p_has_kitchen, false);
end;
$$;

revoke execute on function public.set_member_has_kitchen(uuid, boolean) from public, anon;
grant execute on function public.set_member_has_kitchen(uuid, boolean) to authenticated;
```

    If the member type enum isn't named `public.member_type`, use `text` and compare with `'producer'`. Check `members.member_type` in `20260922034558_members_table.sql`.
    - Before pushing: `npx supabase db push --dry-run`. Tell the owner it adds one column (default false) and one function and changes no existing rows. Then `npx supabase db push`.
  - `food-week.ts`:
    - add `"kitchen"` to `FoodDay["status"]` and document it;
    - add `hasKitchen?: boolean` to the params;
    - the status becomes `vendors.length ? "vendors" : isClosedOnDate(...) ? "closed" : params.hasKitchen ? "kitchen" : "byo"`.
  - `FoodCalendarModule`:
    - takes `hasKitchen?: boolean` and passes it to `buildFoodWeek`;
    - an empty row reads `day.status === "closed" ? "Closed" : day.status === "kitchen" ? "Kitchen open" : "Bring your own food"`.
  - Wire `hasKitchen` through to both callers:
    - in `profile-object.ts`, add `hasKitchen: member.member_type === "producer" && member.has_kitchen === true` to the profile object; `MemberProfileTemplate` passes `hasKitchen={data.hasKitchen}`;
    - `FoodCalendarData` gets `hasKitchen: boolean`, read from `members.has_kitchen` in `loadFoodCalendar`, and `FoodCalendarSection` passes it.
  - Server fn, in `calendar-connection.server.ts`, matching the other server fns there:

```ts
export const setMemberHasKitchen = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; hasKitchen: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.rpc("set_member_has_kitchen", {
      p_member_id: data.memberId,
      p_has_kitchen: data.hasKitchen === true,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
```

  - `FoodCalendarSection`:
    - the intro becomes "Show what there is to eat at your taproom over the next 7 days: visiting food trucks and pop-ups, and your own kitchen's specials. Tag each one **#food** on your events calendar. Changes show on your page right away.";
    - under it, a switch card (`role="switch"`, `aria-checked`), shown only when `canEdit`. Title "We have our own kitchen", hint 'On an open day with nothing tagged #food, your profile says "Kitchen open" instead of "Bring your own food".' It's optimistic: on failure it rolls back and shows the error text. After saving, call `router.invalidate()`, so the 7-day preview updates;
    - keep the "If your Events calendar isn't set up yet…" line and the events video link after the switch, per the artboard;
    - the food video label becomes "Watch how to connect a Google Calendar for FOOD".
  - `COPY.food.hint` becomes: 'Use the same calendar link as your Events page. Tag each food listing #food: a visiting vendor's name, or your own special (for example "Brisket Tuesday"), in the title, and a menu or Instagram link in the description. Your profile shows the next 7 days; a day with nothing listed says "Bring your own food" (or "Kitchen open" with the switch on), or "Closed" when your hours say you're closed.'
  - Update `ComputerOnlyNote`, food tests and any snapshot strings that break.

- [ ] **Step 4: Run** `npm run test` and `npm run test:db` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(food): 'We have our own kitchen' switch shows 'Kitchen open'; Food wording covers kitchen specials"`

---

### Task 10: Docs, canvases and the food video

**Files:**
- Modify:
  - `docs/member-profiles.md`
  - `docs/design/README.md`
  - `docs/design/onboarding/README.md`
  - `docs/design/onboarding/ScreenMap.dc.html` (`Main.dc.html` on the canvas)
  - `docs/design/artboards/*` as needed
  - `videos/google-food-calendar/SCRIPT.md`
  - `videos/google-food-calendar/build/build.py`
  - `src/data/help-videos.ts` (duration, if it changes)
  - `docs/go-live-checklist.md`

- [ ] **Step 1: Spec doc.** In `docs/member-profiles.md`, section "Setup wizard, member portal and drafts", record:
  - the new step order and counts (8, 7, 9);
  - Back on every screen, and the rule that steps stay open after setup;
  - the merged Logo, Photos & Cover page and the Photos & events editor's view of it;
  - the type tag;
  - "Pick your theme";
  - the kitchen switch (also under "Events" > "Food calendar").

  In `docs/design/README.md`, add one decision line dated 2026-10-02.
- [ ] **Step 2: Onboarding canvas.**
  - Read the live canvas first (Artifact read).
  - Update `Main.dc.html` (the screen map) to the new order: step 4 "Logo, Photos & Cover", no Photos step, the counts.
  - Turn the orange `wn5` sticky into a green "DONE" note.
  - Publish only the changed files, plus `canvas.json` if notes change. Mirror both into the repo.
- [ ] **Step 3: Main canvas** (https://claude.ai/artifact/9YttpbrWTxgAkc145whpGf).
  - Read it live first.
  - The portal menus on artboards Q, U, W, Y and M: "Logo & cover" and "Photos" become one "Logo, Photos & Cover" item.
  - Artboard M2 (`AdminFood`): the new intro and the kitchen switch.
  - Artboard D (`TaproomProfile`): one food row reads "Kitchen open".
  - Publish and mirror into `docs/design/artboards/`.
- [ ] **Step 4: Food video.**
  - Add one line to scene 5 of `SCRIPT.md`: "Have your own kitchen? Tag your specials #food too, and turn on 'We have our own kitchen'."
  - Re-voice with `build/eleven_tts.py`. The key comes from the Windows user environment variable `ELEVENLABS_API_KEY`, read through the registry and never printed. Voice "My Voice v3", `eleven_multilingual_v2`, same settings.
  - Then run `python build/build.py`, `npx hyperframes@0.8.86 lint`, `check`, and `render -o renders/google-food-calendar.mp4 -f 30 -q delivery --quiet`.
  - Show the owner a snapshot of the changed scene before rendering.
  - Update `HELP_VIDEOS.googleFoodCalendar.duration` if the length changes.
  - **Owner action:** replace the video on livid.com (watch page `v5XYPWwgyFVb`).
- [ ] **Step 5: Go-live checklist.** Add:
  - "Wizard redesign on staging: owner walkthrough per type";
  - "Replace the food video on livid".
- [ ] **Step 6: Commit and push.**

---

### Task 11: Sample members and the new guide

**Files:**
- Create: `scripts/sample-members.mjs` (idempotent: creates or refreshes the three sample members, never publishes them)
- Modify:
  - `docs/member-guide/member-profile-guide.html`
  - `docs/member-guide/screens/*` (replace all)
  - `docs/member-guide/ISC-Brewers-Guild-Member-Profile-Guide.pdf`

- [ ] **Step 1: Sample members.**
  - The script uses the service role from `.dev.vars` (never printed).
  - It creates three auth users: `boblelle77+sample-producer@gmail.com`, `+sample-mobile` and `+sample-allied`.
  - It creates a member for each, with `status = 'draft'`, never published, so they stay off the directory, map and carousel:
    - "Sample Brewing Co." (producer, Riverside, CA);
    - "Sample Taco Truck" (mobile);
    - "Sample Supply Co." (allied, Ontario, CA).
  - Each owner gets a `member_users` row.
  - It fills each draft with the artboards' sample data:
    - the tagline, address, phone (555 numbers), links and discount;
    - producer hours with Monday closed, plus a 12/25 special day closed with the note "Closed for Christmas Day".
  - It uploads the five Guild-site photos (`src/assets/hero-about.jpg`, `hero-home.jpg`, `pillar-education.jpg`, `pillar-events.jpg`, `event-featured.jpg`) to the producer's gallery, plus a simple PNG logo, through the same storage paths the app uses. Read `src/lib/media/*` for the bucket names.
  - Before running it, tell the owner exactly what it creates in the shared database and get a yes.
  - **Before Step 3:** confirm by query that none of the three is `published`.
- [ ] **Step 2: Screenshots.**
  - Sign each sample member in directly, the same way as before (magic-link hash → cookie, in `.playwright-mcp/`).
  - Capture every wizard step at 1280px wide. Set the viewport to the page height, so the sticky bar sits at the bottom.
  - Each step that differs by type gets one shot per type.
  - Crop to the content column, or wider for step 4.
  - Revoke the sessions, and put any test account's state back if the walkthrough changed it.
- [ ] **Step 3: Guide HTML.**
  - **Page 1:** the owner's "Good to know" list, verbatim from the spec, section 5, then "How to sign in". Both full width, stacked.
  - **Checklist:**
    - renumber to the new steps: step 4 becomes "Logo, Photos & Cover", taking the old Photos items; then hours (5), events (6), links (7), discount (8), theme (9 "Pick your theme");
    - the Food item mentions kitchen specials and the switch.
  - **Wizard map page:** renumber to the new steps, and use the new counts (8, 7, 9).
  - **Screens section:**
    - one step at a time, with the screenshot on top and notes under it;
    - a large type tag above each screenshot (the same colors as `MemberTypeTag`), or "All members";
    - try a side-by-side layout for one step; if it reads better, use it throughout, and tell the owner which you chose.
- [ ] **Step 4: Build the PDF.**
  - Edge headless with a fresh `--user-data-dir`, from the `docs/member-guide` folder.
  - Then open the PDF with PyMuPDF and check:
    - no page is nearly empty;
    - the page count is reasonable;
    - each step's tag and screenshot sit on the same page.
- [ ] **Step 5: Commit and push.**

---

### Task 12: Final verification and handoff

- [ ] **Step 1: Run the checks:**
  - `npm run test`
  - `npm run test:db`
  - `npm run build`
  - `npx tsc --noEmit` (only the two known errors)
  - the server-fn check (`missing=0`)
- [ ] **Step 2:** Push to `staging`. Once Cloudflare's staging build finishes, open `https://ie-brewers-guild-staging.boblelle77.workers.dev`, signed in as each sample member (a private window per account), and walk each type's wizard against the artboards.
- [ ] **Step 3: Owner handoff.** Tell the owner:
  - what to check per type;
  - that the food video needs replacing on livid;
  - that the merge to `main` still waits for their explicit go, per the go-live checklist.
