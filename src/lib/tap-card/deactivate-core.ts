import { normalizeCardCode } from "@/lib/tap-card/card-code";

/**
 * "Turn off this card" (final review, Important #2): a lost card stops
 * working everywhere -- the card page and bar devices treat it as unknown.
 * Only the card's own holder can do it; turning off is permanent.
 */
export type DeactivateStore = {
  findCard(code: string): Promise<{ id: string; holderId: string | null; deactivated: boolean } | null>;
  deactivate(cardId: string): Promise<void>;
};

export async function deactivateCardCore(
  store: DeactivateStore,
  holderId: string,
  rawCode: string,
): Promise<{ kind: "turned-off" } | { kind: "not-yours" }> {
  const code = normalizeCardCode(rawCode);
  const card = code ? await store.findCard(code) : null;
  if (!card || card.holderId !== holderId) return { kind: "not-yours" };
  if (!card.deactivated) await store.deactivate(card.id);
  return { kind: "turned-off" };
}
