import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { newSetupLinkCore, type SetupLinkStore } from "@/lib/tap-card/setup-link";

/**
 * A brewery's own Tap Card screen (Portal > Tap Card and /admin/tap-card):
 * the bar devices that can check cards in. The tables are server-only, so
 * each function first asks the database whether the signed-in person is
 * the owner, a co-owner, a full editor, or a Guild admin (Edit as them) of
 * this member -- the same is_member_full_editor check other editors use --
 * and only then uses the service-role client.
 */
async function requireTapCardEditor(memberId: string) {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Please sign in again.");
  const { data: allowed, error } = await supabase.rpc("is_member_full_editor", { target_member_id: memberId });
  if (error) throw new Error(error.message);
  if (allowed !== true) throw new Error("Only the owner or a full editor can manage the Tap Card.");
  const service = await getSupabaseServiceRoleClient();
  const { data: member } = await service.from("members").select("member_type, trail_eligible").eq("id", memberId).maybeSingle();
  if (!member || member.member_type !== "producer" || !member.trail_eligible) {
    throw new Error("This member isn't a stop on the Inland Tap Card trail.");
  }
  return { userId: auth.user.id, service };
}

/** For the /admin menu: is this member a Tap Card stop? (Reads the member's own row.) */
export const isTapCardStop = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<boolean> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: row } = await supabase.from("members").select("member_type, trail_eligible").eq("id", data.memberId).maybeSingle();
    return !!row && row.member_type === "producer" && row.trail_eligible === true;
  });

export type ScannerDeviceSummary = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

export const listScannerDevices = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<ScannerDeviceSummary[]> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const { data: rows, error } = await service
      .from("scanner_devices")
      .select("id, label, created_at, last_used_at")
      .eq("member_id", data.memberId)
      .is("revoked_at", null)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
  });

/** Returns the setup link exactly once; only its hash is kept. */
export const createScannerDevice = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; label: string }) => ({
    memberId: String(data?.memberId ?? ""),
    label: String(data?.label ?? "").replace(/\s+/g, " ").trim(),
  }))
  .handler(async ({ data }): Promise<{ setupUrl: string }> => {
    if (!data.label) throw new Error("Name the device, like “Bar iPad”.");
    if (data.label.length > 60) throw new Error("Keep the name to 60 characters or fewer.");
    const { userId, service } = await requireTapCardEditor(data.memberId);
    const raw = generateUploadToken();
    const { error } = await service.from("scanner_devices").insert({
      member_id: data.memberId,
      label: data.label,
      token_hash: await hashUploadToken(raw),
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { setupUrl: `${resolveEmailSiteUrl(currentRequestUrl())}/scanner/${raw}` };
  });

/** "Show setup code": a fresh link for a device that isn't set up yet (the old one stops working). */
export const newScannerSetupLink = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; deviceId: string }) => ({
    memberId: String(data?.memberId ?? ""),
    deviceId: String(data?.deviceId ?? ""),
  }))
  .handler(async ({ data }): Promise<{ setupUrl: string }> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const store: SetupLinkStore = {
      async find(deviceId, memberId) {
        const { data: row, error } = await service
          .from("scanner_devices")
          .select("revoked_at, last_used_at")
          .eq("id", deviceId)
          .eq("member_id", memberId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return row ? { revokedAt: row.revoked_at, lastUsedAt: row.last_used_at } : null;
      },
      async replaceHashIfNotSetUp(deviceId, newHash) {
        const { data: rows, error } = await service
          .from("scanner_devices")
          .update({ token_hash: newHash })
          .eq("id", deviceId)
          .eq("member_id", data.memberId)
          .is("revoked_at", null)
          .is("last_used_at", null)
          .select("id");
        if (error) throw new Error(error.message);
        return (rows ?? []).length === 1;
      },
    };
    const result = await newSetupLinkCore(store, data.memberId, data.deviceId, generateUploadToken());
    if (!result.ok) {
      throw new Error(
        result.reason === "already-set-up"
          ? "This device is already set up. To set up another one, add a new device."
          : "That device has been turned off.",
      );
    }
    return { setupUrl: `${resolveEmailSiteUrl(currentRequestUrl())}/scanner/${result.token}` };
  });

export const revokeScannerDevice = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; deviceId: string }) => ({
    memberId: String(data?.memberId ?? ""),
    deviceId: String(data?.deviceId ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const { error } = await service
      .from("scanner_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.deviceId)
      .eq("member_id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
