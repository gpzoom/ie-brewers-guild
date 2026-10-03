import { MEMBER_GUIDE_PATH } from "@/lib/member-guide";
import { sidebarItemClass } from "@/components/shell/AppChrome";

/** The portal sidebar's "Member Guide" (under the sections, above Sign out). */
export function MemberGuideSidebarLink() {
  return (
    <a href={MEMBER_GUIDE_PATH} target="_blank" rel="noopener" className={sidebarItemClass(false)}>
      <span className="md:hidden">Guide</span>
      <span className="hidden md:inline">Member Guide (PDF)</span>
    </a>
  );
}

/** Setup step 1, under What to have handy: the step-by-step guide. */
export function MemberGuideNote() {
  return (
    <p className="m-0 text-[13px] leading-[1.5] text-ink-muted">
      Want to see every step first?{" "}
      <a
        href={MEMBER_GUIDE_PATH}
        target="_blank"
        rel="noopener"
        className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
      >
        Read the Member Guide (PDF)
      </a>
      , with a picture of each screen.
    </p>
  );
}
