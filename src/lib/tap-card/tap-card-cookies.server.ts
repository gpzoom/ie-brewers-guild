import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import {
  resolveHolderSession,
  resolveScannerDevice,
  type ScannerDeviceRecord,
  type ScannerState,
} from "@/lib/tap-card/tap-card-auth";
import { isStagingSite } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { parsePendingChoice, sessionNeedsRenewal, type Pending, type PendingChoice } from "@/lib/tap-card/staff-qr";

/**
 * The Tap Card cookies (no createServerFn here -- these helpers are called
 * from inside the Tap Card server functions only).
 */
export const SCANNER_COOKIE = "iebg_scanner";
export const HOLDER_COOKIE = "iebg_tapcard";
export const LOGIN_TOKEN_TTL_MINUTES = 60;
const SCANNER_MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
// Card sessions last as long as browsers allow and are renewed when used
// (spec 2026-11-18 bartender QR), so a regular never sees the email again.
const HOLDER_MAX_AGE = 400 * 24 * 60 * 60;

const cookieOptions = (maxAge: number) => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge });

export async function readScannerDevice(): Promise<ScannerState> {
  const service = await getSupabaseServiceRoleClient();
  const state = await resolveScannerDevice(
    {
      async byHash(hash) {
        const { data, error } = await service
          .from("scanner_devices")
          .select("id, member_id, label, revoked_at, members!inner(business_name, status, member_type, trail_eligible)")
          .eq("token_hash", hash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        const member = data.members as unknown as { business_name: string; status: string; member_type: string; trail_eligible: boolean };
        const record: ScannerDeviceRecord = {
          id: data.id,
          memberId: data.member_id,
          memberName: member.business_name,
          label: data.label,
          revokedAt: data.revoked_at,
          // A draft brewery counts as published on the staging site only (testing).
          memberPublished: member.status === "published" || (member.status === "draft" && onStagingSite()),
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

/** True when this request is on the staging site. */
export function onStagingSite(): boolean {
  return isStagingSite(currentRequestUrl());
}

export async function readHolderId(): Promise<string | null> {
  const service = await getSupabaseServiceRoleClient();
  const raw = getCookie(HOLDER_COOKIE);
  const now = new Date();
  let found: { hash: string; expiresAt: string } | null = null;
  const holderId = await resolveHolderSession(
    {
      async byHash(hash) {
        const { data, error } = await service
          .from("tap_card_sessions")
          .select("holder_id, expires_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) found = { hash, expiresAt: data.expires_at };
        return data ? { holderId: data.holder_id, expiresAt: data.expires_at } : null;
      },
    },
    raw,
    now,
  );
  const session = found as { hash: string; expiresAt: string } | null;
  if (holderId && raw && session && sessionNeedsRenewal(session.expiresAt, now, HOLDER_MAX_AGE * 1000)) {
    // Best effort: a failed renewal leaves the session as it was.
    const expiresAt = new Date(now.getTime() + HOLDER_MAX_AGE * 1000).toISOString();
    const { error } = await service.from("tap_card_sessions").update({ expires_at: expiresAt }).eq("token_hash", session.hash);
    if (!error) setCookie(HOLDER_COOKIE, raw, cookieOptions(HOLDER_MAX_AGE));
  }
  return holderId;
}

/** The plate choice this phone is waiting to confirm with the bartender QR (on its session row). */
export async function setPlatePending(p: { memberId: string; plateCode: string; choice: PendingChoice }): Promise<boolean> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return false;
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .update({ pending_member_id: p.memberId, pending_plate_code: p.plateCode, pending_choice: p.choice, pending_at: new Date().toISOString() })
    .eq("token_hash", await hashUploadToken(raw))
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function readPlatePending(): Promise<Pending | null> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return null;
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .select("pending_member_id, pending_plate_code, pending_choice, pending_at")
    .eq("token_hash", await hashUploadToken(raw))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const choice = parsePendingChoice(data?.pending_choice);
  if (!data?.pending_member_id || !data.pending_plate_code || !data.pending_at || !choice) return null;
  return { memberId: data.pending_member_id, plateCode: data.pending_plate_code, choice, at: data.pending_at };
}

/**
 * Takes the waiting choice that was read (matched by its time), so one
 * bartender scan confirms one choice even if the page sends twice. False
 * when another request already took it.
 */
export async function claimPlatePending(pendingAt: string): Promise<boolean> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return false;
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .update({ pending_member_id: null, pending_plate_code: null, pending_choice: null, pending_at: null })
    .eq("token_hash", await hashUploadToken(raw))
    .eq("pending_at", pendingAt)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
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
