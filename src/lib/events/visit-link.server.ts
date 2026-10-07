import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { verifyVisitLink } from "@/lib/events/visit-link-token";
import { statusFor, visitView, type VisitView } from "@/lib/events/visit-link";
import type { EventHostStatus } from "@/lib/supabase/types";

/**
 * The email buttons' page (spec, "The email buttons"). Opening the page
 * only reads (checkVisitLink); the change happens only from its button
 * (actOnVisitLink), so an email scanner opening the link changes nothing.
 * Service role: nobody is signed in; the signed token is the permission.
 */
async function readSecret(): Promise<string | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { GUEST_STOP_LINK_SECRET?: string }).GUEST_STOP_LINK_SECRET;
}

async function load(token: string): Promise<{ view: VisitView; eventId?: string; hostId?: string }> {
  const secret = await readSecret();
  if (!secret) return { view: { state: "invalid" } };
  const v = await verifyVisitLink(token, secret);
  if (!v.valid) return { view: { state: v.reason === "expired" ? "gone" : "invalid" } };
  const db = await getSupabaseServiceRoleClient();
  const [{ data: link }, { data: event }, { data: host }] = await Promise.all([
    db.from("event_hosts").select("status, host_member_id, guest_name").eq("event_id", v.eventId).maybeSingle(),
    db.from("events").select("starts_at, ends_at, overlay_starts_at, overlay_status, title, all_day").eq("id", v.eventId).maybeSingle(),
    db.from("members").select("business_name, timezone").eq("id", v.hostId).maybeSingle(),
  ]);
  const view = visitView({
    action: v.action,
    hostId: v.hostId,
    link: link ? { status: link.status as EventHostStatus, host_member_id: link.host_member_id as string } : null,
    event: event as never,
    guestName: (link?.guest_name as string | null) ?? "A Guild member",
    taproomName: (host?.business_name as string | undefined) ?? "your taproom",
    timezone: (host?.timezone as string | undefined) || "America/Los_Angeles",
    now: new Date(),
  });
  return { view, eventId: v.eventId, hostId: v.hostId };
}

export const checkVisitLink = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => (await load(data.token)).view);

export const actOnVisitLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<VisitView> => {
    const { view, eventId, hostId } = await load(data.token);
    if (view.state !== "ready" || !eventId || !hostId) return view;
    const status = statusFor(view.action);
    const db = await getSupabaseServiceRoleClient();
    const { data: updated, error } = await db
      .from("event_hosts")
      .update({ status, status_set_by_user_id: null, updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("host_member_id", hostId)
      .select("event_id");
    if (error) throw new Error("That didn't save. Please try again.");
    if (!updated?.length) return { state: "gone" };
    return { ...view, state: "answered", status };
  });
