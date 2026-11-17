import type { FillField } from "@/lib/google/fill-patch";

export type FillSummary = {
  filled: FillField[];
  kept: FillField[];
  permanentlyClosed: boolean;
};

/**
 * "Fill from Google" reloads the page after a fill so every field shows the
 * new draft values. The "Filled / Kept yours" summary rides across that
 * reload in sessionStorage, keyed by member, and is read once.
 */
const key = (memberId: string) => `fill-from-google-summary:${memberId}`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function stashFillSummary(
  memberId: string,
  summary: FillSummary,
  store: StorageLike | null = storage(),
): void {
  try {
    store?.setItem(key(memberId), JSON.stringify(summary));
  } catch {
    // Storage blocked: the page still reloads, just without the summary line.
  }
}

/** The summary saved before the reload for this member, removed as it's read. */
export function takeFillSummary(
  memberId: string,
  store: StorageLike | null = storage(),
): FillSummary | null {
  try {
    const raw = store?.getItem(key(memberId));
    if (!raw) return null;
    store?.removeItem(key(memberId));
    const parsed = JSON.parse(raw) as Partial<FillSummary>;
    if (!Array.isArray(parsed.filled) || !Array.isArray(parsed.kept)) return null;
    return {
      filled: parsed.filled,
      kept: parsed.kept,
      permanentlyClosed: parsed.permanentlyClosed === true,
    };
  } catch {
    return null;
  }
}
