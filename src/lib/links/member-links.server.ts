import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { validateLinkUrl } from "@/lib/links/url-safety";
import type { MemberLinkKind, MemberLinkRow, MemberRow } from "@/lib/supabase/types";

export const listMemberLinks = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: links, error } = await supabase
      .from("member_links")
      .select("*")
      .eq("member_id", data.memberId)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return links as MemberLinkRow[];
  });

/**
 * The subset of MemberRow this editor's Contact section reads -- deliberately
 * its OWN narrow query rather than reusing member-basics.server.ts's
 * getMemberBasics/BasicsMember. Those are scoped to Basics's own field list
 * on purpose (member-basics.server.ts's BASICS_KEYS doc comment); phone and
 * contact_email are explicitly NOT Basics fields per this plan's Decision 8
 * ("Phone and contact_email live here, not in the Basics editor" -- see
 * updateMemberContact below), so widening BasicsMember to also carry them
 * would blur that separation for every OTHER caller of getMemberBasics.
 * Same narrow-select-per-editor shape as MemberCover in cover.server.ts.
 */
export type MemberContactInfo = Pick<MemberRow, "id" | "member_type" | "phone" | "contact_email">;

export const getMemberContactInfo = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("id, member_type, phone, contact_email")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as MemberContactInfo;
  });

type LinkPatch = Partial<Pick<MemberLinkRow, "kind" | "label" | "url" | "sort_order">>;

export const upsertMemberLink = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: LinkPatch }) => data)
  .handler(async ({ data }) => {
    // Write-boundary validation -- must run before anything is inserted or
    // updated. member_links.url has NO scheme/format constraint at the
    // database level, and LinksContactEditor's Input has no validation of
    // its own, so without this a `javascript:`/`data:`/etc. value would go
    // straight into the row -- and from there straight into a real
    // `<a href>` on the public profile page (LinkPills.tsx), which is a
    // genuine stored-XSS vector reaching every visitor. See
    // url-safety.ts's isHttpUrl doc comment for why this check ALSO has to
    // exist at the render boundary, not only here.
    //
    // Only checked when `url` is actually present on this patch, and
    // skipped for an empty string -- a patch that only touches
    // kind/label/sort_order must not be rejected for a url it isn't even
    // setting, and onAdd (LinksContactEditor.tsx) deliberately creates a
    // new link with url: "" (filled in afterwards via a separate
    // onFieldChange call once the member types something), matching this
    // task's given "sort-order-on-add" behavior. An empty url is already
    // harmless -- isHttpUrl("") is false, so LinkPills' render-boundary
    // guard never turns it into a live href either.
    if (typeof data.patch.url === "string" && data.patch.url.trim() !== "") {
      const urlCheck = validateLinkUrl(data.patch.url);
      if (!urlCheck.valid) throw new Error(urlCheck.reason);
    }

    const supabase = await getSupabaseServerClientForRequest();
    if (data.id) {
      // .select("id") + row-count check -- PostgREST reports an
      // RLS-denied UPDATE as success (`error: null`) with zero rows
      // affected, not as an `error` -- same gotcha cover.server.ts's
      // updateCoverAsset/updateCoverCrop and
      // calendar-connection.server.ts's saveIcsConnection guard against.
      // Without this, a write blocked by RLS would silently report
      // success back to LinksContactEditor's optimistic UI.
      const { data: updated, error } = await supabase
        .from("member_links")
        .update(data.patch)
        .eq("id", data.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        throw new Error("Save failed — you may not have permission to edit this link.");
      }
      return { id: data.id };
    }
    // The INSERT branch deliberately has no row-count check -- an
    // INSERT's RLS `with check` failure raises a real Postgres error
    // (caught by the `error` check below), unlike UPDATE/DELETE's
    // silent-zero-rows behavior.
    const { data: created, error } = await supabase
      .from("member_links")
      .insert({
        member_id: data.memberId,
        kind: data.patch.kind ?? "other",
        url: data.patch.url ?? "",
        label: data.patch.label ?? null,
        sort_order: data.patch.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteMemberLink = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- same gotcha as upsertMemberLink's
    // UPDATE branch above: a DELETE blocked by RLS also reports success
    // with zero rows affected, not an `error`.
    const { data: deleted, error } = await supabase
      .from("member_links")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Delete failed — you may not have permission to remove this link.");
    }
    return { ok: true as const };
  });

/**
 * Phone and contact_email live here, not in the Basics editor (this plan's
 * Decision 8) -- artboard R is titled "links and contact."
 */
export const updateMemberContact = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { memberId: string; patch: { phone?: string | null; contact_email?: string | null } }) =>
      data,
  )
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- same gotcha as above.
    const { data: updated, error } = await supabase
      .from("members")
      .update(data.patch)
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }
    return { ok: true as const };
  });

export const LINK_KINDS: MemberLinkKind[] = [
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "taplist",
  "menu",
  "press_kit",
  "catalog",
  "other",
];
