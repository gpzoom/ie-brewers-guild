import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  isHoneypotTripped,
  validateContactFormInput,
  type ContactFormFieldErrors,
  type ContactFormInput,
} from "@/lib/contact/contact-form-validation";
import type { InquiryRow } from "@/lib/supabase/types";

export type SubmitContactFormResult = { ok: true } | { ok: false; errors: ContactFormFieldErrors };

/**
 * No auth by design (spec: "Inserts go through the Worker with the service
 * key, never a client-side Supabase call" -- inquiries' own RLS blocks all
 * public access outright). This function is the one place allowed to
 * bypass that block.
 *
 * THIS IS THE ONLY RATE-LIMIT ENFORCEMENT POINT -- there is no wrapping
 * route handler any more (see contact.tsx: it calls this function directly,
 * like every other public/admin server-fn call site in this codebase,
 * rather than going through a custom server.handlers.POST). That change was
 * required by a real deployment bug, not a style preference: a
 * createServerFn is only reachable over the network if the client build
 * actually imports/calls it somewhere -- the compiler emits its
 * `?tss-serverfn-split` provider module (the thing that makes the RPC id
 * resolvable at runtime) by tracing real call sites, not just by the file
 * existing. This function previously had ONLY contact.tsx's
 * server.handlers.POST calling it server-side, which the client-side
 * compiler strips out entirely -- so nothing in the client bundle ever
 * referenced submitContactForm, no provider module was emitted, and every
 * real request 500'd with "Server function info not found" (confirmed
 * against a real built Worker: its RPC id appeared in the router chunk but
 * never in the server-function manifest). Fixing that (having ContactPage
 * call this function directly) is also what makes the rate-limit check
 * below the sole enforcement point: whether TanStack Start dispatches here
 * via the normal client call or via a direct POST to this function's own
 * RPC path, the exact same handler body runs, so the check below always
 * executes. Do not reintroduce a route-level rate-limit check as a
 * replacement for this one -- see creator-upload.server.ts's own doc
 * comment for the identical reasoning, applied there first.
 *
 * This function's own job, in order: the per-IP rate limit, the honeypot
 * check, validation, the write, and firing both contact-form email
 * triggers.
 *
 * A tripped honeypot returns the exact same { ok: true } shape a genuine
 * submission gets, with no row written and no mail sent -- a bot can't
 * tell it was caught (this plan's Decision 2).
 */
export const submitContactForm = createServerFn({ method: "POST" })
  .inputValidator((data: ContactFormInput) => data)
  .handler(async ({ data }): Promise<SubmitContactFormResult> => {
    // The real enforcement point (see this function's own doc comment
    // above) -- runs first, before the honeypot check, so a request
    // reaching this handler by any path still gets rate-limited. Reuses
    // the Member Admin phase's existing per-token creator-upload rate
    // limiter under a new "contact:<ip>" key namespace (this plan's
    // Decision 8) rather than adding a second ratelimits binding.
    const { env } = await import("cloudflare:workers");
    const rateLimiter = (
      env as { CREATOR_UPLOAD_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }
    ).CREATOR_UPLOAD_RATE_LIMITER;

    // FAILS CLOSED: same reasoning as submitCreatorUpload in
    // creator-upload.server.ts -- this binding is the sole spam/abuse
    // guard on this fully public, unauthenticated endpoint, so a missing
    // binding must not silently allow every request through.
    if (!rateLimiter) {
      console.error(
        "submitContactForm: CREATOR_UPLOAD_RATE_LIMITER binding is missing -- refusing to process this submission rather than allowing it through unlimited.",
      );
      return { ok: false, errors: { message: "Something went wrong. Try again in a moment." } };
    }

    const clientIp = getRequestHeader("CF-Connecting-IP") ?? "unknown";
    const { success } = await rateLimiter.limit({ key: `contact:${clientIp}` });
    if (!success) {
      return { ok: false, errors: { message: "Too many submissions. Try again in a minute." } };
    }

    if (isHoneypotTripped(data.honeypot)) {
      return { ok: true };
    }

    const validation = validateContactFormInput(data);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }

    const supabase = await getSupabaseServiceRoleClient();

    const { data: inserted, error: insertError } = await supabase
      .from("inquiries")
      .insert({
        name: validation.value.name,
        email: validation.value.email,
        phone: validation.value.phone,
        message: validation.value.message,
        wants_membership_info: validation.value.wantsMembershipInfo,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Could not save your message. Try again in a moment.");
    }

    const inquiry = inserted as InquiryRow;

    // Fires independently of the Guild notification below. Only a
    // successful send here sets confirmation_sent_at -- that column is
    // exactly what lets the Guild-admin inquiries screen tell a delivered
    // auto-reply from one Resend silently failed to send (spec, inquiries
    // section).
    try {
      await sendTransactionalEmail({
        trigger: "contact_confirmation",
        inquiryId: inquiry.id,
        name: inquiry.name,
        email: inquiry.email,
        wantsMembershipInfo: inquiry.wants_membership_info,
      });
      const { error: updateError } = await supabase
        .from("inquiries")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", inquiry.id);
      if (updateError) {
        console.error("submitContactForm: failed to set confirmation_sent_at", updateError);
      }
    } catch (err) {
      console.error("sendTransactionalEmail(contact_confirmation) failed", err);
    }

    try {
      await sendTransactionalEmail({
        trigger: "contact_form_submitted",
        inquiryId: inquiry.id,
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        message: inquiry.message,
        wantsMembershipInfo: inquiry.wants_membership_info,
      });
    } catch (err) {
      console.error("sendTransactionalEmail(contact_form_submitted) failed", err);
    }

    return { ok: true };
  });
