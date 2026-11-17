import { forwardRef } from "react";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";
import { NoticeBox, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { LegalNotice } from "@/components/site/LegalNotice";
import type { MemberProfileData } from "@/lib/members/profile-object";

/** True when the preview shows anything that came from Google (so "Powered by Google" is owed). */
export function previewUsesGoogle(data: MemberProfileData, placeIdChosen: boolean): boolean {
  if (!placeIdChosen) return false;
  const m = data.member;
  return Boolean(m.phone || m.street_address || m.tagline || data.hours.length > 0 || data.links.length > 0);
}

/**
 * Step 3 of /join: the applicant's Guild profile as it would look, with a
 * banner saying nothing is public yet, and the submit button.
 */
export const JoinPreview = forwardRef<
  HTMLHeadingElement,
  {
    data: MemberProfileData;
    showGoogleCredit: boolean;
    submitting: boolean;
    error: string | null;
    onSubmit: () => void;
    onBack: () => void;
  }
>(function JoinPreview({ data, showGoogleCredit, submitting, error, onSubmit, onBack }, headingRef) {
  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto w-full max-w-[1168px] px-2.5 md:px-6">
        <div className="flex flex-col gap-2 rounded-[14px] bg-canvas p-4 text-ink" role="status">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[20px] font-bold normal-case leading-[1.15] text-ink focus:outline-none"
          >
            This is a preview — nothing is public yet.
          </h2>
          <p className="text-[15px] leading-[1.55] text-ink-muted">
            Here is how your Guild profile could look. Happy with it? Submit to the Guild and we will take it from there.
          </p>
        </div>
      </div>

      <MemberProfileTemplate data={data} search={{}} mediaMode="preview" hideVisitorControls />

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-2.5 pb-16 sm:px-6">
        {error && (
          <div className="rounded-[14px] bg-canvas p-3">
            <NoticeBox tone="danger">{error}</NoticeBox>
          </div>
        )}
        <button type="button" onClick={onSubmit} disabled={submitting} aria-busy={submitting} className={primaryButtonClass}>
          {submitting ? "Submitting…" : "Submit to the Guild"}
        </button>
        <LegalNotice action="submitting" className="text-center text-[12px] leading-[1.45] text-[#B6AC9D]" />
        <button type="button" onClick={onBack} disabled={submitting} className={secondaryButtonClass}>
          Go back and change something
        </button>
        {showGoogleCredit && <p className="text-center text-xs text-[#B6AC9D]">Powered by Google</p>}
      </div>
    </div>
  );
});
