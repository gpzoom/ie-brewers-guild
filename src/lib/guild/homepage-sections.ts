import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { multiLocationCities } from "@/lib/home/member-events";
import { checkLink, pacificToday, sectionStatus, type LinkKind, type SectionRow } from "@/lib/home/sections";

/**
 * The super admin's homepage Settings (docs/superpowers/specs/2026-11-14-homepage-sections-design.md):
 * order, switch, and schedule the homepage blocks, and keep the announcement
 * image gallery. No I/O of its own -- clients are passed in, so the cores are
 * tested with fakes. Every core checks for the super admin first; the writes
 * go through the session client, so the tables' policies check again.
 */

export type SettingsSection = SectionRow & {
  status: "showing" | "scheduled" | "ended" | "off";
  imageUrl: string | null;
};

export type GalleryImage = {
  id: string;
  imagePath: string;
  imageUrl: string;
  alt: string;
  width: number | null;
  height: number | null;
  /** Labels of the announcements using this image. */
  usedBy: string[];
};

const ACTION = "change the homepage";
const SECTION_COLUMNS =
  "id, kind, position, enabled, image_id, alt_text, link_kind, link_target, starts_on, ends_on, image:announcement_images(image_path, alt_text, width, height)";
const GALLERY_PATH_PATTERN = /^announcements\/[A-Za-z0-9._-]+$/;
const ALT_REQUIRED = "Add a short description of the image.";

function publicUrl(c: SupabaseClient, path: string): string {
  return c.storage.from("site-images").getPublicUrl(path).data.publicUrl;
}

/** An announcement's name: its own alt override, else the image's alt text. */
function announcementLabel(row: { alt_text: string | null; image: { alt_text: string } | null }): string {
  return row.alt_text?.trim() || row.image?.alt_text || "Image";
}

export type HomepageSectionsData = {
  sections: SettingsSection[];
  gallery: GalleryImage[];
  memberPages: Array<{ path: string; label: string }>;
};

export async function listHomepageSectionsCore(
  c: SupabaseClient,
  now: Date,
): Promise<{
  sections: SettingsSection[];
  gallery: GalleryImage[];
  memberPages: Array<{ path: string; label: string }>;
}> {
  await requireSuperAdmin(c, ACTION);
  const [sectionsRes, galleryRes, membersRes] = await Promise.all([
    c.from("homepage_sections").select(SECTION_COLUMNS).order("position", { ascending: true }),
    c
      .from("announcement_images")
      .select("id, image_path, alt_text, width, height")
      .order("created_at", { ascending: false }),
    c
      .from("members")
      .select("id, slug, business_name, business_id, city")
      .eq("status", "published")
      .order("business_name", { ascending: true }),
  ]);
  if (sectionsRes.error || galleryRes.error || membersRes.error) {
    throw new Error("Couldn't load the homepage settings — try again.");
  }

  const today = pacificToday(now);
  const rows = (sectionsRes.data ?? []) as unknown as SectionRow[];
  const sections: SettingsSection[] = rows.map((r) => ({
    ...r,
    status: sectionStatus(r, today),
    imageUrl: r.image ? publicUrl(c, r.image.image_path) : null,
  }));

  const usedBy = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.image_id) continue;
    usedBy.set(r.image_id, [...(usedBy.get(r.image_id) ?? []), announcementLabel(r)]);
  }
  const gallery = (
    (galleryRes.data ?? []) as Array<{
      id: string;
      image_path: string;
      alt_text: string;
      width: number | null;
      height: number | null;
    }>
  ).map((g) => ({
    id: g.id,
    imagePath: g.image_path,
    imageUrl: publicUrl(c, g.image_path),
    alt: g.alt_text,
    width: g.width,
    height: g.height,
    usedBy: usedBy.get(g.id) ?? [],
  }));

  const members = (membersRes.data ?? []) as Array<{
    id: string;
    slug: string;
    business_name: string;
    business_id: string | null;
    city: string | null;
  }>;
  const cities = multiLocationCities(members);
  const memberPages = members.map((m) => {
    const city = cities.get(m.id);
    return { path: `/members/${m.slug}`, label: city ? `${m.business_name} · ${city}` : m.business_name };
  });

  return { sections, gallery, memberPages };
}

/** Turns a block on or off. */
export async function setSectionEnabledCore(
  c: SupabaseClient,
  id: string,
  enabled: boolean,
  now: Date,
): Promise<void> {
  const actor = await requireSuperAdmin(c, ACTION);
  if (typeof enabled !== "boolean") throw new Error("Choose on or off.");
  const { data, error } = await c
    .from("homepage_sections")
    .update({ enabled, updated_at: now.toISOString(), updated_by_user_id: actor.userId })
    .eq("id", id)
    .select("kind");
  if (error || !data || data.length === 0) throw new Error("Couldn't save the change — try again.");
}

/** Swaps a block with its neighbor above (-1) or below (1). */
export async function moveSectionCore(
  c: SupabaseClient,
  id: string,
  direction: -1 | 1,
): Promise<void> {
  await requireSuperAdmin(c, ACTION);
  if (direction !== -1 && direction !== 1) throw new Error("Choose up or down.");
  const { error } = await c.rpc("move_homepage_section", { p_id: id, p_direction: direction });
  if (error) throw new Error("Couldn't move it — try again.");
}

export type AnnouncementInput = {
  id?: string;
  imageId: string;
  altText: string | null;
  linkKind: LinkKind;
  linkTarget: string | null;
  startsOn: string | null;
  endsOn: string | null;
  enabled: boolean;
};

/** Adds or edits an image announcement; new ones go to the end of the list. */
export async function saveAnnouncementCore(
  c: SupabaseClient,
  input: AnnouncementInput,
  now: Date,
): Promise<{ id: string }> {
  const actor = await requireSuperAdmin(c, ACTION);
  if (!input.imageId) throw new Error("Choose an image.");
  const altText = input.altText?.trim() || null;
  const linkTarget = input.linkKind === "none" ? null : (input.linkTarget?.trim() ?? "");
  const linkError = checkLink(input.linkKind, linkTarget);
  if (linkError) {
    if (!linkTarget) throw new Error("Choose a page or enter a web address.");
    if (input.linkKind === "external") throw new Error("Web addresses start with https://");
    throw new Error(linkError);
  }
  const startsOn = input.startsOn || null;
  const endsOn = input.endsOn || null;
  if (startsOn && endsOn && endsOn < startsOn) throw new Error("The end date is before the start date.");

  const values = {
    image_id: input.imageId,
    alt_text: altText,
    link_kind: input.linkKind,
    link_target: linkTarget,
    starts_on: startsOn,
    ends_on: endsOn,
    enabled: input.enabled,
    updated_at: now.toISOString(),
    updated_by_user_id: actor.userId,
  };

  if (input.id) {
    const { data, error } = await c
      .from("homepage_sections")
      .update(values)
      .eq("id", input.id)
      .eq("kind", "image")
      .select("id");
    if (error || !data || data.length === 0) throw new Error("Couldn't save the announcement — try again.");
    return { id: input.id };
  }

  const { data: last, error: lastError } = await c
    .from("homepage_sections")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error("Couldn't save the announcement — try again.");
  const position = ((last as { position: number } | null)?.position ?? 0) + 1;
  const { data, error } = await c
    .from("homepage_sections")
    .insert({ ...values, kind: "image", position })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't save the announcement — try again.");
  return { id: (data as { id: string }).id };
}

/** Removes an image announcement. Events and Spotlight can't be deleted; the gallery is untouched. */
export async function deleteAnnouncementCore(c: SupabaseClient, id: string): Promise<void> {
  await requireSuperAdmin(c, ACTION);
  const { error } = await c.from("homepage_sections").delete().eq("id", id).eq("kind", "image");
  if (error) throw new Error("Couldn't delete the announcement — try again.");
}

/** Records an image already uploaded to site-images/announcements/. */
export async function saveGalleryImageCore(
  c: SupabaseClient,
  input: { path: string; altText: string; width: number | null; height: number | null },
  now: Date,
): Promise<{ id: string }> {
  const actor = await requireSuperAdmin(c, ACTION);
  const altText = input.altText?.trim();
  if (!altText) throw new Error(ALT_REQUIRED);
  if (!GALLERY_PATH_PATTERN.test(input.path)) throw new Error("That isn't an announcement image.");
  const { data, error } = await c
    .from("announcement_images")
    .insert({
      image_path: input.path,
      alt_text: altText,
      width: input.width,
      height: input.height,
      updated_at: now.toISOString(),
      updated_by_user_id: actor.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't save the image — try again.");
  return { id: (data as { id: string }).id };
}

export async function updateGalleryAltCore(
  c: SupabaseClient,
  id: string,
  altText: string,
  now: Date,
): Promise<void> {
  const actor = await requireSuperAdmin(c, ACTION);
  const alt = altText?.trim();
  if (!alt) throw new Error(ALT_REQUIRED);
  const { data, error } = await c
    .from("announcement_images")
    .update({ alt_text: alt, updated_at: now.toISOString(), updated_by_user_id: actor.userId })
    .eq("id", id)
    .select("id");
  if (error || !data || data.length === 0) throw new Error("Couldn't save the description — try again.");
}

/**
 * Deletes a gallery image nobody uses. Returns its storage path so the caller
 * can remove the file; refuses (naming the announcements) when it's in use.
 */
export async function deleteGalleryImageCore(
  c: SupabaseClient,
  id: string,
): Promise<{ removedPath: string }> {
  await requireSuperAdmin(c, ACTION);
  const { data: image, error: imageError } = await c
    .from("announcement_images")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (imageError || !image) throw new Error("Couldn't find that image.");

  const { data: users, error: usersError } = await c
    .from("homepage_sections")
    .select("alt_text, image:announcement_images(alt_text)")
    .eq("image_id", id);
  if (usersError) throw new Error("Couldn't check where the image is used — try again.");
  const labels = ((users ?? []) as unknown as Array<{
    alt_text: string | null;
    image: { alt_text: string } | null;
  }>).map(announcementLabel);
  if (labels.length > 0) {
    throw new Error(`In use by: ${labels.join(", ")}. Remove it from those announcements first.`);
  }

  const { error } = await c.from("announcement_images").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the image — try again.");
  return { removedPath: (image as { image_path: string }).image_path };
}
