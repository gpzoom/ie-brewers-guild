import { createServerFn } from "@tanstack/react-start";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { validateTemplate } from "@/lib/tap-card/loyalty";

/**
 * Guild > Tap Card > Templates. Starting points for breweries' loyalty
 * rewards. A brewery copies one into its own offer and can change every word;
 * nothing links back, so editing or hiding a template never changes an offer.
 */
export type OfferTemplate = { id: string; title: string; reward: string; terms: string; hidden: boolean; sortOrder: number };

export const listOfferTemplates = createServerFn({ method: "GET" }).handler(async (): Promise<OfferTemplate[]> => {
  const { service } = await requireTapCardGuildAdmin();
  const { data, error } = await service
    .from("tap_card_offer_templates")
    .select("id, title, reward, terms, hidden, sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({ id: t.id, title: t.title, reward: t.reward, terms: t.terms, hidden: t.hidden, sortOrder: t.sort_order }));
});

export const saveOfferTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string | null; title: string; reward: string; terms: string }) => ({
    id: typeof data?.id === "string" && data.id ? data.id : null,
    title: String(data?.title ?? ""),
    reward: String(data?.reward ?? ""),
    terms: String(data?.terms ?? ""),
  }))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { service } = await requireTapCardGuildAdmin();
    const checked = validateTemplate(data);
    if (!checked.ok) throw new Error(checked.message);
    if (data.id) {
      const { error } = await service.from("tap_card_offer_templates").update(checked.value).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: last } = await service
      .from("tap_card_offer_templates")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await service
      .from("tap_card_offer_templates")
      .insert({ ...checked.value, sort_order: (last?.sort_order ?? -1) + 1 })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Couldn't save the template.");
    return { id: row.id };
  });

export const setTemplateHidden = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; hidden: boolean }) => ({ id: String(data?.id ?? ""), hidden: data?.hidden === true }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    const { error } = await service.from("tap_card_offer_templates").update({ hidden: data.hidden }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Swaps a template with its neighbor (renumbering all, so equal sort orders can't stick). */
export const moveOfferTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; direction: "up" | "down" }) => ({
    id: String(data?.id ?? ""),
    direction: data?.direction === "up" ? ("up" as const) : ("down" as const),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    const { data: rows, error } = await service.from("tap_card_offer_templates").select("id").order("sort_order").order("created_at");
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    const i = ids.indexOf(data.id);
    const j = data.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) {
      const { error: updateError } = await service.from("tap_card_offer_templates").update({ sort_order: k }).eq("id", ids[k]);
      if (updateError) throw new Error(updateError.message);
    }
    return { ok: true };
  });
