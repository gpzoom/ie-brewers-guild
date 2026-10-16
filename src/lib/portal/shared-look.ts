import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The shared look (multi-location part 4, spec 2026-10-15): in a
 * one-manager business the logo, cover, link-preview image and theme
 * belong to the business, and only its manager or a Guild admin may change
 * them. The database makes the real decision (save_member_draft_section /
 * publish refuse with the same wording as sharedLookRefusal); this is what
 * the app shows and checks ahead of time, e.g. before storing an upload.
 *
 * A plain module (not .server): it takes the client as an argument, and
 * its note helpers are used by the editors.
 */
export type SharedLook = {
  businessName: string;
  locationCount: number;
  /** The business manager or a Guild admin. */
  canChange: boolean;
  /** The manager's email, or "The Guild" (no manager yet, or unreadable). */
  managerLabel: string;
};

type BusinessJoin = { name: string; management_mode: string; manager_user_id: string | null };

/**
 * null unless the member is in a one-manager business. A failed read is
 * logged and reads as null: the page still loads, and the database
 * enforces the shared-look rule on its own.
 */
export async function loadSharedLook(
  service: SupabaseClient,
  memberId: string,
  viewer: { userId: string; isGuildAdmin: boolean },
): Promise<SharedLook | null> {
  try {
    return await readSharedLook(service, memberId, viewer);
  } catch (err) {
    console.error("loadSharedLook: couldn't read the shared look", err);
    return null;
  }
}

async function readSharedLook(
  service: SupabaseClient,
  memberId: string,
  viewer: { userId: string; isGuildAdmin: boolean },
): Promise<SharedLook | null> {
  const { data: row, error } = await service
    .from("members")
    .select("business_id, businesses(name, management_mode, manager_user_id)")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const member = row as { business_id: string | null; businesses: BusinessJoin | BusinessJoin[] | null } | null;
  if (!member?.business_id) return null;
  const business = Array.isArray(member.businesses) ? member.businesses[0] : member.businesses;
  if (!business || business.management_mode !== "one_manager") return null;

  const { count, error: countError } = await service
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("business_id", member.business_id);
  if (countError) throw new Error(countError.message);

  let managerLabel = "The Guild";
  if (business.manager_user_id) {
    const { data: userData } = await service.auth.admin.getUserById(business.manager_user_id);
    managerLabel = userData?.user?.email ?? "The Guild";
  }

  return {
    businessName: business.name,
    locationCount: count ?? 0,
    canChange: viewer.isGuildAdmin || viewer.userId === business.manager_user_id,
    managerLabel,
  };
}

/** "Shared by all 4 locations" (manager) or "Shared by all Hangar 24 locations. boss@x.com manages this." (others). */
export function sharedLookNote(look: SharedLook): string {
  return look.canChange
    ? `Shared by all ${look.locationCount} locations`
    : `Shared by all ${look.businessName} locations. ${look.managerLabel} manages this.`;
}

/** The database's refusal for a shared-look change by someone who can't make it. */
export function sharedLookRefusal(look: SharedLook): string {
  return `The logo, cover and theme are shared by all ${look.businessName} locations. ${look.managerLabel} manages them.`;
}

/**
 * The refusal for a change to the shared look by this viewer, or null when
 * they may make it (or the member isn't in a one-manager business).
 */
export function sharedLookChangeRefusal(look: SharedLook | null): string | null {
  return look && !look.canChange ? sharedLookRefusal(look) : null;
}

/**
 * For the setup wizard's short setup: whether another location of the
 * member's business has finished setup, and whether this one has. A failed
 * read is logged and reads as "no" (the full setup), never an error.
 */
export async function anotherLocationIsSetUp(
  service: SupabaseClient,
  memberId: string,
): Promise<{ otherSetUp: boolean; setupCompleted: boolean }> {
  try {
    const { data: row, error } = await service
      .from("members")
      .select("business_id, setup_completed_at")
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const member = row as { business_id: string | null; setup_completed_at: string | null } | null;
    const setupCompleted = member?.setup_completed_at != null;
    if (!member?.business_id) return { otherSetUp: false, setupCompleted };
    const { count, error: countError } = await service
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", member.business_id)
      .neq("id", memberId)
      .not("setup_completed_at", "is", null);
    if (countError) throw new Error(countError.message);
    return { otherSetUp: (count ?? 0) > 0, setupCompleted };
  } catch (err) {
    console.error("anotherLocationIsSetUp: couldn't read the business's locations", err);
    return { otherSetUp: false, setupCompleted: false };
  }
}

/**
 * The logo upload's pre-check, in order: first whether the caller may edit
 * this member's basics at all (through their own session -- the member id
 * comes from the browser), and only then the shared look, so a caller with
 * no access never learns a business's name or manager. null: go ahead.
 */
export async function logoUploadRefusal(deps: {
  canEditBasics: () => Promise<boolean>;
  loadLook: () => Promise<SharedLook | null>;
}): Promise<string | null> {
  if (!(await deps.canEditBasics())) return "You can't edit the basics section of this profile.";
  return sharedLookChangeRefusal(await deps.loadLook());
}
