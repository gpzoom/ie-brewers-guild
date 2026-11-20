import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { SOMETHING_WRONG, rateLimitMessage } from "@/lib/join/join-guards.server";
import { readHolderId, startHolderSession } from "@/lib/tap-card/tap-card-cookies.server";
import { plateMember } from "@/lib/tap-card/trail-pass-store.server";
import { validateFreeCard } from "@/lib/tap-card/free-card";

/**
 * The free loyalty-only Scan Pass (universal card, spec 2026-11-19). A new email
 * gets a card and this phone is signed in; an email that already has a card
 * gets nothing new -- the emailed 6-digit code instead.
 */

export type FreeCardPage = { memberName: string | null; plateCode: string | null; signedIn: boolean };

export const getFreeCardPage = createServerFn({ method: "GET" })
  .inputValidator((data: { plate?: string }) => ({ plate: typeof data?.plate === "string" ? data.plate : null }))
  .handler(async ({ data }): Promise<FreeCardPage> => {
    const service = await getSupabaseServiceRoleClient();
    const [plate, holderId] = await Promise.all([plateMember(service, data.plate), readHolderId()]);
    return { memberName: plate?.memberName ?? null, plateCode: plate?.code ?? null, signedIn: holderId !== null };
  });

export type FreeCardResult =
  | { kind: "signed-in"; next: string }
  | { kind: "need-code"; email: string; next: string }
  | { kind: "error"; message: string; field?: "name" | "email" | "ageConfirmed" };

export const startFreeCard = createServerFn({ method: "POST" })
  .inputValidator((data: { plateCode: string | null; name: string; email: string; ageConfirmed: boolean; optIn: boolean; website: string }) => ({
    plateCode: typeof data?.plateCode === "string" ? data.plateCode : null,
    name: String(data?.name ?? "").trim(),
    email: String(data?.email ?? "").trim(),
    ageConfirmed: data?.ageConfirmed === true,
    optIn: data?.optIn === true,
    website: String(data?.website ?? ""),
  }))
  .handler(async ({ data }): Promise<FreeCardResult> => {
    try {
      const errors = validateFreeCard(data);
      for (const field of ["name", "email", "ageConfirmed"] as const) {
        if (errors[field]) return { kind: "error", message: errors[field]!, field };
      }
      const limited = await rateLimitMessage("tapcard-join");
      if (limited) return { kind: "error", message: limited };
      const service = await getSupabaseServiceRoleClient();
      const plate = await plateMember(service, data.plateCode);
      const next = plate ? `/t/${plate.code}` : "/card";
      if (isHoneypotTripped(data.website)) return { kind: "need-code", email: data.email, next };
      const { data: existing, error: findError } = await service
        .from("tap_card_holders")
        .select("id")
        .eq("email_lower", data.email.toLowerCase())
        .maybeSingle();
      if (findError) throw new Error(findError.message);
      // Never open an existing card from a form: the owner of that email confirms with the code.
      if (existing) return { kind: "need-code", email: data.email, next };
      const { data: holder, error } = await service
        .from("tap_card_holders")
        .insert({ name: data.name, email: data.email, age_confirmed_via: "customer", activated_by_member_id: plate?.memberId ?? null })
        .select("id")
        .single();
      if (error?.code === "23505") return { kind: "need-code", email: data.email, next };
      if (error) throw new Error(error.message);
      if (plate && data.optIn) {
        const { error: subError } = await service
          .from("tap_card_member_subscribers")
          .upsert({ member_id: plate.memberId, holder_id: holder.id }, { onConflict: "member_id,holder_id", ignoreDuplicates: true });
        if (subError) throw new Error(subError.message);
      }
      await startHolderSession(holder.id);
      return { kind: "signed-in", next };
    } catch (err) {
      console.error("startFreeCard failed", err instanceof Error ? err.message : String(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });
