import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { initialCropForAspect } from "@/lib/media/crop-interaction";
import { validateLinkUrl } from "@/lib/links/url-safety";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { CarouselSlideRow, MediaAssetRow } from "@/lib/supabase/types";
import type { CropRect } from "@/lib/media/crop";

const CAROUSEL_ASPECT = 4 / 5;

export const listCarouselSlides = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: slides, error } = await supabase
      .from("carousel_slides")
      .select("*")
      .eq("member_id", data.memberId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return slides as CarouselSlideRow[];
  });

/**
 * `carousel_slides`' own write RLS policy (supabase/migrations/
 * 20260922035745_carousel_slides_table.sql, "owners and editors can manage
 * their own") only checks `is_member_editor(member_id)` -- the member_id
 * of the SLIDE row being written -- it never verifies that the referenced
 * `asset_id` actually belongs to that same member. Without this explicit
 * check, a member (or a crafted request past the client UI) could assign
 * ANY existing media_assets.id, including one belonging to a different
 * member entirely, into their own slot. If this member is later
 * published, that would make the OTHER member's photo publicly readable
 * through /api/member-media/$assetId (whose eligibility rule is
 * "referenced by ANY published member's carousel slide," not scoped to
 * the same member owning the slide) and would display someone else's
 * uploaded photo on this member's public profile without their consent --
 * a real cross-tenant privacy/integrity issue, not just a theoretical one.
 *
 * The session-bound (RLS-scoped) client used below means a non-owned
 * asset_id is already practically unselectable via a plain SELECT, but
 * that's an incidental effect of read-side row visibility, not something
 * the write-side policy itself enforces -- so this check makes the intent
 * explicit in code, on the write path, rather than relying on that side
 * effect.
 */
export async function assertAssetOwnedByMember(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClientForRequest>>,
  assetId: string,
  memberId: string,
) {
  const { data: owned, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("id", assetId)
    .eq("member_id", memberId)
    .maybeSingle();
  // A genuine DB/network failure on this query must surface as its own
  // error, not fall through to "not owned" -- otherwise a transient
  // failure here would show the member the misleading "that photo isn't
  // in your gallery" message for a photo that actually is theirs.
  if (error) {
    throw new Error(`Couldn't verify this photo's ownership: ${error.message}`);
  }
  if (!owned) {
    throw new Error("That photo isn't in this member's gallery.");
  }
}

/**
 * `carousel_slides` has a `unique (member_id, sort_order)` constraint
 * (same migration as above). The check-then-insert-or-update pattern below
 * has a narrow race: two near-simultaneous assigns to the same empty slot
 * could both pass the `existing` lookup as null, then race on the insert
 * -- one succeeds, the other hits this constraint and would otherwise
 * surface as a raw Postgres error string. Same pattern as
 * hours-editor.server.ts's specialHoursErrorMessage for
 * special_hours_member_id_date_key: catch the specific violation and
 * return a clean, actionable message instead.
 */
function carouselSlotErrorMessage(error: { code?: string; message: string }): string {
  if (
    error.code === "23505" &&
    error.message.includes("carousel_slides_member_id_sort_order_key")
  ) {
    return "That slot was just filled by another update -- refresh and try again.";
  }
  return error.message;
}

/** Assigns a gallery asset to a slot (0-3), replacing whatever was there. */
export const assignCarouselSlide = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      memberId: string;
      sortOrder: number;
      assetId: string;
      asset: Pick<MediaAssetRow, "width" | "height">;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.sortOrder < 0 || data.sortOrder > 3)
      throw new Error("Carousel slots are 0-3 (max four slides).");

    const supabase = await getSupabaseServerClientForRequest();

    // Must happen before either the update or insert branch below -- see
    // assertAssetOwnedByMember's doc comment.
    await assertAssetOwnedByMember(supabase, data.assetId, data.memberId);

    const crop: CropRect =
      data.asset.width && data.asset.height
        ? initialCropForAspect(data.asset.width, data.asset.height, CAROUSEL_ASPECT)
        : { x: 0, y: 0, w: 1, h: 1 };

    const { data: existing } = await supabase
      .from("carousel_slides")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("sort_order", data.sortOrder)
      .maybeSingle();

    if (existing) {
      // .select("id") + row-count check -- PostgREST reports an
      // RLS-denied update as success with zero rows affected, not as an
      // `error` (member-basics.server.ts / hours-editor.server.ts /
      // media-gallery.server.ts's deleteMemberMedia all guard the same
      // gotcha). Without this, a write blocked by RLS would silently
      // report success back to the optimistic UI.
      const { data: updated, error } = await supabase
        .from("carousel_slides")
        .update({ asset_id: data.assetId, crop })
        .eq("id", existing.id)
        .select("id");
      if (error) throw new Error(carouselSlotErrorMessage(error));
      if (!updated || updated.length === 0) {
        throw new Error("Save failed -- you may not have permission to edit this slide.");
      }

      await recordAuditLogIfImpersonating({
        memberId: data.memberId,
        tableName: "carousel_slides",
        rowId: existing.id,
        action: "update",
      });

      return { id: existing.id, crop };
    }

    const { data: created, error } = await supabase
      .from("carousel_slides")
      .insert({
        member_id: data.memberId,
        asset_id: data.assetId,
        sort_order: data.sortOrder,
        crop,
      })
      .select("id")
      .single();
    if (error) throw new Error(carouselSlotErrorMessage(error));

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "carousel_slides",
      rowId: created.id as string,
      action: "insert",
    });

    return { id: created.id as string, crop };
  });

export const unassignCarouselSlide = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- see the comment on the update
    // branch of assignCarouselSlide above for why this matters: a delete
    // silently blocked by RLS (e.g. someone else's slide id) would
    // otherwise report `{ ok: true }`, leaving CarouselEditor.tsx's
    // optimistic removal with no real failure signal to react to.
    const { data: deleted, error } = await supabase
      .from("carousel_slides")
      .delete()
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Remove failed -- you may not have permission to remove this slide.");
    }

    await recordAuditLogIfImpersonating({
      memberId: deleted[0].member_id as string,
      tableName: "carousel_slides",
      rowId: data.id,
      action: "delete",
    });

    return { ok: true as const };
  });

export const updateCarouselSlideCrop = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; crop: CropRect }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("carousel_slides")
      .update({ crop: data.crop })
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed -- you may not have permission to edit this slide.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "carousel_slides",
      rowId: data.id,
      action: "update",
    });

    return { ok: true as const };
  });

export const updateCarouselSlideLink = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; outboundUrl: string | null }) => data)
  .handler(async ({ data }) => {
    // Write-boundary validation -- same stored-XSS shape as
    // member_links.url (src/lib/links/member-links.server.ts's
    // upsertMemberLink): carousel_slides.outbound_url has no DB-level
    // scheme constraint either (supabase/migrations/
    // 20260922035745_carousel_slides_table.sql, plain `text`), and
    // MediaCarousel.tsx wraps a full 4:5 slide PHOTO in a real
    // `<a href={slide.outbound_url}>` on the public profile -- a
    // `javascript:` value here would execute for any visitor who clicks
    // the slide, an arguably more temptingly-clickable surface than the
    // small link pills that shape of bug was originally fixed on.
    // Reusing url-safety.ts's validateLinkUrl rather than duplicating the
    // check -- see that file's own doc comment for why this exact
    // validation has to run at BOTH this write boundary and the render
    // boundary (MediaCarousel.tsx): a signed-in member has direct
    // RLS-scoped REST access to their own carousel_slides rows, so a bad
    // scheme can reach `outbound_url` without ever calling this function.
    // `null` clears the link and is always allowed; CarouselEditor.tsx's
    // onLinkBlur already converts an empty input to `null` before calling
    // this, but an empty string is treated the same as `null` here too
    // (skipped, not rejected) for the same reason upsertMemberLink skips
    // validation on an empty `url` -- it's already harmless, since
    // isHttpUrl("") is false and the render-boundary guard below never
    // turns it into a live href either.
    //
    // `typeof data.outboundUrl === "string"`, not just `!== null` --
    // `.inputValidator`'s type annotation is only a compile-time promise
    // (same caveat member-basics.server.ts's updateMemberBasics and
    // upsertMemberLink's own patch-allowlist filtering both call out): a
    // raw request not built through CarouselEditor's typed object
    // literals could send a number/array/object for `outboundUrl`. The
    // original `!== null && data.outboundUrl.trim() !== ""` shape called
    // `.trim()` on whatever that was, throwing a raw, unfriendly
    // `TypeError` straight out to the member instead of either a clean
    // rejection or a clean pass-through. Restructured to match
    // upsertMemberLink's exact `typeof ... === "string"` shape, plus an
    // explicit rejection for a non-null, non-string value so it can't
    // silently skip validation and reach `.update()` below unchecked (no
    // XSS exposure either way -- nothing that fails a string check can
    // carry a scheme through `validateLinkUrl` -- but writing an
    // unvalidated non-string into a `text` column is still worth refusing
    // outright rather than coercing or ignoring).
    if (data.outboundUrl !== null) {
      if (typeof data.outboundUrl !== "string") {
        throw new Error("Invalid link.");
      }
      if (data.outboundUrl.trim() !== "") {
        const urlCheck = validateLinkUrl(data.outboundUrl);
        if (!urlCheck.valid) throw new Error(urlCheck.reason);
      }
    }

    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("carousel_slides")
      .update({ outbound_url: data.outboundUrl })
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed -- you may not have permission to edit this slide.");
    }

    await recordAuditLogIfImpersonating({
      memberId: updated[0].member_id as string,
      tableName: "carousel_slides",
      rowId: data.id,
      action: "update",
    });

    return { ok: true as const };
  });
