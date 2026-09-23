import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import type { UploadTokenRow } from "@/lib/supabase/types";

export const listUploadTokens = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: tokens, error } = await supabase
      .from("upload_tokens")
      .select("*")
      .eq("member_id", data.memberId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return tokens as UploadTokenRow[];
  });

/** Returns the raw token exactly once -- it's never retrievable again after this call returns. */
export const createUploadToken = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; maxFiles?: number; expiresInDays?: number }) => data)
  .handler(async ({ data }) => {
    // Cheap bounds check on the two inputs the UI doesn't currently expose
    // (CreatorLinkPanel.tsx always uses the defaults below) -- there's no
    // DB-side CHECK constraint on upload_tokens.max_files/expires_at, and
    // this is self-scoped to the caller's own member (not a cross-tenant
    // issue), but a stray 0/negative/absurdly large value from a future
    // caller shouldn't silently create a useless or wildly-long-lived
    // token.
    if (data.maxFiles !== undefined && (data.maxFiles < 1 || data.maxFiles > 50)) {
      throw new Error("maxFiles must be between 1 and 50.");
    }
    if (data.expiresInDays !== undefined && (data.expiresInDays < 1 || data.expiresInDays > 30)) {
      throw new Error("expiresInDays must be between 1 and 30.");
    }

    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const rawToken = generateUploadToken();
    const tokenHash = await hashUploadToken(rawToken);
    const expiresAt = new Date(
      Date.now() + (data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: row, error } = await supabase
      .from("upload_tokens")
      .insert({
        member_id: data.memberId,
        token_hash: tokenHash,
        created_by_user_id: userData.user.id,
        expires_at: expiresAt,
        max_files: data.maxFiles ?? 5,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return { token: row as UploadTokenRow, rawToken };
  });

export const revokeUploadToken = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error` (same
    // gotcha member-basics.server.ts/hours-editor.server.ts/
    // media-gallery.server.ts/carousel.server.ts/cover.server.ts all guard
    // against). Without this, a write blocked by RLS would silently report
    // success back to CreatorLinkPanel's optimistic UI, leaving it showing
    // "revoked" for a token that's still actually active server-side.
    const { data: updated, error } = await supabase
      .from("upload_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Revoke failed — you may not have permission to revoke this link.");
    }
    return { ok: true as const };
  });
