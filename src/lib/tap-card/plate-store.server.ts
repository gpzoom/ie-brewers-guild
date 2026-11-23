import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCardCode } from "@/lib/tap-card/card-code";
import type { PersonalPin } from "@/lib/tap-card/staff-codes";
import { freshQr } from "@/lib/tap-card/staff-codes-core";

/**
 * Plate rows, for plate.server.ts and staff-codes.server.ts. Callers check
 * permission first. No createServerFn here; client code must never import it.
 */

/** A database failure: the details go to the server log, not the screen. */
export function dbFailed(error: { message: string }): Error {
  console.error("Scan Pass plate: database error", error.message);
  return new Error("That didn't work. Try again.");
}

/** Whether any named code (working or not) or any member's counter QR has this code. */
export async function qrTaken(service: SupabaseClient, code: string): Promise<boolean> {
  const [named, counter] = await Promise.all([
    service.from("tap_card_staff_codes").select("id").eq("kind", "qr").eq("code", code).maybeSingle(),
    service.from("tap_card_plates").select("member_id").eq("staff_qr", code).maybeSingle(),
  ]);
  if (named.error) throw dbFailed(named.error);
  if (counter.error) throw dbFailed(counter.error);
  return named.data !== null || counter.data !== null;
}

/** The member's personal 4-digit codes that work now (at most one per person; never a removed person's). */
export async function loadPersonalPins(service: SupabaseClient, memberId: string): Promise<PersonalPin[]> {
  const codes = await service
    .from("tap_card_staff_codes")
    .select("id, staff_id, code")
    .eq("member_id", memberId)
    .eq("kind", "pin")
    .is("turned_off_at", null);
  if (codes.error) throw dbFailed(codes.error);
  if (codes.data.length === 0) return [];
  const people = await service
    .from("tap_card_staff")
    .select("id")
    .eq("member_id", memberId)
    .in("id", codes.data.map((c) => c.staff_id))
    .is("removed_at", null);
  if (people.error) throw dbFailed(people.error);
  const here = new Set(people.data.map((p) => p.id));
  return codes.data.filter((c) => here.has(c.staff_id)).map((c) => ({ codeId: c.id, staffId: c.staff_id, code: c.code, active: true }));
}

/** How many of the member's personal 4-digit codes work now. */
export async function activePinCount(service: SupabaseClient, memberId: string): Promise<number> {
  return (await loadPersonalPins(service, memberId)).length;
}

export type PlateRow = { code: string; staffCode: string | null; staffQr: string; sharedOff: boolean };

/** A brewery's plate, made on first use (codes are random; a clash just tries again). */
export async function ensurePlate(service: SupabaseClient, memberId: string): Promise<PlateRow> {
  const newStaffQr = () => freshQr((code) => qrTaken(service, code));
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await service
      .from("tap_card_plates")
      .select("code, staff_code, staff_qr, staff_code_off")
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) throw dbFailed(error);
    if (data?.staff_qr) return { code: data.code, staffCode: data.staff_code, staffQr: data.staff_qr, sharedOff: data.staff_code_off === true };
    if (data) {
      // A plate made before the staff QR (or before 8-character codes): give it one now.
      const { error: qrError } = await service
        .from("tap_card_plates")
        .update({ staff_qr: await newStaffQr() })
        .eq("member_id", memberId)
        .is("staff_qr", null);
      if (qrError && qrError.code !== "23505") throw dbFailed(qrError);
      continue;
    }
    const { error: insertError } = await service
      .from("tap_card_plates")
      .insert({ member_id: memberId, code: generateCardCode(), staff_qr: await newStaffQr() });
    if (insertError && insertError.code !== "23505") throw dbFailed(insertError);
  }
  throw new Error("Couldn't make the plate link. Try again.");
}
