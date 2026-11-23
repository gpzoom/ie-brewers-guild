import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/email/send";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { joinTrailCore, type TrailOptInStatus, type TrailOptInStore } from "@/lib/tap-card/trail-opt-in";

/** The Beer Trail checkbox on a member's own Scan Pass screen. requireTapCardEditor checks the caller first. */
function optInStore(service: SupabaseClient): TrailOptInStore {
  return {
    async find(memberId) {
      const { data, error } = await service
        .from("members")
        .select("business_name, city, member_type, status, trail_eligible")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data
        ? {
            producer: data.member_type === "producer",
            onTrail: data.trail_eligible === true,
            published: data.status === "published",
            businessName: data.business_name ?? "A member",
            city: data.city,
          }
        : null;
    },
    async addToTrail(memberId) {
      const { data, error } = await service
        .from("members")
        .update({ trail_eligible: true })
        .eq("id", memberId)
        .eq("member_type", "producer")
        .eq("trail_eligible", false)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    // From staging this goes to the test inbox (guildInboxFor).
    async notifyGuild(p) {
      await sendTransactionalEmail({ trigger: "beer_trail_joined", ...p });
    },
  };
}

export const getTrailOptIn = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<TrailOptInStatus> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const member = await optInStore(service).find(data.memberId);
    if (!member) throw new Error("Member not found.");
    return { producer: member.producer, onTrail: member.onTrail, published: member.published };
  });

export const joinTrail = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<TrailOptInStatus> => {
    const { service } = await requireTapCardEditor(data.memberId);
    return joinTrailCore(optInStore(service), data.memberId);
  });
