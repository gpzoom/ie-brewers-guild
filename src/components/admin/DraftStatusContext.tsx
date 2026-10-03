import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { saveDraftSection, type DraftStatus } from "@/lib/drafts/drafts.server";
import { computeTopBarState, type DraftSection } from "@/lib/drafts/sections";
import { draftQueueKey, draftSaveQueue } from "@/lib/drafts/save-queue";

/**
 * Shares the draft's state (what's unpublished, what the viewer may
 * publish) between the /admin top bar and the editors under it.
 *
 * The /admin layout's loader (getDraftStatus) is the starting point. An
 * editor's save response already says which sections are now dirty, so
 * the top bar updates from that directly -- autosaves deliberately do NOT
 * call router.invalidate(): re-running loaders on every keystroke-save is
 * costly and would hand the editors a draft snapshot older than what they
 * hold locally. Publish and discard fetch a fresh getDraftStatus
 * themselves and pass it in with `setStatus`, then invalidate everything.
 *
 * `epoch` changes after a discard: the editors keep their own local copies
 * of what they're editing (uncontrolled inputs, optimistic lists), so the
 * layout remounts them from the freshly reloaded draft instead.
 */

type DraftStatusContextValue = {
  status: DraftStatus;
  epoch: number;
  reportSaved: (section: DraftSection, dirtySections: DraftSection[]) => void;
  setStatus: (status: DraftStatus) => void;
  bumpEpoch: () => void;
};

const DraftStatusContext = createContext<DraftStatusContextValue | null>(null);

export function DraftStatusProvider({
  initial,
  children,
}: {
  initial: DraftStatus;
  children: ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);
  const [override, setOverride] = useState<DraftStatus | null>(null);

  // A fresh loader result replaces any local override.
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setOverride(null);
  }
  const status = override ?? initial;

  const reportSaved = useCallback(
    (section: DraftSection, dirtySections: DraftSection[]) => {
      setOverride((prev) => {
        const base = prev ?? initial;
        return {
          ...base,
          ...computeTopBarState({ role: base.role, status: base.status, dirty: dirtySections }),
          dirtySections,
          // The viewer's own photo save makes them the last one to touch
          // photos, so "Photo changes from [someone else]" no longer applies.
          photoChangesFrom: section === "media" ? null : base.photoChangesFrom,
        };
      });
    },
    [initial],
  );

  const bumpEpoch = useCallback(() => setEpoch((n) => n + 1), []);

  const value = useMemo(
    () => ({ status, epoch, reportSaved, setStatus: setOverride, bumpEpoch }),
    [status, epoch, reportSaved, bumpEpoch],
  );
  return <DraftStatusContext.Provider value={value}>{children}</DraftStatusContext.Provider>;
}

export function useDraftStatus(): DraftStatusContextValue | null {
  return useContext(DraftStatusContext);
}

/**
 * How many draft saves are queued or running for this member (optionally
 * one section). Editors use it to skip a loader re-sync while their own
 * saves are still in flight; the top bar uses it to show "Saving…".
 */
export function usePendingDraftSaves(memberId: string, section?: DraftSection): number {
  const prefix = section ? draftQueueKey(memberId, section) : `${memberId}:`;
  return useSyncExternalStore(
    draftSaveQueue.subscribe,
    () => draftSaveQueue.pending(prefix),
    () => 0,
  );
}

/** Non-hook read of the same count, for use inside effects. */
export function hasPendingDraftSaves(memberId: string, section: DraftSection): boolean {
  return draftSaveQueue.pending(draftQueueKey(memberId, section)) > 0;
}

type Patch = Record<string, unknown>;

/**
 * The one save path every drafted editor uses: queues the save behind any
 * earlier one for the same section (src/lib/drafts/save-queue.ts), sends it
 * to the draft, and tells the top bar. Rejects with an Error whose message
 * is safe to show, so each editor keeps its own Saving… / Saved / rollback
 * handling.
 *
 * Pass the patch as a FUNCTION when it's built from a list the editor keeps
 * in a ref: it's called when the save actually runs, so it always sends the
 * latest list (the editor updates the ref optimistically first). A plain
 * object is fine for single fields.
 */
export function useSaveDraftSection(memberId: string) {
  const context = useContext(DraftStatusContext);
  const reportSaved = context?.reportSaved;
  return useCallback(
    async (section: DraftSection, patch: Patch | (() => Patch)) => {
      const result = await draftSaveQueue.enqueue(draftQueueKey(memberId, section), () =>
        saveDraftSection({
          data: { memberId, section, patch: typeof patch === "function" ? patch() : patch },
        }),
      );
      reportSaved?.(section, result.dirtySections);
      return result;
    },
    [memberId, reportSaved],
  );
}
