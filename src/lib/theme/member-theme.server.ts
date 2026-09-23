import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberThemeName } from "@/lib/theme/member-themes";

/**
 * `.select("id")` + a row-count check -- PostgREST reports an RLS-denied
 * update as success with zero rows affected, not as an `error` (same
 * gotcha member-basics.server.ts's updateMemberBasics / cover.server.ts's
 * updateCoverAsset/updateCoverCrop already guard against). Without this, a
 * write blocked by RLS would silently report success back to ThemePicker's
 * optimistic UI, leaving a swatch shown as selected when nothing was
 * actually saved.
 */
export const updateMemberTheme = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; theme: MemberThemeName }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ theme: data.theme })
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }
    return { ok: true as const };
  });
