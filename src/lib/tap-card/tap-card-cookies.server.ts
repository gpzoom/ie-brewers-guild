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
import { TRAIL_JOIN_COOKIE } from "@/lib/tap-card/trail-join";
import { normalizeCardCode } from "@/lib/tap-card/card-code";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionNeedsRenewal, type PendingScan } from "@/lib/tap-card/staff-qr";

/**
 * The Scan Pass cookies (no createServerFn here -- these helpers are called
 * from inside the Scan Pass server functions only).
 */
export const SCANNER_COOKIE = "iebg_scanner";
export const HOLDER_COOKIE = "iebg_tapcard";
export const LOGIN_TOKEN_TTL_MINUTES = 60;
const SCANNER_MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
// Card sessions last as long as browsers allow and are renewed when used
// (spec 2026-11-18 staff QR), so a regular never sees the email again.
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

/** A scanned staff QR, noted on this phone's session row until the customer taps. */
export async function notePendingScan(p: { memberId: string; staffCode: string }): Promise<boolean> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return false;
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .update({
      pending_member_id: p.memberId,
      pending_staff_code: p.staffCode,
      pending_at: new Date().toISOString(),
      pending_plate_code: null,
      pending_choice: null,
    })
    .eq("token_hash", await hashUploadToken(raw))
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** This phone's own scan only: another phone signed in to the same pass can't confirm it. */
export async function readPendingScan(): Promise<PendingScan | null> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return null;
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .select("id, pending_member_id, pending_staff_code, pending_at")
    .eq("token_hash", await hashUploadToken(raw))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.pending_member_id || !data.pending_staff_code || !data.pending_at) return null;
  return { sessionId: data.id, memberId: data.pending_member_id, staffCode: data.pending_staff_code, at: data.pending_at };
}

const NO_SCAN = { pending_member_id: null, pending_staff_code: null, pending_at: null };

/** Uses up the scan that was read (matched by its time). False when another request already did. */
export async function claimPendingScan(scan: { sessionId: string; at: string }): Promise<boolean> {
  const service = await getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("tap_card_sessions")
    .update(NO_SCAN)
    .eq("id", scan.sessionId)
    .eq("pending_at", scan.at)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** The customer closed the check-in. */
export async function dropPendingScan(): Promise<void> {
  const raw = getCookie(HOLDER_COOKIE);
  if (!raw) return;
  const service = await getSupabaseServiceRoleClient();
  const { error } = await service.from("tap_card_sessions").update(NO_SCAN).eq("token_hash", await hashUploadToken(raw));
  if (error) throw new Error(error.message);
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

/** Names the Beer Trail sign-up this browser started (2 hours), so the return page from Zeffy can finish it. */
export function setTrailJoinCookie(value: string): void {
  setCookie(TRAIL_JOIN_COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2 * 60 * 60 });
}

/** The sign-up this browser started (cookie), if any. */
export async function readTrailJoin(service: SupabaseClient): Promise<{ id: string; email: string; memberId: string | null; plateCode: string | null; optIn: boolean; createdAt: Date } | null> {
  const raw = getCookie(TRAIL_JOIN_COOKIE);
  const [id, plateCode] = (raw ?? "").split(".");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data, error } = await service.from("tap_card_trail_joins").select("id, email, member_id, opt_in, created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    email: data.email as string,
    memberId: (data.member_id as string | null) ?? null,
    plateCode: plateCode && normalizeCardCode(plateCode) ? normalizeCardCode(plateCode) : null,
    optIn: data.opt_in === true,
    createdAt: new Date(data.created_at as string),
  };
}

export function clearTrailJoin(): void {
  setCookie(TRAIL_JOIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}
