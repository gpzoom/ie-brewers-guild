/**
 * Save a text box while the member types, a moment after they pause, and
 * at once on flush (blur, or the page going away). Before this, the events
 * editor saved only on blur, so a venue typed in and then left by going
 * straight to another page was lost (owner, 2026-10-05).
 */
export function createDebouncedSave(
  save: (value: string) => void,
  delayMs: number,
  initialValue = "",
): { change: (value: string) => void; flush: () => void; cancel: () => void } {
  let lastSaved = initialValue;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending === null) return;
    const value = pending;
    pending = null;
    if (value === lastSaved) return;
    lastSaved = value;
    save(value);
  };

  return {
    change(value) {
      pending = value;
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
