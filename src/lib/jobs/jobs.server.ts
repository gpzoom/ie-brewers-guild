import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient, getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { JobPostingRow } from "@/lib/supabase/types";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { logoBackgroundColor } from "@/lib/members/logo-background";
import { validateJobInput, type JobInput, type PublicJob } from "@/lib/jobs/jobs";

/**
 * Jobs board (docs/member-profiles.md, "Jobs board"). Postings are ordinary
 * member content, like events: every save is live at once -- no draft, no
 * Publish, no Guild admin review. Writes use the caller's own session, so
 * RLS decides who may write (anyone linked to the member, or a Guild admin
 * editing as them, whose writes are audited below). The database sets
 * posted_at and expires_at itself (job_postings_set_dates).
 */

function checked(input: JobInput): JobInput {
  const result = validateJobInput(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function columns(value: JobInput) {
  return {
    title: value.title,
    employment_type: value.employmentType,
    location_text: value.locationText || null,
    description: value.description,
    how_to_apply: value.howToApply,
  };
}

/** The member's own postings, every state, newest first (artboard CC1's list). */
export const listMemberJobs = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: rows, error } = await supabase
      .from("job_postings")
      .select("*")
      .eq("member_id", data.memberId)
      .order("posted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as JobPostingRow[];
  });

export const createJob = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string } & JobInput) => data)
  .handler(async ({ data }) => {
    const value = checked(data);
    const supabase = await getSupabaseServerClientForRequest();
    // An INSERT that RLS refuses raises a real error (unlike UPDATE/DELETE).
    const { data: row, error } = await supabase
      .from("job_postings")
      .insert({ member_id: data.memberId, ...columns(value) })
      .select("*")
      .single();
    if (error)
      throw new Error("Couldn't post the job — you may not have permission for this member.");

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "job_postings",
      rowId: (row as JobPostingRow).id,
      action: "insert",
    });
    return row as JobPostingRow;
  });

/**
 * Every change to one posting. UPDATE/DELETE that RLS refuses report
 * success with zero rows, hence the row-count checks.
 */
async function updatePosting(id: string, patch: Record<string, unknown>): Promise<JobPostingRow> {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: rows, error } = await supabase
    .from("job_postings")
    .update(patch)
    .eq("id", id)
    .select("*");
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    throw new Error("Save failed — you may not have permission to edit this posting.");
  }
  const row = rows[0] as JobPostingRow;
  await recordAuditLogIfImpersonating({
    memberId: row.member_id,
    tableName: "job_postings",
    rowId: id,
    action: "update",
  });
  return row;
}

export const updateJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string } & JobInput) => data)
  .handler(async ({ data }) => updatePosting(data.id, columns(checked(data))));

export const markJobFilled = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => updatePosting(data.id, { status: "filled" }));

/**
 * Repost: the same row, open again for another 60 days. Sending new dates
 * is the signal; the trigger replaces them with the server's now / now + 60.
 */
export const repostJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    return updatePosting(data.id, { status: "open", posted_at: now, expires_at: now });
  });

export const deleteJob = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: rows, error } = await supabase
      .from("job_postings")
      .delete()
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("Delete failed — you may not have permission to delete this posting.");
    }
    await recordAuditLogIfImpersonating({
      memberId: rows[0].member_id as string,
      tableName: "job_postings",
      rowId: data.id,
      action: "delete",
    });
    return { ok: true as const };
  });

type PublicJobRow = Pick<
  JobPostingRow,
  | "id"
  | "title"
  | "employment_type"
  | "location_text"
  | "description"
  | "how_to_apply"
  | "posted_at"
  | "expires_at"
> & {
  members: {
    business_name: string;
    slug: string;
    city: string | null;
    state: string | null;
    member_type: string;
    theme: MemberThemeName | null;
    logo_background: string | null;
  } | null;
};

/**
 * The public board, newest first. Read with the ANON client, whoever is
 * signed in, so a member sees exactly what visitors see (RLS: open,
 * unexpired, published members). The filters repeat RLS on purpose.
 */
export const listPublicJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicJob[]> => {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("job_postings")
      .select(
        "id, title, employment_type, location_text, description, how_to_apply, posted_at, expires_at, members!inner(business_name, slug, city, state, member_type, theme, logo_background)",
      )
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .eq("members.status", "published")
      .order("posted_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Couldn't load the jobs board.");
    return ((data ?? []) as unknown as PublicJobRow[]).flatMap((row) => {
      const m = row.members;
      if (!m) return [];
      const theme = (m.theme ?? "amber") as MemberThemeName;
      const tileColor = logoBackgroundColor(m.logo_background, theme);
      return [
        {
          id: row.id,
          title: row.title,
          employmentType: row.employment_type,
          locationText: row.location_text,
          description: row.description,
          howToApply: row.how_to_apply,
          postedAt: row.posted_at,
          expiresAt: row.expires_at,
          member: {
            name: m.business_name,
            slug: m.slug,
            city: m.city,
            state: m.state,
            isAffiliate: m.member_type === "allied",
            tileColor,
            // Theme letters on a white tile; white letters on a dark or theme tile.
            markColor: tileColor === "#FFFFFF" ? getMemberThemeHex(theme) : "#FFFFFF",
          },
        },
      ];
    });
  },
);
