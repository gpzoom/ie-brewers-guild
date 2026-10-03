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

/**
 * The slug for one of a business's locations, matching
 * scripts/import-existing-members.ts's own algorithm exactly: a
 * multi-location business's rows are suffixed with that location's city
 * (`left-coast-brewing-co-irvine`), a single-location business's is not.
 * Anywhere in the app that links to a member profile from site.ts data
 * (which has no notion of the real database row per location) must go
 * through this function rather than bare `slugify(businessName)`, or the
 * link 404s for every multi-location business -- there is no row at the
 * bare business-name slug once a business has more than one location.
 */
export function locationSlug(businessName: string, city: string, multiLocation: boolean): string {
  const base = slugify(businessName);
  return multiLocation ? `${base}-${slugify(city)}` : base;
}
