import { createContext, useContext, type ReactNode } from "react";
import type { ViewerRole } from "@/lib/drafts/sections";
import type { MemberType } from "@/lib/supabase/types";

/**
 * Who and what is being edited, for the editor components -- so they work
 * the same under /admin and under /portal (the setup wizard now, the
 * portal sections in phase 5) without reaching into either route's loader.
 *
 * Each surface's layout provides it from its own server-resolved session:
 * /admin from requireMemberSession, /portal/setup from requirePortalMember.
 * It only steers what the UI shows (the save note's wording, where "Edit on
 * Basics & hours" points); it grants nothing -- every save still goes
 * through the draft functions, which check the caller's role in SQL.
 */

/** A place in the current surface an editor can link to. */
export type EditingLink = { to: string; hash?: string };

export type MemberEditingValue = {
  memberId: string;
  memberName: string | null;
  /** Live (not drafted) member type. */
  memberType: MemberType;
  role: ViewerRole | null;
  isImpersonating: boolean;
  /** The member's live status is "published". */
  isPublished: boolean;
  slug: string;
  surface: "admin" | "portal";
  /**
   * Where cross-section links go on this surface; null hides the link
   * (e.g. the wizard has no Basics page to send someone back to once
   * setup is done).
   */
  paths: {
    basics: EditingLink | null;
    hours: EditingLink | null;
    events: EditingLink | null;
  };
};

const MemberEditingContext = createContext<MemberEditingValue | null>(null);

export function MemberEditingProvider({
  value,
  children,
}: {
  value: MemberEditingValue;
  children: ReactNode;
}) {
  return <MemberEditingContext.Provider value={value}>{children}</MemberEditingContext.Provider>;
}

export function useMemberEditing(): MemberEditingValue | null {
  return useContext(MemberEditingContext);
}

/** The /admin surface's links (unchanged from before the context existed). */
export const ADMIN_EDITING_PATHS: MemberEditingValue["paths"] = {
  basics: { to: "/admin/basics" },
  hours: { to: "/admin/basics", hash: "hours" },
  events: { to: "/admin/events" },
};
