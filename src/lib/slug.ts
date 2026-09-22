/**
 * Business name -> URL slug, per the spec's own migration algorithm
 * ("Migrating the existing members"): lowercased, non-alphanumerics
 * collapsed to hyphens. Collision-suffix logic ("a numeric suffix on
 * collision") is the data-import phase's job, once it has the whole
 * roster in hand to detect collisions against -- this function only
 * produces the base slug. The data-import plan must import and reuse
 * this exact function rather than reimplementing the algorithm, so a
 * link generated anywhere else in the app resolves to the same slug the
 * import produces.
 */
export function slugify(businessName: string): string {
  return businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
