import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaAssetRow } from "@/lib/supabase/types";

/**
 * The shared look's photos across locations (multi-location part 4, spec
 * 2026-10-15). In a one-manager business the logo, cover and link-preview
 * image live in ONE location's gallery, so the other locations can't find
 * them in their own gallery, and RLS hides them from someone who edits
 * only those other locations. These lookups use the SERVICE client, so
 * callers must already have checked, through the session, that the viewer
 * may edit `memberId` (the draft loader's ensure_member_draft does; the
 * /api/admin-media route checks with canViewAdminMedia). They return only
 * look photos -- a sibling's other gallery photos stay private.
 *
 * A plain module (not .server): it takes the client as an argument, like
 * src/lib/portal/shared-look.ts.
 */
export type LookIds = {
  logo_asset_id?: string | null;
  cover_asset_id?: string | null;
  og_image_asset_id?: string | null;
};

const LOOK_KEYS = ["logo_asset_id", "cover_asset_id", "og_image_asset_id"] as const;

/** The logo, cover and link-preview asset ids of each source, once each, in order. */
export function lookAssetIds(...sources: (LookIds | null | undefined)[]): string[] {
  const ids: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const key of LOOK_KEYS) {
      const id = source[key];
      if (typeof id === "string" && id !== "" && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

type SiblingLive = { id: string } & LookIds;
type SiblingDraft = { member_id: string; data: unknown };

function draftLook(data: unknown): LookIds | null {
  const basics = (data as { basics?: unknown } | null)?.basics;
  return basics && typeof basics === "object" ? (basics as LookIds) : null;
}

/** The locations whose live or draft logo, cover or link preview is `assetId` (carousel slides don't count). */
export function membersShowingLookAsset(
  assetId: string,
  siblings: SiblingLive[],
  drafts: SiblingDraft[],
): string[] {
  return siblings
    .filter((s) => {
      const draft = drafts.find((d) => d.member_id === s.id);
      return lookAssetIds(s, draftLook(draft?.data)).includes(assetId);
    })
    .map((s) => s.id);
}

type MemberBusinessRow = {
  business_id: string | null;
  businesses: { management_mode: string } | { management_mode: string }[] | null;
} & LookIds;

/** The member's one-manager business id and live look ids, or null. Throws on a failed read. */
async function readOneManagerMember(
  service: SupabaseClient,
  memberId: string,
): Promise<{ businessId: string; live: LookIds } | null> {
  const { data, error } = await service
    .from("members")
    .select("business_id, logo_asset_id, cover_asset_id, og_image_asset_id, businesses(management_mode)")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as MemberBusinessRow | null;
  if (!row?.business_id) return null;
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  if (business?.management_mode !== "one_manager") return null;
  return { businessId: row.business_id, live: row };
}

async function readSiblingIds(service: SupabaseClient, businessId: string, memberId: string) {
  const { data, error } = await service
    .from("members")
    .select("id, logo_asset_id, cover_asset_id, og_image_asset_id")
    .eq("business_id", businessId)
    .neq("id", memberId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SiblingLive[];
}

/**
 * The look photos `memberId`'s draft or live profile uses that another
 * location of its one-manager business owns. Empty outside a one-manager
 * business, and on a failed read (logged): the editors then just show no
 * photo, as before.
 */
export async function loadLookAssets(
  service: SupabaseClient,
  memberId: string,
  draft: LookIds,
): Promise<MediaAssetRow[]> {
  try {
    const member = await readOneManagerMember(service, memberId);
    if (!member) return [];
    const ids = lookAssetIds(draft, member.live);
    if (ids.length === 0) return [];
    const siblings = await readSiblingIds(service, member.businessId, memberId);
    if (siblings.length === 0) return [];
    const { data, error } = await service
      .from("media_assets")
      .select("*")
      .in("id", ids)
      .in(
        "member_id",
        siblings.map((s) => s.id),
      );
    if (error) throw new Error(error.message);
    return (data ?? []) as MediaAssetRow[];
  } catch (err) {
    console.error("loadLookAssets: couldn't read the shared look's photos", err);
    return [];
  }
}

/**
 * For /api/admin-media: the other locations of the asset owner's
 * one-manager business that show this asset as their draft or live logo,
 * cover or link preview, and whether member_users links `userId` to each
 * (canViewAdminMedia decides). Empty otherwise, and on a failed read.
 */
export async function sharedLookMembersForAsset(
  service: SupabaseClient,
  asset: { id: string; member_id: string },
  userId: string,
): Promise<{ memberId: string; isLinked: boolean }[]> {
  try {
    const owner = await readOneManagerMember(service, asset.member_id);
    if (!owner) return [];
    const siblings = await readSiblingIds(service, owner.businessId, asset.member_id);
    if (siblings.length === 0) return [];
    const { data: drafts, error: draftsError } = await service
      .from("member_drafts")
      .select("member_id, data")
      .in(
        "member_id",
        siblings.map((s) => s.id),
      );
    if (draftsError) throw new Error(draftsError.message);
    const showing = membersShowingLookAsset(asset.id, siblings, (drafts ?? []) as SiblingDraft[]);
    if (showing.length === 0) return [];
    const { data: links, error: linksError } = await service
      .from("member_users")
      .select("member_id")
      .eq("user_id", userId)
      .in("member_id", showing);
    if (linksError) throw new Error(linksError.message);
    const linked = new Set(((links ?? []) as { member_id: string }[]).map((l) => l.member_id));
    return showing.map((memberId) => ({ memberId, isLinked: linked.has(memberId) }));
  } catch (err) {
    console.error("sharedLookMembersForAsset: couldn't read the business's look", err);
    return [];
  }
}
