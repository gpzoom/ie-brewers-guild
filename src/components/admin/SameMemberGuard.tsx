import { Fragment, type ReactNode } from "react";

/**
 * Renders an editor only when the data it was given belongs to the member
 * being edited, and remounts it whenever that member changes.
 *
 * Every member shares the same editor URLs (/admin/basics, ...), so without
 * this a page could briefly render one member's loaded data while the
 * session is editing another -- and because the editors copy their props
 * into local state and autosave, a keystroke there could write the first
 * member's values into the second member's draft (seen on staging,
 * 2026-09-26: "Edit as them" on Carbon Nation showed Hangar 24's basics).
 * Mismatched data shows a loading line instead; the fresh load replaces it.
 */
export function SameMemberGuard({
  memberId,
  dataMemberId,
  children,
}: {
  /** The member the session is editing (route context). */
  memberId: string;
  /** The member the loaded data belongs to. */
  dataMemberId: string;
  children: ReactNode;
}) {
  if (dataMemberId !== memberId) {
    return (
      <p role="status" className="text-[13px] text-ink-muted">
        Loading this member's profile…
      </p>
    );
  }
  return <Fragment key={dataMemberId}>{children}</Fragment>;
}
