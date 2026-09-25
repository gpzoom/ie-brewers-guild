import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { resolveImageDimensions } from "@/lib/media/image-dimensions";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";
import { sendTransactionalEmail } from "@/lib/email/send";

const GENERIC_UPLOAD_FAILURE_MESSAGE = "Upload failed, please try again.";

/**
 * Marks a thrown error as ALREADY a deliberate, safe-to-show-verbatim
 * message for this anonymous, public endpoint -- every intentional throw
 * in this handler (input-presence checks, token-state checks, the
 * rate-limit message, validateUploadedImage's own reasons, and every spot
 * that was already hand-converted to GENERIC_UPLOAD_FAILURE_MESSAGE with
 * its real detail logged first) uses this class instead of a plain Error.
 *
 * The outer try/catch wrapping the whole handler body below is what makes
 * this actually closed: it rethrows a UserFacingUploadError as-is, but
 * converts ANY other thrown error -- one nobody specifically thought to
 * wrap -- to the generic message, logging the real detail server-side
 * first. Added after a real leak review caught a case that individual
 * per-call-site wrapping had missed: getSupabaseServiceRoleClient() throws
 * its own developer-facing message ("Missing VITE_SUPABASE_URL or
 * SUPABASE_SERVICE_ROLE_KEY in the Worker environment.") when a secret is
 * missing, and that call wasn't individually wrapped -- an env-var-NAME
 * disclosure, not a secret-value disclosure, but exactly the class of leak
 * this mechanism exists to close everywhere by default, rather than
 * requiring every current and future call site in this handler to
 * remember to wrap itself individually.
 */
class UserFacingUploadError extends Error {}

/**
 * No auth by design (spec: "the token never touches a client-side Supabase
 * call") -- everything here runs on the service-role client, since RLS
 * blocks all public access to upload_tokens outright. This function is the
 * one place that's allowed to bypass that block, and only after
 * independently re-validating the token itself.
 *
 * THIS IS THE ONLY RATE-LIMIT ENFORCEMENT POINT -- there is no wrapping
 * route handler any more (see send.$token.tsx: it calls this function
 * directly, like every other admin server-fn call site in this codebase,
 * rather than going through a custom server.handlers.POST). That change
 * was itself required by a real deployment bug, not a style preference:
 * a createServerFn is only reachable over the network if the client build
 * actually imports/calls it somewhere -- the compiler emits its
 * `?tss-serverfn-split` provider module (the thing that makes the RPC id
 * resolvable at runtime) by tracing real call sites, not just by the file
 * existing. An earlier version of this task had ONLY send.$token.tsx's
 * server.handlers.POST calling this function server-side, which the
 * client-side compiler strips out entirely -- so nothing in the client
 * bundle ever referenced submitCreatorUpload, no provider module was
 * emitted, and every real request 400'd with "Server function info not
 * found," confirmed against a real built Worker. Fixing that (having
 * SendPage call this function directly) is also what makes this the sole
 * enforcement point: whether TanStack Start dispatches here via the normal
 * client call or via a direct POST to this function's own RPC path (its
 * id is derivable from this file's path + export name -- not a secret,
 * see below), the exact same handler body runs, so the check below always
 * executes. Do not reintroduce a route-level rate-limit check as a
 * replacement for this one -- it cannot be the ONLY check regardless of
 * how the client calls this function, because the RPC path is
 * independently reachable and derivable: in dev it's a base64url encoding
 * of this file's own path + export name, and in production it's
 * sha256(filename + "--" + functionName) (confirmed against
 * @tanstack/start-plugin-core/src/start-compiler/compiler.ts's
 * generateFunctionId).
 */
export const submitCreatorUpload = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    try {
      const rawToken = String(formData.get("token") ?? "");
      const creatorName = String(formData.get("creatorName") ?? "").trim();
      const creditRequested = formData.get("creditRequested") === "true";
      const permissionAccepted = formData.get("permissionAccepted") === "true";
      const file = formData.get("file");

      if (!rawToken) throw new UserFacingUploadError("Missing token.");
      if (!creatorName) throw new UserFacingUploadError("Enter your name or handle.");
      if (!permissionAccepted) {
        throw new UserFacingUploadError("You must confirm you have permission to share this file.");
      }
      if (!(file instanceof File)) throw new UserFacingUploadError("No file provided.");

      // Hashed BEFORE the rate-limit check, and the hash (not the raw
      // token) is what's used as the rate-limit key -- the raw token is
      // sensitive bearer material (it's the whole credential this link
      // hands out) and there's no reason to pass it into another
      // subsystem when the hash is already computed just below and is an
      // equally good stable per-token identifier.
      const tokenHash = await hashUploadToken(rawToken);

      // The real enforcement point (see this function's own doc comment
      // above) -- runs first, before the token DB lookup, so a request
      // reaching this handler by any path still gets rate-limited.
      // `cloudflare:workers` resolves reliably here because this code
      // only ever runs inside a createServerFn handler (same pattern as
      // src/lib/supabase/server.ts's getSupabaseServiceRoleClient) --
      // never import it from a route loader, which is
      // isomorphic/client-bundled too.
      //
      // FAILS CLOSED: if env.CREATOR_UPLOAD_RATE_LIMITER is missing (a
      // wrangler.jsonc edit that drops the `ratelimits` block, a
      // misconfigured environment -- this repo has a documented `wrangler
      // env`-block gotcha already, see project_staging_environment.md),
      // this must NOT silently allow every request through with no
      // limiting and no signal that anything is wrong. This is the sole
      // security boundary on the most exposed endpoint in this plan
      // (fully public, no auth), so a missing binding is treated as a
      // hard failure, loudly logged, rather than defaulting to
      // `{ success: true }`.
      const { env } = await import("cloudflare:workers");
      const rateLimiter = (
        env as {
          CREATOR_UPLOAD_RATE_LIMITER?: {
            limit: (opts: { key: string }) => Promise<{ success: boolean }>;
          };
        }
      ).CREATOR_UPLOAD_RATE_LIMITER;
      if (!rateLimiter) {
        console.error(
          "submitCreatorUpload: CREATOR_UPLOAD_RATE_LIMITER binding is missing -- refusing to process this upload rather than allowing it through unlimited.",
        );
        throw new UserFacingUploadError(GENERIC_UPLOAD_FAILURE_MESSAGE);
      }
      const { success } = await rateLimiter.limit({ key: tokenHash });
      if (!success) {
        throw new UserFacingUploadError("Too many upload attempts. Try again in a minute.");
      }

      const supabase = await getSupabaseServiceRoleClient();

      const { data: token, error: tokenError } = await supabase
        .from("upload_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (tokenError) console.error("submitCreatorUpload: token lookup failed", tokenError);
      if (tokenError || !token) throw new UserFacingUploadError("This upload link is invalid.");
      if (token.revoked_at) throw new UserFacingUploadError("This upload link has been revoked.");
      if (new Date(token.expires_at) < new Date()) {
        throw new UserFacingUploadError("This upload link has expired.");
      }
      if (token.used_count >= token.max_files) {
        throw new UserFacingUploadError("This upload link has reached its file limit.");
      }

      // File validation/stripping runs BEFORE the used_count reservation
      // below -- deliberately reordered from an earlier draft, which
      // reserved the slot first and validated after. That order let a
      // submission of garbage/unsupported-format bytes still burn a
      // max_files slot for nothing, even though it was always going to be
      // rejected. Both steps here are pure CPU (no I/O, no shared mutable
      // state), so moving them earlier doesn't change or weaken the
      // concurrency guarantee the reservation below provides -- it just
      // avoids paying that cost for a submission that was never going to
      // succeed.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const validation = await validateUploadedImage({
        bytes,
        claimedMimeType: file.type,
        allowSvg: false,
      });
      if (!validation.valid) throw new UserFacingUploadError(validation.reason);

      let stripped: Uint8Array;
      try {
        stripped = stripImageMetadata(bytes, validation.detectedMimeType);
      } catch (err) {
        // stripImageMetadata throws for any format it doesn't explicitly
        // parse (its own doc comment: never fall back to unstripped
        // bytes). That's a real, if rare, user-reachable case (e.g. a
        // Live Photo/Motion Photo JPEG) -- not an internal failure -- but
        // its thrown message is written for a developer, not an
        // anonymous caller, so it's logged here and replaced with a plain
        // one.
        console.error("submitCreatorUpload: stripImageMetadata rejected the file", err);
        throw new UserFacingUploadError(
          "This file couldn't be processed. Please upload a JPEG or PNG photo.",
        );
      }

      // Reserve a slot with an application-level compare-and-swap update,
      // immediately before the actual storage write -- this is where the
      // real concurrent-upload race lives. Without this, two concurrent
      // requests against the same token (a double-submit, or someone
      // deliberately racing requests) could both read the same
      // used_count above, both pass the checks above, both upload, and
      // both increment -- letting a token accept more files than
      // max_files. The `.eq("used_count", token.used_count)` clause makes
      // the UPDATE itself the check: it only matches (and therefore only
      // returns a row) if used_count still equals the value this request
      // read; if a concurrent request already incremented it, this
      // UPDATE matches zero rows and `reserved` comes back empty, which
      // this treats as a hard failure. Whichever of two racing requests'
      // UPDATE actually commits first wins the slot; the other's WHERE
      // clause no longer matches and it is rejected here, before any
      // upload happens.
      //
      // Accepted tradeoff (matches an already-accepted pattern elsewhere
      // in this plan): if the upload/insert work below fails AFTER this
      // reservation succeeds, used_count has already been incremented
      // with no corresponding asset. That's a rare edge case (a
      // storage/DB failure, not a normal path) and isn't worth a
      // rollback/give-back mechanism. Moving file validation above this
      // point (see comment above) already closes the much more common
      // case -- an invalid file burning a slot -- essentially for free.
      const { data: reserved, error: reserveError } = await supabase
        .from("upload_tokens")
        .update({ used_count: token.used_count + 1 })
        .eq("id", token.id)
        .eq("used_count", token.used_count)
        .select("id");
      if (reserveError) {
        console.error("submitCreatorUpload: used_count reservation failed", reserveError);
        throw new UserFacingUploadError(GENERIC_UPLOAD_FAILURE_MESSAGE);
      }
      if (!reserved || reserved.length === 0) {
        throw new UserFacingUploadError(
          "This upload link was just used — please refresh and try again.",
        );
      }

      // Reuses media-gallery.server.ts's sanitizeFilename rather than
      // concatenating raw, attacker-controlled `file.name` straight into
      // the storage path -- same path-injection risk Task 14/17 already
      // found and fixed for the member-upload and logo-upload paths.
      const storagePath = `${token.member_id}/creator-${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
      // Anonymous input -- resolveImageDimensions prefers the stored
      // bytes' own header and only falls back to the claimed "width"/
      // "height" fields when both are sane positive ints (see
      // image-dimensions.ts). Worst case a lie only skews the initial crop.
      const dimensions = resolveImageDimensions(stripped, formData);

      const { error: uploadError } = await supabase.storage
        .from("member-media")
        .upload(storagePath, stripped, { contentType: validation.detectedMimeType });
      if (uploadError) {
        console.error("submitCreatorUpload: storage upload failed", uploadError);
        throw new UserFacingUploadError(GENERIC_UPLOAD_FAILURE_MESSAGE);
      }

      const { data: asset, error: insertError } = await supabase
        .from("media_assets")
        .insert({
          member_id: token.member_id,
          storage_path: storagePath,
          kind: "image",
          mime_type: validation.detectedMimeType,
          byte_size: stripped.byteLength,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
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
      if (insertError) {
        console.error("submitCreatorUpload: media_assets insert failed", insertError);
        throw new UserFacingUploadError(GENERIC_UPLOAD_FAILURE_MESSAGE);
      }

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
    } catch (err) {
      // UserFacingUploadError is thrown deliberately, with a message
      // already vetted as safe to show an anonymous caller verbatim (see
      // that class's own doc comment) -- rethrow it unchanged. Anything
      // else reaching here is, by definition, a throw nobody specifically
      // reasoned about as user-facing -- e.g. getSupabaseServiceRoleClient()
      // throwing its own developer-facing "Missing ... in the Worker
      // environment" message, or any other unanticipated exception from a
      // helper this handler calls: log the real detail server-side and
      // replace it with the generic message, rather than leaking whatever
      // internal string it happened to carry.
      if (err instanceof UserFacingUploadError) throw err;
      console.error("submitCreatorUpload: unexpected failure", err);
      throw new Error(GENERIC_UPLOAD_FAILURE_MESSAGE);
    }
  });
