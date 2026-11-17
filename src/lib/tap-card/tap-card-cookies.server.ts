import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import {
  resolveHolderSession,
  resolveScannerDevice,
  type ScannerDeviceRecord,
  type ScannerState,
} from "@/lib/tap-card/tap-card-auth";

/**
 * The Tap Card cookies (no createServerFn here -- these helpers are called
 * from inside the Tap Card server functions only).
 */
export const SCANNER_COOKIE = "iebg_scanner";
export const HOLDER_COOKIE = "iebg_tapcard";
export const LOGIN_TOKEN_TTL_MINUTES = 60;
const SCANNER_MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
const HOLDER_MAX_AGE = 90 * 24 * 60 * 60;

const cookieOptions = (maxAge: number) => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge });

export async function readScannerDevice(): Promise<ScannerState> {
  const service = await getSupabaseServiceRoleClient();
  const state = await resolveScannerDevice(
    {
      async byHash(hash) {
        const { data, error } = await service
          .from("scanner_devices")
          .select("id, member_id, label, revoked_at, members!inner(business_name, status, trail_eligible)")
          .eq("token_hash", hash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        const member = data.members as unknown as { business_name: string; status: string; trail_eligible: boolean };
        const record: ScannerDeviceRecord = {
          id: data.id,
          memberId: data.member_id,
          memberName: member.business_name,
          label: data.label,
          revokedAt: data.revoked_at,
          memberPublished: member.status === "published",
          trailEligible: member.trail_eligible,
        };
        return record;
      },
    },
    getCookie(SCANNER_COOKIE),
  );
  if (state.kind !== "none") {
    await service.from("scanner_devices").update({ last_used_at: new Date().toISOString() }).eq("id", state.device.id);
  }
  return state;
}

/** Sets the bar device cookie from a raw setup token (the device row already exists). */
export function setScannerCookie(rawToken: string): void {
  setCookie(SCANNER_COOKIE, rawToken, cookieOptions(SCANNER_MAX_AGE));
}

export async function readHolderId(): Promise<string | null> {
  const service = await getSupabaseServiceRoleClient();
  return resolveHolderSession(
    {
      async byHash(hash) {
        const { data, error } = await service
          .from("tap_card_sessions")
          .select("holder_id, expires_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data ? { holderId: data.holder_id, expiresAt: data.expires_at } : null;
      },
    },
    getCookie(HOLDER_COOKIE),
    new Date(),
  );
}

export async function startHolderSession(holderId: string): Promise<void> {
  const service = await getSupabaseServiceRoleClient();
  const raw = generateUploadToken();
  const expiresAt = new Date(Date.now() + HOLDER_MAX_AGE * 1000).toISOString();
  const { error } = await service
    .from("tap_card_sessions")
    .insert({ holder_id: holderId, token_hash: await hashUploadToken(raw), expires_at: expiresAt });
  if (error) throw new Error(error.message);
  setCookie(HOLDER_COOKIE, raw, cookieOptions(HOLDER_MAX_AGE));
}

export async function endHolderSession(): Promise<void> {
  const raw = getCookie(HOLDER_COOKIE);
  if (raw) {
    const service = await getSupabaseServiceRoleClient();
    await service.from("tap_card_sessions").delete().eq("token_hash", await hashUploadToken(raw));
  }
  setCookie(HOLDER_COOKIE, "", cookieOptions(0));
}
