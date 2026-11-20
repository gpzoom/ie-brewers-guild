import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { activateCore, type ActivateInput, type ActivateOutcome, type ActivateStore } from "@/lib/tap-card/activate-core";
import { readScannerDevice, startHolderSession } from "@/lib/tap-card/tap-card-cookies.server";
import { sendHolderSignInLink } from "@/lib/tap-card/holder-signin.server";

/**
 * Turning on a card, by the customer on their own phone (public, rate
 * limited, starts their session) or by the staff member on a bar device (after
 * checking ID). Both send the welcome email; a failed email never undoes
 * the activation.
 */

function activateStore(service: SupabaseClient): ActivateStore {
  return {
    async findCard(code) {
      const { data, error } = await service.from("tap_cards").select("id, holder_id").eq("code", code).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id, holderId: data.holder_id } : null;
    },
    async findHolderIdByEmail(email) {
      const { data, error } = await service.from("tap_card_holders").select("id").eq("email_lower", email.toLowerCase()).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },
    async createHolder(h) {
      const { data, error } = await service
        .from("tap_card_holders")
        .insert({
          name: h.name,
          email: h.email,
          age_confirmed_via: h.ageConfirmedVia,
          activated_by_member_id: h.activatedByMemberId,
        })
        .select("id")
        .single();
      if (!error && data) return data.id;
      // Two activations with the same new email at once: use the one that won.
      if (error?.code === "23505") {
        const { data: again } = await service.from("tap_card_holders").select("id").eq("email_lower", h.email.toLowerCase()).maybeSingle();
        if (again) return again.id;
      }
      throw new Error(error?.message ?? "Could not save the pass holder.");
    },
    async linkCard(cardId, holderId) {
      const { data, error } = await service
        .from("tap_cards")
        .update({ holder_id: holderId, activated_at: new Date().toISOString() })
        .eq("id", cardId)
        .is("holder_id", null)
        .select("id");
      if (error) throw new Error(error.message);
      return data && data.length > 0 ? "ok" : "already-active";
    },
  };
}

async function sendWelcome(email: string, name: string) {
  try {
    const siteUrl = resolveEmailSiteUrl(currentRequestUrl());
    await sendTransactionalEmail({ trigger: "tap_card_welcome", email, name, cardUrl: `${siteUrl}/card` });
  } catch (err) {
    console.error("scan pass welcome email failed", err instanceof Error ? err.message : String(err));
  }
}

/** What the page is told: an existing account's id never leaves the server. */
export type ActivateResult =
  | Exclude<ActivateOutcome, { kind: "existing-holder" }>
  | { kind: "existing-email" }
  | { kind: "error"; message: string };

/**
 * Runs the activation. An email that already has a Scan Pass gets a sign-in
 * link instead (never a session, never this card), so only the person who
 * can open that inbox can add the card.
 */
async function runActivation(input: ActivateInput): Promise<ActivateOutcome> {
  const service = await getSupabaseServiceRoleClient();
  const outcome = await activateCore(activateStore(service), input);
  if (outcome.kind === "activated") {
    await sendWelcome(input.email.trim().toLowerCase(), input.name.replace(/\s+/g, " ").trim());
  } else if (outcome.kind === "existing-holder") {
    await sendHolderSignInLink(service, outcome.holderId, outcome.email);
  }
  return outcome;
}

function forPage(outcome: ActivateOutcome): ActivateResult {
  return outcome.kind === "existing-holder" ? { kind: "existing-email" } : outcome;
}

type CustomerInput = { code: string; name: string; email: string; ageConfirmed: boolean; website: string };

export const activateCardAsCustomer = createServerFn({ method: "POST" })
  .inputValidator((data: CustomerInput) => ({
    code: String(data?.code ?? ""),
    name: String(data?.name ?? ""),
    email: String(data?.email ?? ""),
    ageConfirmed: data?.ageConfirmed === true,
    website: String(data?.website ?? ""),
  }))
  .handler(async ({ data }): Promise<ActivateResult> => {
    try {
      const limited = await rateLimitMessage("tapcard-activate");
      if (limited) return { kind: "error", message: limited };
      // A bot filled the hidden field: answer like a dead card, save nothing.
      if (isHoneypotTripped(data.website)) return { kind: "unknown-card" };
      const outcome = await runActivation({ ...data, via: "customer", memberId: null });
      if (outcome.kind === "activated") await startHolderSession(outcome.holderId);
      return forPage(outcome);
    } catch (err) {
      console.error("activateCardAsCustomer failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });

export const activateCardAsStaff = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; name: string; email: string; idChecked: boolean }) => ({
    code: String(data?.code ?? ""),
    name: String(data?.name ?? ""),
    email: String(data?.email ?? ""),
    idChecked: data?.idChecked === true,
  }))
  .handler(async ({ data }): Promise<ActivateResult> => {
    try {
      const device = await readScannerDevice();
      if (device.kind !== "ok") return { kind: "error", message: "This device can't activate passes right now." };
      return forPage(
        await runActivation({
          code: data.code,
          name: data.name,
          email: data.email,
          ageConfirmed: data.idChecked,
          via: "staff",
          memberId: device.device.memberId,
        }),
      );
    } catch (err) {
      console.error("activateCardAsStaff failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });
