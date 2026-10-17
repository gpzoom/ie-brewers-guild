import { memberGuidePath } from "@/lib/member-guide";
import type { MemberType } from "@/lib/supabase/types";
import { sidebarItemClass } from "@/components/shell/AppChrome";

/** The portal sidebar's "Member Guide" for this member's type (under the sections, above Sign out). */
export function MemberGuideSidebarLink({ memberType }: { memberType: MemberType }) {
  return (
    <a href={memberGuidePath(memberType)} target="_blank" rel="noopener" className={sidebarItemClass(false)}>
      <span className="md:hidden">Guide</span>
      <span className="hidden md:inline">Member Guide (PDF)</span>
    </a>
  );
}

/**
 * Setup step 1 (Welcome), in the lede right after its first sentence, at the lede's
 * own size (owner, 2026-10-02: more prominent than a note under the list).
 */
export function MemberGuideNote({ memberType }: { memberType: MemberType }) {
  return (
    <p className="m-0 mt-2">
      Want to see every step first?{" "}
      <a
        href={memberGuidePath(memberType)}
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
