import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import {
  LISTING_LIMITS,
  validateListing,
  type ListingCondition,
  type ListingInput,
  type ListingKind,
  type MarketplaceCategory,
  type MarketplaceListing,
} from "@/lib/marketplace/marketplace";

/**
 * Producer marketplace. Everything goes through the caller's own session, so
 * RLS (20261127100000_marketplace.sql) decides who reads and who writes; the
 * filters here only tidy what a Guild admin, who may read everything, sees.
 */

const BUCKET = "marketplace-photos";
const PHOTO_LINK_SECONDS = 6 * 60 * 60;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const LIST_LIMIT = 500;

const COLUMNS =
  "id, member_id, kind, category_id, title, description, condition, price_cents, price_unit, negotiable, location_text, contact_name, contact_email, contact_phone, photo_paths, status, posted_at, expires_at, members!inner(business_name, slug, city, status, member_type)";

type Row = {
  id: string;
  member_id: string;
  kind: ListingKind;
  category_id: string | null;
  title: string;
  description: string;
  condition: ListingCondition | null;
  price_cents: number | null;
  price_unit: string | null;
  negotiable: boolean;
  location_text: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  photo_paths: string[];
  status: "open" | "closed";
  posted_at: string;
  expires_at: string;
  members: { business_name: string; slug: string; city: string | null; status: string };
};

async function toListings(supabase: SupabaseClient, rows: Row[]): Promise<MarketplaceListing[]> {
  const paths = [...new Set(rows.flatMap((row) => row.photo_paths))];
  const urls = new Map<string, string>();
  // Signed in batches; a failed batch only hides its photos.
  for (let i = 0; i < paths.length; i += 500) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 500), PHOTO_LINK_SECONDS);
    if (error) console.error("marketplace: couldn't link photos", error.message);
    for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return rows.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members.business_name,
    memberSlug: row.members.slug,
    memberStatus: row.members.status,
    memberCity: row.members.city,
    kind: row.kind,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    condition: row.condition,
    priceCents: row.price_cents,
    priceUnit: row.price_unit,
    negotiable: row.negotiable,
    locationText: row.location_text,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    photoPaths: row.photo_paths,
    photoUrls: row.photo_paths.map((path) => urls.get(path) ?? null),
    status: row.status,
    postedAt: row.posted_at,
    expiresAt: row.expires_at,
  }));
}

async function loadCategories(supabase: SupabaseClient): Promise<MarketplaceCategory[]> {
  const { data, error } = await supabase.from("marketplace_categories").select("id, name, sort_order").order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketplaceCategory[];
}

export type MarketplaceSection = {
  categories: MarketplaceCategory[];
  /** Open listings from published Producers (this member's own included). */
  open: MarketplaceListing[];
  /** This member's listings, every state. */
  mine: MarketplaceListing[];
  /** What a new listing's contact box starts with. */
  contact: { email: string; phone: string };
};

/** The member's Marketplace screen (portal and /admin). */
export async function loadMarketplaceSection(supabase: SupabaseClient, memberId: string): Promise<MarketplaceSection> {
  const [categories, open, mine, member] = await Promise.all([
    loadCategories(supabase),
    supabase
      .from("marketplace_listings")
      .select(COLUMNS)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .eq("members.status", "published")
      .eq("members.member_type", "producer")
      .order("posted_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from("marketplace_listings").select(COLUMNS).eq("member_id", memberId).order("posted_at", { ascending: false }),
    supabase.from("members").select("contact_email, phone").eq("id", memberId).maybeSingle(),
  ]);
  if (open.error) throw new Error("Couldn't load the marketplace.");
  if (mine.error) throw new Error("Couldn't load your listings.");
  const [openListings, mineListings] = await Promise.all([
    toListings(supabase, (open.data ?? []) as unknown as Row[]),
    toListings(supabase, (mine.data ?? []) as unknown as Row[]),
  ]);
  return {
    categories,
    open: openListings,
    mine: mineListings,
    contact: {
      email: (member.data?.contact_email as string | null) ?? "",
      phone: (member.data?.phone as string | null) ?? "",
    },
  };
}

/** The /admin screen (Edit as them). RLS decides; a Mobile or Affiliate member has nothing here. */
export const getMemberMarketplace = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<MarketplaceSection | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: row } = await supabase.from("members").select("member_type").eq("id", data.memberId).maybeSingle();
    if (row?.member_type !== "producer") return null;
    const { data: canEdit } = await supabase.rpc("is_member_full_editor", { target_member_id: data.memberId });
    if (canEdit !== true) return null;
    return loadMarketplaceSection(supabase, data.memberId);
  });

async function oneListing(supabase: SupabaseClient, id: string): Promise<MarketplaceListing> {
  const { data, error } = await supabase.from("marketplace_listings").select(COLUMNS).eq("id", id).single();
  if (error) throw new Error("Saved, but couldn't reload the listing. Refresh the page.");
  return (await toListings(supabase, [data as unknown as Row]))[0];
}

async function removeFiles(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("marketplace: couldn't remove photos", error.message);
}

function checked(input: ListingInput) {
  const result = validateListing(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Add (no id) or change a listing; live at once. */
export const saveListing = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id: string | null; input: ListingInput }) => data)
  .handler(async ({ data }): Promise<MarketplaceListing> => {
    const value = checked(data.input);
    const supabase = await getSupabaseServerClientForRequest();
    let removed: string[] = [];
    let id = data.id;
    if (id) {
      const before = await supabase.from("marketplace_listings").select("photo_paths").eq("id", id).maybeSingle();
      const { data: rows, error } = await supabase
        .from("marketplace_listings")
        .update(value)
        .eq("id", id)
        .eq("member_id", data.memberId)
        .select("id");
      if (error || !rows?.length) throw new Error("Couldn't save — you may not have permission to change this listing.");
      removed = ((before.data?.photo_paths as string[] | undefined) ?? []).filter((path) => !value.photo_paths.includes(path));
    } else {
      const { data: row, error } = await supabase
        .from("marketplace_listings")
        .insert({ member_id: data.memberId, ...value })
        .select("id")
        .single();
      if (error) throw new Error("Couldn't post the listing — the marketplace is only for Producers.");
      id = row.id as string;
    }
    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "marketplace_listings",
      rowId: id,
      action: data.id ? "update" : "insert",
    });
    await removeFiles(supabase, removed);
    return oneListing(supabase, id);
  });

/** Mark closed, or renew: open again for another 60 days (the database sets the real dates). */
export const setListingStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; action: "close" | "renew" }) => data)
  .handler(async ({ data }): Promise<MarketplaceListing> => {
    const supabase = await getSupabaseServerClientForRequest();
    const now = new Date().toISOString();
    const patch = data.action === "close" ? { status: "closed" } : { status: "open", posted_at: now, expires_at: now };
    const { data: rows, error } = await supabase.from("marketplace_listings").update(patch).eq("id", data.id).select("id, member_id");
    if (error || !rows?.length) throw new Error("Couldn't save — you may not have permission to change this listing.");
    await recordAuditLogIfImpersonating({
      memberId: rows[0].member_id as string,
      tableName: "marketplace_listings",
      rowId: data.id,
      action: "update",
    });
    return oneListing(supabase, data.id);
  });

/** The owner's Delete, and a Guild admin's Remove. */
export const deleteListing = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: rows, error } = await supabase
      .from("marketplace_listings")
      .delete()
      .eq("id", data.id)
      .select("id, member_id, photo_paths");
    if (error || !rows?.length) throw new Error("Couldn't delete — you may not have permission to delete this listing.");
    await recordAuditLogIfImpersonating({
      memberId: rows[0].member_id as string,
      tableName: "marketplace_listings",
      rowId: data.id,
      action: "delete",
    });
    await removeFiles(supabase, rows[0].photo_paths as string[]);
    return { ok: true as const };
  });

export const uploadListingPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: form }): Promise<{ path: string; url: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const memberId = String(form.get("memberId") ?? "");
    const file = form.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(memberId) || !(file instanceof File)) throw new Error("Choose a photo.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({ bytes, claimedMimeType: file.type, allowSvg: false, maxBytes: PHOTO_MAX_BYTES });
    if (!validation.valid) throw new Error(validation.reason);
    let stripped: Uint8Array;
    try {
      stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    } catch {
      throw new Error("Please upload a JPEG or PNG photo.");
    }
    const path = `${memberId}/${crypto.randomUUID()}.${validation.detectedMimeType === "image/png" ? "png" : "jpg"}`;
    const bucket = supabase.storage.from(BUCKET);
    const { error } = await bucket.upload(path, stripped, { contentType: validation.detectedMimeType });
    if (error) throw new Error("Couldn't upload the photo — try again.");
    const { data: link, error: linkError } = await bucket.createSignedUrl(path, PHOTO_LINK_SECONDS);
    if (linkError) throw new Error("Couldn't show the photo — try again.");
    return { path, url: link.signedUrl };
  });

// ---- Guild admin (/guild/marketplace) ------------------------------------

async function requireGuildAdmin(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.rpc("is_guild_admin");
  if (data !== true) throw new Error("Only a Guild admin can do that.");
}

export const getGuildMarketplace = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getSupabaseServerClientForRequest();
  await requireGuildAdmin(supabase);
  const [categories, rows] = await Promise.all([
    loadCategories(supabase),
    supabase.from("marketplace_listings").select(COLUMNS).order("posted_at", { ascending: false }).limit(LIST_LIMIT),
  ]);
  if (rows.error) throw new Error("Couldn't load the listings.");
  return { categories, listings: await toListings(supabase, (rows.data ?? []) as unknown as Row[]) };
});

function categoryName(name: unknown): string {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value || value.length > LISTING_LIMITS.category) throw new Error(`Enter a name up to ${LISTING_LIMITS.category} characters.`);
  return value;
}

export const saveMarketplaceCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string | null; name: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireGuildAdmin(supabase);
    const name = categoryName(data.name);
    const last = (await loadCategories(supabase)).reduce((max, c) => Math.max(max, c.sort_order), -1);
    const { error } = data.id
      ? await supabase.from("marketplace_categories").update({ name }).eq("id", data.id)
      : await supabase.from("marketplace_categories").insert({ name, sort_order: last + 1 });
    if (error?.code === "23505") throw new Error(`There's already a category called "${name}".`);
    if (error) throw new Error("Couldn't save the category — try again.");
    return { ok: true as const };
  });

export const orderMarketplaceCategories = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireGuildAdmin(supabase);
    for (const [position, id] of data.ids.entries()) {
      const { error } = await supabase.from("marketplace_categories").update({ sort_order: position }).eq("id", id);
      if (error) throw new Error("Couldn't change the order — try again.");
    }
    return { ok: true as const };
  });

export const deleteMarketplaceCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireGuildAdmin(supabase);
    const { error } = await supabase.from("marketplace_categories").delete().eq("id", data.id);
    if (error) throw new Error("Couldn't delete the category — try again.");
    return { ok: true as const };
  });
