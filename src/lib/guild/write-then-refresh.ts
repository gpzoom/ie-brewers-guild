/** Shown when a write went through but re-reading the list afterwards failed. */
export const REFRESH_FAILED_TEXT = "Saved, but the list didn't refresh — reload the page.";

/**
 * Run a write, then a refresh. A failed write throws (the caller reports it as
 * failed); a failed refresh does not, so a write that succeeded is never
 * reported as failed (which invites a retry and a duplicate).
 */
export async function writeThenRefresh<T>(
  write: () => Promise<T>,
  refresh: () => Promise<void>,
): Promise<{ value: T; refreshFailed: boolean }> {
  const value = await write();
  try {
    await refresh();
  } catch {
    return { value, refreshFailed: true };
  }
  return { value, refreshFailed: false };
}
