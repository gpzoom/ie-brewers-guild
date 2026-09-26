import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requirePortalMember } from "@/lib/portal/portal-session.server";
import { loadPublishGateData, type PublishGateData } from "@/lib/hours/publish-gate.server";
import { loadMemberPreviewData } from "@/lib/members/member-profile.server";
import {
  loadBasicsSection,
  loadCompletenessData,
  loadDiscountSection,
  loadDraftSection,
  loadEventsSection,
  loadLogoCoverSection,
  loadMemberShell,
  loadPhotosSection,
  type PortalMemberShell,
} from "@/lib/portal/section-data.server";
import { emptySections, type SectionCompleteness } from "@/lib/portal/section-completeness";
import {
  canOpenPortalSection,
  isPortalSection,
  type PortalSection,
} from "@/lib/portal/portal-sections";
import { supabasePeopleStore } from "@/lib/portal/people-store.server";
import { loadPeople } from "@/lib/portal/people";

/**
 * The portal's server side (plan phase 5): /portal/[section] once setup is
 * done. Like the wizard, every function resolves the member from the
 * SESSION (requirePortalMember) -- the browser only ever names a section --
 * and reads through the signed-in session client, so RLS and the SQL
 * functions keep making the real permission decisions. Who may open which
 * section is decided by canOpenPortalSection (portal-sections.ts), here and
 * in the routes.
 */

export type PortalShell = PortalMemberShell & {
  publishGate: PublishGateData;
  membershipCount: number;
  /**
   * The "Finish your profile" card: the sections still empty, for the owner
   * and full editors; null for a Photos & events editor, who can't fill
   * most of them.
   */
  emptySections: SectionCompleteness[] | null;
};

/**
 * The portal layout's beforeLoad. While setup isn't done, an owner or full
 * editor goes back to /portal, which sends them into the wizard; a Photos &
 * events editor always gets the portal (never the wizard).
 */
export const getPortalShell = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortalShell> => {
    const member = await requirePortalMember();
    if (member.role !== "media_events" && member.destination.kind === "wizard") {
      throw redirect({ href: "/portal" });
    }
    const supabase = await getSupabaseServerClientForRequest();
    const [shell, publishGate, completeness] = await Promise.all([
      loadMemberShell(supabase, member),
      loadPublishGateData(supabase, member.memberId),
      member.role === "media_events"
        ? Promise.resolve(null)
        : loadCompletenessData(supabase, member.memberId),
    ]);
    return {
      ...shell,
      publishGate,
      membershipCount: member.membershipCount,
      emptySections: completeness
        ? emptySections(completeness.draft.data, {
            memberType: shell.memberType,
            typeConfirmed: shell.typeConfirmed,
            eventCount: completeness.eventCount,
            hasCalendarConnection: completeness.hasCalendarConnection,
          })
        : null,
    };
  },
);

/**
 * /portal/preview: the same draft preview as /admin/preview, for the member
 * resolved from the session. loadMemberPreviewData applies what the
 * viewer's role could publish (a Photos & events editor sees the live page
 * with only their photo changes).
 */
export const getPortalPreviewData = createServerFn({ method: "GET" }).handler(async () => {
  const member = await requirePortalMember();
  return loadMemberPreviewData(member.memberId);
});

type Loaded<T extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;

/** What one portal section's editors start from. */
export type PortalSectionData =
  | ({ section: "basics" } & Loaded<typeof loadBasicsSection>)
  | ({ section: "links" | "theme" } & Loaded<typeof loadDraftSection>)
  | ({ section: "logo-cover" } & Loaded<typeof loadLogoCoverSection>)
  | ({ section: "photos" } & Loaded<typeof loadPhotosSection>)
  | ({ section: "events" } & Loaded<typeof loadEventsSection>)
  | ({ section: "discount" } & Loaded<typeof loadDiscountSection>)
  | ({ section: "people" } & Loaded<typeof loadPeople>);

export const getPortalSectionData = createServerFn({ method: "GET" })
  .inputValidator((data: { section: string }) => {
    if (!isPortalSection(data?.section)) throw new Error("Unknown portal section.");
    return { section: data.section as PortalSection };
  })
  .handler(async ({ data }): Promise<PortalSectionData> => {
    const member = await requirePortalMember();
    const supabase = await getSupabaseServerClientForRequest();
    const id = member.memberId;

    const { data: row, error } = await supabase
      .from("members")
      .select("member_type")
      .eq("id", id)
      .single();
    if (error || !row) throw new Error("Member not found.");
    if (!canOpenPortalSection(data.section, { role: member.role, memberType: row.member_type })) {
      throw new Error("You don't have access to that section.");
    }

    switch (data.section) {
      case "basics":
        return {
          section: "basics",
          ...(await loadBasicsSection(supabase, await getSupabaseServiceRoleClient(), member)),
        };
      case "links":
      case "theme":
        return { section: data.section, ...(await loadDraftSection(supabase, id)) };
      case "logo-cover":
        return { section: "logo-cover", ...(await loadLogoCoverSection(supabase, id)) };
      case "photos":
        return { section: "photos", ...(await loadPhotosSection(supabase, id)) };
      case "events":
        return { section: "events", ...(await loadEventsSection(supabase, id)) };
      case "discount":
        return { section: "discount", ...(await loadDiscountSection(supabase, id)) };
      case "people": {
        // canOpenPortalSection has already checked the caller is the owner
        // (or a Guild admin editing as them); only then the service client.
        const store = supabasePeopleStore(await getSupabaseServiceRoleClient());
        return { section: "people", ...(await loadPeople(store, id, member.userId)) };
      }
    }
  });
