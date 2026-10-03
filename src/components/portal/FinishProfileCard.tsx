import { Link } from "@tanstack/react-router";
import type { SectionCompleteness } from "@/lib/portal/section-completeness";
import { sectionForCompletenessStep } from "@/lib/portal/portal-sections";
import type { MemberType } from "@/lib/supabase/types";

/**
 * "Finish your profile" (docs/member-profiles.md: after setup, the portal
 * shows a card listing the empty sections, each linking to its portal
 * section; it disappears once nothing is empty). The list comes from
 * sectionCompleteness -- the same function as the wizard's Review -- run
 * on the server for every page load, so it follows the draft as it fills.
 */
export function FinishProfileCard({
  sections,
  memberType,
}: {
  sections: SectionCompleteness[];
  memberType: MemberType;
}) {
  if (sections.length === 0) return null;
  const count = sections.length;
  return (
    <section
      aria-labelledby="finish-profile-heading"
      className="flex flex-col gap-3 rounded-[14px] border border-canvas-border bg-white px-5 py-4 md:px-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="finish-profile-heading" className="font-sans text-base font-semibold text-ink">
          Finish your profile · {count} {count === 1 ? "section" : "sections"} empty
        </h2>
        <p className="text-[13px] text-ink-muted">
          Fill {count === 1 ? "it" : "these"} in when you're ready. This card goes away once
          everything has something in it.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {sections.map((item) => {
          const target = sectionForCompletenessStep(item.step, memberType);
          return (
            <li key={item.step}>
              <Link
                to="/portal/$section"
                params={{ section: target.section }}
                hash={target.hash}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[9px] border border-canvas-border bg-canvas px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2"
              >
                {item.label}
                <span aria-hidden="true" className="text-brand">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
