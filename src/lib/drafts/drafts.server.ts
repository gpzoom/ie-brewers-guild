import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  readImpersonationState,
  touchImpersonationActivity,
} from "@/lib/guild/impersonation.server";
import {
  DRAFT_SECTIONS,
  computeTopBarState,
  isDraftSection,
  normalizeDraftData,
  normalizeSections,
  resolveViewerRole,
  shouldShowPhotoChangesFrom,
  type DraftSection,
  type MemberDraftData,
  type TopBarState,
  type ViewerRole,
} from "@/lib/drafts/sections";
import { validateDraftPatch } from "@/lib/drafts/validate-patch";
import type { MemberStatus, MemberType } from "@/lib/supabase/types";

/**
 * The member draft's server layer (plan phase 2). Every call goes through
 * the signed-in SESSION client, so inside the database functions
 * auth.uid() is the real caller -- the member, or the Guild admin's own id
 * while they "Edit as them" (is_guild_admin() gives them owner rights, and
 * the SQL functions write the audit rows against them). No service-role
 * client touches a draft; the only service-role use here is looking up the
 * email for the "Photo changes from ..." line.
 *
 * The functions themselves (supabase/migrations/20260925200800_member_
 * draft_functions.sql, 20260925210000_unpublish_member.sql) do the role
 * checks and validation; validateDraftPatch adds the friendlier rules the
 * old live editors had.
 */

type SessionClient = Awaited<ReturnType<typeof getSupabaseServerClientForRequest>>;

/** Postgres/PostgREST errors carry a message the functions wrote for people; pass it through. */
function toError(error: { message: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback);
}

async function requireUser(supabase: SessionClient) {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error("Not signed in.");
  return data.user;
}

async function loadViewerRole(
  supabase: SupabaseClient,
  memberId: string,
  userId: string,
): Promise<ViewerRole | null> {
  const [roleResult, profileResult] = await Promise.all([
    supabase.rpc("member_role", { target_member_id: memberId }),
    supabase.from("profiles").select("is_guild_admin").eq("id", userId).maybeSingle(),
  ]);
  if (roleResult.error)
    throw toError(roleResult.error, "Couldn't check your access to this profile.");
  const isGuildAdmin = Boolean(
    (profileResult.data as { is_guild_admin?: boolean } | null)?.is_guild_admin,
  );
  return resolveViewerRole((roleResult.data as string | null) ?? null, isGuildAdmin);
}

/** Keeps a Guild admin's "Edit as them" session alive while they edit (the SQL functions do the audit). */
async function touchImpersonation(memberId: string) {
  const state = await readImpersonationState();
  if (state && state.memberId === memberId) await touchImpersonationActivity(state);
}

type DraftRow = {
  member_id: string;
  data: unknown;
  dirty_sections: unknown;
  media_updated_by_user_id: string | null;
  updated_at: string;
};

type LiveMemberMeta = {
  id: string;
  slug: string;
  status: MemberStatus;
  member_type: MemberType;
  type_confirmed_at: string | null;
  business_name: string;
};

export type MemberDraftBundle = {
  member: LiveMemberMeta;
  data: MemberDraftData;
  dirtySections: DraftSection[];
  role: ViewerRole | null;
  /** Public member-logos URL of the DRAFT's logo, or null. */
  logoUrl: string | null;
};

async function ensureDraft(supabase: SessionClient, memberId: string): Promise<DraftRow> {
  const { data, error } = await supabase.rpc("ensure_member_draft", { p_member_id: memberId });
  if (error || !data) throw toError(error, "Couldn't open this profile's draft.");
  return data as DraftRow;
}

async function loadLiveMeta(supabase: SessionClient, memberId: string): Promise<LiveMemberMeta> {
  const { data, error } = await supabase
    .from("members")
    .select("id, slug, status, member_type, type_confirmed_at, business_name")
    .eq("id", memberId)
    .maybeSingle();
  if (error || !data) throw toError(error, "Member not found.");
  return data as LiveMemberMeta;
}

/**
 * Plain helper (not a server fn) for other server code on this request --
 * the preview loader reads the draft the same way.
 */
export async function loadMemberDraftBundle(
  supabase: SessionClient,
  memberId: string,
): Promise<MemberDraftBundle> {
  const user = await requireUser(supabase);
  const [draft, member, role] = await Promise.all([
    ensureDraft(supabase, memberId),
    loadLiveMeta(supabase, memberId),
    loadViewerRole(supabase, memberId, user.id),
  ]);
  const data = normalizeDraftData(draft.data);

  // Logos live in the public member-logos bucket, so the draft's logo can
  // be shown straight from its public URL (it's the member's own upload).
  let logoUrl: string | null = null;
  if (data.basics.logo_asset_id) {
    const { data: asset } = await supabase
      .from("media_assets")
      .select("storage_path")
      .eq("id", data.basics.logo_asset_id)
      .maybeSingle();
    if (asset?.storage_path) {
      logoUrl = supabase.storage.from("member-logos").getPublicUrl(asset.storage_path as string)
        .data.publicUrl;
    }
  }

  return {
    member,
    data,
    dirtySections: normalizeSections(draft.dirty_sections),
    role,
    logoUrl,
  };
}

/**
 * The member's draft (created from live on first use, ensure_member_draft),
 * plus the few live facts the editors need alongside it: status, type
 * (not drafted), slug, and the viewer's role.
 */
export const getMemberDraft = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<MemberDraftBundle> => {
    const supabase = await getSupabaseServerClientForRequest();
    return loadMemberDraftBundle(supabase, data.memberId);
  });

/**
 * Saves part of one section. `patch` holds whole top-level keys of the
 * section (the database merges them over what's stored; arrays such as
 * hours, slides and links are sent whole). Returns the new dirty list so
 * the caller can update the top bar.
 */
export const saveDraftSection = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { memberId: string; section: DraftSection; patch: Record<string, unknown> }) => data,
  )
  .handler(async ({ data }) => {
    const { section, patch } = validateDraftPatch(data.section, data.patch);
    const supabase = await getSupabaseServerClientForRequest();
    const { data: row, error } = await supabase.rpc("save_member_draft_section", {
      p_member_id: data.memberId,
      p_section: section,
      p_data: patch,
    });
    if (error || !row) throw toError(error, "Couldn't save — try again.");
    await touchImpersonation(data.memberId);
    return { dirtySections: normalizeSections((row as DraftRow).dirty_sections) };
  });

function parseSections(value: unknown): DraftSection[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isDraftSection)) {
    throw new Error("Choose what to publish.");
  }
  return DRAFT_SECTIONS.filter((section) => value.includes(section));
}

/**
 * Copies the named sections live, all or nothing (publish_member_draft).
 * The database enforces the role rules, the first-publish rule (every
 * section, full editors only) and the hours tick for basics.
 */
export const publishDraft = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { memberId: string; sections: DraftSection[]; confirmHours: boolean }) => data,
  )
  .handler(async ({ data }) => {
    const sections = parseSections(data.sections);
    const supabase = await getSupabaseServerClientForRequest();
    const { data: result, error } = await supabase.rpc("publish_member_draft", {
      p_member_id: data.memberId,
      p_sections: sections,
      p_confirm_hours: data.confirmHours === true,
    });
    if (error || !result) throw toError(error, "Publish failed — try again.");
    await touchImpersonation(data.memberId);
    const parsed = result as {
      status: MemberStatus;
      published_at: string;
      dirty_sections: unknown;
    };
    return {
      status: parsed.status,
      publishedAt: parsed.published_at,
      dirtySections: normalizeSections(parsed.dirty_sections),
    };
  });

/** Resets the named sections to what's live (discard_member_draft_sections). */
export const discardDraft = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; sections: DraftSection[] }) => data)
  .handler(async ({ data }) => {
    const sections = parseSections(data.sections);
    const supabase = await getSupabaseServerClientForRequest();
    const { data: row, error } = await supabase.rpc("discard_member_draft_sections", {
      p_member_id: data.memberId,
      p_sections: sections,
    });
    if (error || !row) throw toError(error, "Couldn't discard your changes — try again.");
    await touchImpersonation(data.memberId);
    return { dirtySections: normalizeSections((row as DraftRow).dirty_sections) };
  });

/** "Move back to draft" (plan Decision 13): unpublish_member, owner/full editor/Guild admin only. */
export const unpublishMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: status, error } = await supabase.rpc("unpublish_member", {
      p_member_id: data.memberId,
    });
    if (error) throw toError(error, "Couldn't move your profile back to draft — try again.");
    await touchImpersonation(data.memberId);
    return { status: (status as MemberStatus | null) ?? "draft" };
  });

export type DraftStatus = TopBarState & {
  status: MemberStatus;
  role: ViewerRole | null;
  dirtySections: DraftSection[];
  /** Email of whoever made the pending photo changes, when it wasn't the viewer. */
  photoChangesFrom: string | null;
};

/**
 * What the top bar shows: the Unpublished changes label, Publish /
 * Discard / Move back to draft, and the owner's "Photo changes from
 * [email] waiting to publish". Reads the draft without creating one.
 */
export const getDraftStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<DraftStatus> => {
    const supabase = await getSupabaseServerClientForRequest();
    const user = await requireUser(supabase);
    const [role, memberResult, draftResult] = await Promise.all([
      loadViewerRole(supabase, data.memberId, user.id),
      supabase.from("members").select("status").eq("id", data.memberId).maybeSingle(),
      supabase
        .from("member_drafts")
        .select("dirty_sections, media_updated_by_user_id")
        .eq("member_id", data.memberId)
        .maybeSingle(),
    ]);
    if (memberResult.error || !memberResult.data)
      throw toError(memberResult.error, "Member not found.");
    if (draftResult.error) throw toError(draftResult.error, "Couldn't read this profile's draft.");

    const status = (memberResult.data as { status: MemberStatus }).status;
    const draft = draftResult.data as {
      dirty_sections: unknown;
      media_updated_by_user_id: string | null;
    } | null;
    const dirtySections = normalizeSections(draft?.dirty_sections ?? []);
    const topBar = computeTopBarState({ role, status, dirty: dirtySections });

    let photoChangesFrom: string | null = null;
    if (
      shouldShowPhotoChangesFrom({
        role,
        dirty: dirtySections,
        mediaUpdatedByUserId: draft?.media_updated_by_user_id ?? null,
        viewerUserId: user.id,
      })
    ) {
      try {
        const service = await getSupabaseServiceRoleClient();
        const otherId = draft!.media_updated_by_user_id!;
        // A Guild admin who made the change while "editing as" this member
        // is shown as "the Guild" -- never their personal email.
        const { data: otherProfile } = await service
          .from("profiles")
          .select("is_guild_admin")
          .eq("id", otherId)
          .maybeSingle();
        if ((otherProfile as { is_guild_admin?: boolean } | null)?.is_guild_admin) {
          photoChangesFrom = "the Guild";
        } else {
          const { data: other } = await service.auth.admin.getUserById(otherId);
          photoChangesFrom = other?.user?.email ?? "another editor";
        }
      } catch {
        photoChangesFrom = "another editor";
      }
    }

    return { ...topBar, status, role, dirtySections, photoChangesFrom };
  });
