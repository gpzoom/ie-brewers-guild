import { createServerFn } from "@tanstack/react-start";
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
 * bypass that block. The route boundary (src/routes/contact.tsx, Task 6)
 * applies the per-IP rate limit before this function ever runs; this
 * function's own job is the honeypot check, validation, the write, and
 * firing both contact-form email triggers.
 *
 * A tripped honeypot returns the exact same { ok: true } shape a genuine
 * submission gets, with no row written and no mail sent -- a bot can't
 * tell it was caught (this plan's Decision 2).
 */
export const submitContactForm = createServerFn({ method: "POST" })
  .inputValidator((data: ContactFormInput) => data)
  .handler(async ({ data }): Promise<SubmitContactFormResult> => {
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
      await supabase
        .from("inquiries")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", inquiry.id);
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
