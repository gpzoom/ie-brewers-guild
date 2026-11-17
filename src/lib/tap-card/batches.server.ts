import { createServerFn } from "@tanstack/react-start";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { generateCardCode } from "@/lib/tap-card/card-code";
import { batchCsv } from "@/lib/tap-card/batch-csv";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";

/**
 * Guild > Tap Card > Cards. A batch is a print run: N fresh codes, optionally
 * assigned to the brewery that will sell them (a card still works at every
 * stop -- the brewery only records where it was sold). The CSV links use the
 * site the admin is on, so a staging test batch opens on staging; real print
 * runs must be made on the live site.
 */
export const MAX_BATCH = 2000;

export type CardBatchSummary = {
  id: string;
  label: string;
  memberId: string | null;
  memberName: string | null;
  count: number;
  activated: number;
  isTest: boolean;
  createdAt: string;
};

export const listCardBatches = createServerFn({ method: "GET" }).handler(async (): Promise<CardBatchSummary[]> => {
  const { service } = await requireTapCardGuildAdmin();
  const { data, error } = await service
    .from("tap_card_batches")
    .select("id, label, member_id, card_count, is_test, created_at, members(business_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const batches = data ?? [];
  const activated = new Map<string, number>();
  if (batches.length > 0) {
    const { data: cards, error: cardsError } = await service
      .from("tap_cards")
      .select("batch_id")
      .in("batch_id", batches.map((b) => b.id))
      .not("activated_at", "is", null);
    if (cardsError) throw new Error(cardsError.message);
    for (const c of cards ?? []) activated.set(c.batch_id, (activated.get(c.batch_id) ?? 0) + 1);
  }
  return batches.map((b) => ({
    id: b.id,
    label: b.label,
    memberId: b.member_id,
    memberName: (b.members as unknown as { business_name: string } | null)?.business_name ?? null,
    count: b.card_count,
    activated: activated.get(b.id) ?? 0,
    isTest: b.is_test,
    createdAt: b.created_at,
  }));
});

/** Trail stops for the "Sold at" picker (published or not -- a batch can be printed before launch). */
export const listTrailBreweries = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; name: string; published: boolean }[]> => {
    const { service } = await requireTapCardGuildAdmin();
    const { data, error } = await service
      .from("members")
      .select("id, business_name, status")
      .eq("trail_eligible", true)
      .in("status", ["draft", "published"])
      .order("business_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => ({ id: m.id, name: m.business_name, published: m.status === "published" }));
  },
);

export const createCardBatch = createServerFn({ method: "POST" })
  .inputValidator((data: { label: string; memberId: string | null; count: number; isTest: boolean }) => ({
    label: typeof data?.label === "string" ? data.label.trim().slice(0, 80) : "",
    memberId: typeof data?.memberId === "string" && data.memberId ? data.memberId : null,
    count: Number(data?.count),
    isTest: data?.isTest === true,
  }))
  .handler(async ({ data }): Promise<{ batchId: string }> => {
    const { userId, service } = await requireTapCardGuildAdmin();
    if (!data.label) throw new Error("Give the batch a name.");
    if (!Number.isInteger(data.count) || data.count < 1 || data.count > MAX_BATCH) {
      throw new Error(`A batch is 1 to ${MAX_BATCH} cards.`);
    }
    const { data: batch, error } = await service
      .from("tap_card_batches")
      .insert({ label: data.label, member_id: data.memberId, card_count: data.count, is_test: data.isTest, created_by: userId })
      .select("id")
      .single();
    if (error || !batch) throw new Error(error?.message ?? "Could not create the batch.");

    // 40-bit codes: a collision is rare, but the unique index is the guard --
    // insert in chunks; a chunk that hits an existing code is refused whole
    // and the next pass makes fresh codes for whatever is still missing.
    let remaining = data.count;
    for (let attempt = 0; remaining > 0 && attempt < 10; attempt++) {
      const codes = new Set<string>();
      while (codes.size < remaining) codes.add(generateCardCode());
      const rows = [...codes].map((code) => ({ code, batch_id: batch.id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: insertError } = await service.from("tap_cards").insert(rows.slice(i, i + 500));
        if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
      }
      const { count } = await service.from("tap_cards").select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
      remaining = data.count - (count ?? 0);
    }
    if (remaining > 0) {
      await service.from("tap_card_batches").delete().eq("id", batch.id);
      throw new Error("Could not make enough unique codes. Try again.");
    }
    return { batchId: batch.id };
  });

export const downloadBatchCsv = createServerFn({ method: "POST" })
  .inputValidator((data: { batchId: string }) => ({ batchId: String(data?.batchId ?? "") }))
  .handler(async ({ data }): Promise<{ filename: string; csv: string }> => {
    const { service } = await requireTapCardGuildAdmin();
    const { data: batch, error } = await service.from("tap_card_batches").select("label").eq("id", data.batchId).maybeSingle();
    if (error || !batch) throw new Error(error?.message ?? "That batch is gone.");
    const { data: cards, error: cardsError } = await service
      .from("tap_cards")
      .select("code")
      .eq("batch_id", data.batchId)
      .order("created_at")
      .order("code")
      .limit(MAX_BATCH);
    if (cardsError) throw new Error(cardsError.message);
    const slug = batch.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "batch";
    return {
      filename: `tap-cards-${slug}.csv`,
      csv: batchCsv(resolveEmailSiteUrl(currentRequestUrl()), (cards ?? []).map((c) => c.code)),
    };
  });

/**
 * Test cleanup (staging shares the live database): deletes a TEST batch, its
 * cards, and every holder whose cards were all in it (their visits, rewards
 * and sessions go with them). Refuses a real batch.
 */
export const deleteTestBatch = createServerFn({ method: "POST" })
  .inputValidator((data: { batchId: string }) => ({ batchId: String(data?.batchId ?? "") }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    const { data: batch, error } = await service.from("tap_card_batches").select("is_test").eq("id", data.batchId).maybeSingle();
    if (error || !batch) throw new Error(error?.message ?? "That batch is gone.");
    if (!batch.is_test) throw new Error("Only test batches can be deleted.");

    const { data: cards, error: cardsError } = await service
      .from("tap_cards")
      .select("holder_id")
      .eq("batch_id", data.batchId)
      .not("holder_id", "is", null);
    if (cardsError) throw new Error(cardsError.message);
    const holderIds = [...new Set((cards ?? []).map((c) => c.holder_id as string))];
    if (holderIds.length > 0) {
      const { data: otherCards, error: otherError } = await service
        .from("tap_cards")
        .select("holder_id")
        .in("holder_id", holderIds)
        .neq("batch_id", data.batchId);
      if (otherError) throw new Error(otherError.message);
      const keep = new Set((otherCards ?? []).map((c) => c.holder_id));
      const remove = holderIds.filter((id) => !keep.has(id));
      if (remove.length > 0) {
        const { error: delHolders } = await service.from("tap_card_holders").delete().in("id", remove);
        if (delHolders) throw new Error(delHolders.message);
      }
    }
    const { error: delBatch } = await service.from("tap_card_batches").delete().eq("id", data.batchId);
    if (delBatch) throw new Error(delBatch.message);
    return { ok: true };
  });
