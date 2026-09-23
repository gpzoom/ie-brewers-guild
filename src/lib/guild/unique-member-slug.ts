/**
 * Returns `base`, or `base-2`, `base-3`, ... on collision (spec, "Once
 * issued a slug never changes, or shared links break" -- this is the
 * collision half of that rule, for a roster row created one at a time,
 * not the one-time import script's own in-memory uniqueSlug() -- that
 * function's uniqueness set is a single import batch, not the live table
 * a one-at-a-time creation needs to check against).
 */
export function pickUnusedSlug(base: string, existingSlugs: readonly string[]): string {
  const used = new Set(existingSlugs);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
