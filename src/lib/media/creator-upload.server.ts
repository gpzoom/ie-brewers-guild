import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * No auth by design (spec: "the token never touches a client-side Supabase
 * call") -- everything here runs on the service-role client, since RLS
 * blocks all public access to upload_tokens outright. This function is the
 * one place that's allowed to bypass that block, and only after
 * independently re-validating the token itself.
 *
 * RATE LIMITING LIVES HERE, NOT (ONLY) IN THE ROUTE -- read before moving it.
 * Every createServerFn, including this one, gets its own dedicated RPC
 * endpoint that TanStack Start's request handler dispatches to directly,
 * in an early-exit branch that runs before the file-route tree (and
 * therefore before send.$token.tsx's own server.handlers.POST) is even
 * matched (confirmed against
 * node_modules/@tanstack/start-server-core/src/createStartHandler.ts and
 * node_modules/@tanstack/start-plugin-core/src/start-compiler/compiler.ts).
 * That RPC path is reachable independently of the /send/$token route and
 * isn't a meaningful secret: in dev it's a base64url encoding of this
 * file's own path + export name, and in production it's
 * sha256(filename + "--" + functionName) -- both fully derivable from this
 * file's own name, without needing to see any build output. So a rate
 * limit that only lives in the route's POST handler (as an earlier draft
 * of this task had it) can be bypassed outright by calling this RPC
 * endpoint directly. The check below is the actual enforcement point; the
 * route's own check (send.$token.tsx) is kept only as a fast-path
 * optimization for the normal browser-driven case.
 */
export const submitCreatorUpload = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const rawToken = String(formData.get("token") ?? "");
    const creatorName = String(formData.get("creatorName") ?? "").trim();
    const creditRequested = formData.get("creditRequested") === "true";
    const permissionAccepted = formData.get("permissionAccepted") === "true";
    const file = formData.get("file");

    if (!rawToken) throw new Error("Missing token.");
    if (!creatorName) throw new Error("Enter your name or handle.");
    if (!permissionAccepted)
      throw new Error("You must confirm you have permission to share this file.");
    if (!(file instanceof File)) throw new Error("No file provided.");

    // Hashed BEFORE the rate-limit check, and the hash (not the raw token)
    // is what's used as the rate-limit key -- the raw token is sensitive
    // bearer material (it's the whole credential this link hands out) and
    // there's no reason to pass it into another subsystem when the hash is
    // already computed just below and is an equally good stable per-token
    // identifier.
    const tokenHash = await hashUploadToken(rawToken);

    // The real enforcement point (see this function's own doc comment
    // above) -- runs first, before the token DB lookup, so an attacker
    // hitting this createServerFn's RPC endpoint directly (bypassing
    // send.$token.tsx entirely) still gets rate-limited. `cloudflare:workers`
    // resolves reliably here because this code only ever runs inside a
    // createServerFn handler (same pattern as
    // src/lib/supabase/server.ts's getSupabaseServiceRoleClient) -- never
    // import it from a route loader, which is isomorphic/client-bundled too.
    const { env } = await import("cloudflare:workers");
    const rateLimiter = (
      env as {
        CREATOR_UPLOAD_RATE_LIMITER?: {
          limit: (opts: { key: string }) => Promise<{ success: boolean }>;
        };
      }
    ).CREATOR_UPLOAD_RATE_LIMITER;
    const { success } = (await rateLimiter?.limit({ key: tokenHash })) ?? { success: true };
    if (!success) {
      throw new Error("Too many upload attempts. Try again in a minute.");
    }

    const supabase = await getSupabaseServiceRoleClient();

    const { data: token, error: tokenError } = await supabase
      .from("upload_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError || !token) throw new Error("This upload link is invalid.");
    if (token.revoked_at) throw new Error("This upload link has been revoked.");
    if (new Date(token.expires_at) < new Date()) throw new Error("This upload link has expired.");
    if (token.used_count >= token.max_files)
      throw new Error("This upload link has reached its file limit.");

    // Reserve a slot with an application-level compare-and-swap update,
    // BEFORE spending any effort on file validation/strip/upload --
    // without this, two concurrent requests against the same token (a
    // double-submit, or someone deliberately racing requests) could both
    // read the same used_count above, both pass the check above, both
    // upload, and both increment -- letting a token accept more files than
    // max_files. The `.eq("used_count", token.used_count)` clause makes the
    // UPDATE itself the check: it only matches (and therefore only returns
    // a row) if used_count still equals the value this request read: if a
    // concurrent request already incremented it, this UPDATE matches zero
    // rows and `reserved` comes back empty, which this treats as a hard
    // failure. Whichever of two racing requests' UPDATE actually commits
    // first wins the slot; the other's WHERE clause no longer matches and
    // it is rejected here, before any upload happens.
    //
    // Accepted tradeoff (matches an already-accepted pattern elsewhere in
    // this plan): if the file validation/upload/insert work below fails
    // AFTER this reservation succeeds, used_count has already been
    // incremented with no corresponding asset. That's a rare edge case
    // (upload/insert failure, not a normal path) and isn't worth a
    // rollback/give-back mechanism.
    const { data: reserved, error: reserveError } = await supabase
      .from("upload_tokens")
      .update({ used_count: token.used_count + 1 })
      .eq("id", token.id)
      .eq("used_count", token.used_count)
      .select("id");
    if (reserveError) throw new Error(reserveError.message);
    if (!reserved || reserved.length === 0) {
      throw new Error("This upload link was just used — please refresh and try again.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({
      bytes,
      claimedMimeType: file.type,
      allowSvg: false,
    });
    if (!validation.valid) throw new Error(validation.reason);

    const stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    // Reuses media-gallery.server.ts's sanitizeFilename rather than
    // concatenating raw, attacker-controlled `file.name` straight into the
    // storage path -- same path-injection risk Task 14/17 already found
    // and fixed for the member-upload and logo-upload paths.
    const storagePath = `${token.member_id}/creator-${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("member-media")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error(uploadError.message);

    const { data: asset, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: token.member_id,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "creator_upload",
        upload_token_id: token.id,
        creator_name: creatorName,
        creator_credit: creditRequested,
        permission_accepted_at: new Date().toISOString(),
        review_status: "pending", // Never straight into the gallery, never onto a live profile (spec).
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    try {
      await sendTransactionalEmail({
        trigger: "creator_upload_pending",
        memberId: token.member_id,
        assetId: asset.id as string,
        creatorName: creditRequested ? creatorName : null,
      });
    } catch (err) {
      console.error("sendTransactionalEmail(creator_upload_pending) failed", err);
    }

    return { ok: true as const };
  });
