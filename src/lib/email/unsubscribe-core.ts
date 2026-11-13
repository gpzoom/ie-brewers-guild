import { verifyUnsubscribeToken } from "./unsubscribe-token";

/** Storage for broadcast_unsubscribes, injected so the logic is unit-testable. */
export interface UnsubscribeStore {
  isUnsubscribed(userId: string): Promise<boolean>;
  addUnsubscribe(userId: string): Promise<void>;
  removeUnsubscribe(userId: string): Promise<void>;
}

/** Read-only: safe for a mail scanner's prefetch of the link. */
export async function checkUnsubscribeCore(args: {
  token: string;
  secret: string;
  store: UnsubscribeStore;
}): Promise<{ valid: boolean; unsubscribed: boolean }> {
  const v = await verifyUnsubscribeToken(args.token, args.secret);
  if (!v.valid) return { valid: false, unsubscribed: false };
  return { valid: true, unsubscribed: await args.store.isUnsubscribed(v.userId) };
}

export async function setSubscriptionCore(args: {
  token: string;
  subscribed: boolean;
  secret: string;
  store: UnsubscribeStore;
}): Promise<{ ok: boolean }> {
  const v = await verifyUnsubscribeToken(args.token, args.secret);
  if (!v.valid) return { ok: false };
  if (args.subscribed) await args.store.removeUnsubscribe(v.userId);
  else await args.store.addUnsubscribe(v.userId);
  return { ok: true };
}

/** RFC 8058 one-click: POST body must be `List-Unsubscribe=One-Click`. */
export async function oneClickUnsubscribeCore(args: {
  token: string;
  body: { contentType: string | null; text: () => Promise<string> };
  secret: string;
  store: UnsubscribeStore;
}): Promise<{ status: 200 | 400; text: string }> {
  const bad = { status: 400 as const, text: "Bad request" };
  let value: string | null = null;
  try {
    const raw = await args.body.text();
    const type = (args.body.contentType ?? "").toLowerCase();
    if (type.startsWith("application/x-www-form-urlencoded")) {
      value = new URLSearchParams(raw).get("List-Unsubscribe");
    } else if (type.startsWith("multipart/form-data")) {
      // The part's Content-Disposition line, any further part headers
      // (Content-Type, ...), a blank line, then the value.
      const m = raw.match(/name="List-Unsubscribe"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([^\r\n]*)/);
      value = m ? m[1] : null;
    }
  } catch {
    return bad;
  }
  if (value !== "One-Click") return bad;
  const r = await setSubscriptionCore({ token: args.token, subscribed: false, secret: args.secret, store: args.store });
  return r.ok ? { status: 200, text: "Unsubscribed" } : bad;
}

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "broadcast_unsubscribes") => any;
};

/** Store backed by the service-role Supabase client. */
export function supabaseUnsubscribeStore(supabase: SupabaseLike): UnsubscribeStore {
  return {
    async isUnsubscribed(userId) {
      const { data, error } = await supabase
        .from("broadcast_unsubscribes")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
    async addUnsubscribe(userId) {
      const { error } = await supabase.from("broadcast_unsubscribes").upsert({ user_id: userId }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },
    async removeUnsubscribe(userId) {
      const { error } = await supabase.from("broadcast_unsubscribes").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}
