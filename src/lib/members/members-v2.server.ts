import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadDirectory } from "@/lib/members/directory.server";
import { isMembersV2Host } from "@/lib/members/members-v2-gate";
import { buildV2, type V2Card, type V2Pin } from "@/lib/members/members-v2";
import { STOP_EVENT_COLUMNS, type StopEvent } from "@/lib/members/mobile-stops";
import type { MobileCategory } from "@/lib/members/mobile-category";

/**
 * Everything /members-2 shows, read with the ANON client (the public view;
 * RLS keeps it to published members and their unhidden events). Mobile
 * members' stops: from a day back (stops still on) to 15 days out.
 */
export const getMembersV2Data = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ enabled: false } | { enabled: true; cards: V2Card[]; pins: V2Pin[] }> => {
    if (!isMembersV2Host(getRequest().url)) return { enabled: false };
    const supabase = await getSupabaseServerClient();
    const { rows, members } = await loadDirectory(supabase);
    const mobileIds = rows.filter((r) => r.member_type === "mobile").map((r) => r.id);
    const now = new Date();

    const categoriesByMemberId = new Map<string, MobileCategory[]>();
    const stopsByMemberId = new Map<string, StopEvent[]>();
    if (mobileIds.length) {
      const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const to = new Date(now.getTime() + 15 * 24 * 3600 * 1000).toISOString();
      const [links, categories, events] = await Promise.all([
        supabase.from("member_categories").select("member_id, category_id").in("member_id", mobileIds),
        supabase.from("categories").select("id, name, slug, sort_order").eq("member_type", "mobile"),
        supabase
          .from("events")
          .select(STOP_EVENT_COLUMNS)
          .in("member_id", mobileIds)
          .eq("kind", "event")
          .or(`and(starts_at.gte.${from},starts_at.lt.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lt.${to})`),
      ]);
      const byId = new Map(
        ((categories.data ?? []) as Array<MobileCategory & { id: string }>).map((c) => [c.id, c]),
      );
      for (const link of (links.data ?? []) as Array<{ member_id: string; category_id: string }>) {
        const category = byId.get(link.category_id);
        if (!category) continue;
        const list = categoriesByMemberId.get(link.member_id) ?? [];
        list.push({ name: category.name, slug: category.slug, sort_order: category.sort_order });
        categoriesByMemberId.set(link.member_id, list);
      }
      for (const e of (events.data ?? []) as unknown as StopEvent[]) {
        const list = stopsByMemberId.get(e.member_id) ?? [];
        list.push(e);
        stopsByMemberId.set(e.member_id, list);
      }
    }

    return { enabled: true, ...buildV2({ members, rows, categoriesByMemberId, stopsByMemberId, now }) };
  },
);
