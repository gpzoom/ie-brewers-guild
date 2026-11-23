import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { dbFailed, ensurePlate, qrTaken, readAllRows } from "@/lib/tap-card/plate-store.server";
import {
  makeStaffCodesCore,
  removeStaffCore,
  renameStaffCore,
  replaceStaffCodeCore,
  resetCounterQrCore,
  saveSharedCodeCore,
  setSharedCodeOffCore,
  staffCodesView,
  turnOffStaffCore,
  type CodeRow,
  type StaffCodesStore,
  type StaffCodesView,
} from "@/lib/tap-card/staff-codes-core";
import { requireTapCardOwner } from "@/lib/tap-card/tap-card-editor.server";

export type { StaffCodesView } from "@/lib/tap-card/staff-codes-core";

/**
 * Portal/Admin > Scan Pass > Staff QR codes (spec 2026-11-23): owners,
 * co-owners and Guild admins only. A full editor gets none of these codes.
 */

const CLASH = "23505";

/** "ok", or "clash" for a unique violation. */
function saved(error: { code?: string; message: string } | null): "ok" | "clash" {
  if (!error) return "ok";
  if (error.code === CLASH) return "clash";
  throw dbFailed(error);
}

function mustSave(error: { message: string } | null): void {
  if (error) throw dbFailed(error);
}

/** Every query here is held to this member's rows. */
function staffCodesStore(service: SupabaseClient, memberId: string): StaffCodesStore {
  const now = () => new Date().toISOString();
  const staffTable = () => service.from("tap_card_staff");
  const codeTable = () => service.from("tap_card_staff_codes");
  const plateTable = () => service.from("tap_card_plates");
  return {
    plate: () => ensurePlate(service, memberId),
    async listStaff() {
      const rows = await readAllRows<{ id: string; name: string; name_key: string; removed_at: string | null }>((from, to) =>
        staffTable().select("id, name, name_key, removed_at").eq("member_id", memberId).order("created_at").order("id").range(from, to),
      );
      return rows.map((r) => ({ id: r.id, name: r.name, key: r.name_key, removed: r.removed_at !== null }));
    },
    async listCodes() {
      // Paged: every code ever issued has to be seen, or an old one could be reused.
      const rows = await readAllRows<{ staff_id: string | null; kind: "qr" | "pin"; code: string; turned_off_at: string | null }>((from, to) =>
        codeTable().select("staff_id, kind, code, turned_off_at").eq("member_id", memberId).order("created_at").order("id").range(from, to),
      );
      return rows.map((r): CodeRow => ({ staffId: r.staff_id, kind: r.kind, code: r.code, active: r.turned_off_at === null }));
    },
    async insertStaff(name, key) {
      const { error } = await staffTable().insert({ member_id: memberId, name, name_key: key });
      return saved(error);
    },
    async setRemoved(staffId, removed) {
      const { error } = await staffTable()
        .update({ removed_at: removed ? now() : null })
        .eq("member_id", memberId)
        .eq("id", staffId);
      mustSave(error);
    },
    async renameStaff(staffId, name, key) {
      const { error } = await staffTable().update({ name, name_key: key }).eq("member_id", memberId).eq("id", staffId);
      return saved(error);
    },
    async turnOffCodes(staffId, kind) {
      let query = codeTable().update({ turned_off_at: now() }).eq("member_id", memberId).eq("staff_id", staffId).is("turned_off_at", null);
      if (kind) query = query.eq("kind", kind);
      const { error } = await query;
      mustSave(error);
    },
    async insertCode(staffId, kind, code) {
      const { error } = await codeTable().insert({ member_id: memberId, staff_id: staffId, kind, code });
      return saved(error);
    },
    async recordOldCounter(code) {
      const { error } = await codeTable().insert({ member_id: memberId, staff_id: null, kind: "qr", code, turned_off_at: now() });
      saved(error); // a clash means an earlier try already recorded it
    },
    async swapCounterQr(from, to) {
      const { data, error } = await plateTable()
        .update({ staff_qr: to, updated_at: now() })
        .eq("member_id", memberId)
        .eq("staff_qr", from)
        .select("member_id");
      if (saved(error) === "clash") return "clash";
      return (data ?? []).length === 1 ? "ok" : "changed";
    },
    qrTaken: (code) => qrTaken(service, code),
    async setSharedCode(code, onlyIfNow) {
      let query = plateTable().update({ staff_code: code, updated_at: now() }).eq("member_id", memberId);
      if (onlyIfNow !== undefined) query = query.eq("staff_code", onlyIfNow);
      const { error } = await query;
      mustSave(error);
    },
    async setSharedOff(off) {
      const { error } = await plateTable().update({ staff_code_off: off, updated_at: now() }).eq("member_id", memberId);
      mustSave(error);
    },
  };
}

/** Checks the caller first, then makes the change (if any) and returns the codes as they are now. */
async function ownerAction(memberId: string, change?: (store: StaffCodesStore) => Promise<void>): Promise<StaffCodesView> {
  const { service } = await requireTapCardOwner(memberId);
  const store = staffCodesStore(service, memberId);
  if (change) await change(store);
  return staffCodesView(store, resolveEmailSiteUrl(currentRequestUrl()));
}

export const getStaffCodes = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId));

export const makeStaffCodes = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; name: string }) => ({ memberId: String(data?.memberId ?? ""), name: String(data?.name ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => makeStaffCodesCore(store, data.name)));

export const replaceStaffCode = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; staffId: string; kind: "qr" | "pin" }) => ({
    memberId: String(data?.memberId ?? ""),
    staffId: String(data?.staffId ?? ""),
    kind: data?.kind === "qr" || data?.kind === "pin" ? data.kind : null,
  }))
  .handler(
    async ({ data }): Promise<StaffCodesView> =>
      ownerAction(data.memberId, async (store) => {
        if (!data.kind) throw new Error("Choose a QR code or a 4-digit code.");
        await replaceStaffCodeCore(store, data.staffId, data.kind);
      }),
  );

/** Both of a person's codes stop working; their name stays in the list. */
export const turnOffStaff = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; staffId: string }) => ({ memberId: String(data?.memberId ?? ""), staffId: String(data?.staffId ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => turnOffStaffCore(store, data.staffId)));

export const renameStaff = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; staffId: string; name: string }) => ({
    memberId: String(data?.memberId ?? ""),
    staffId: String(data?.staffId ?? ""),
    name: String(data?.name ?? ""),
  }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => renameStaffCore(store, data.staffId, data.name)));

export const removeStaff = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; staffId: string }) => ({ memberId: String(data?.memberId ?? ""), staffId: String(data?.staffId ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => removeStaffCore(store, data.staffId)));

/** A copied or lost behind-the-counter QR: a new one; the old one stops working at once. */
export const resetCounterQr = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, resetCounterQrCore));

export const saveSharedCode = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; code: string }) => ({ memberId: String(data?.memberId ?? ""), code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => saveSharedCodeCore(store, data.code)));

export const setSharedCodeOff = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; off: boolean }) => ({ memberId: String(data?.memberId ?? ""), off: data?.off === true }))
  .handler(async ({ data }): Promise<StaffCodesView> => ownerAction(data.memberId, (store) => setSharedCodeOffCore(store, data.off)));
