/**
 * Logo uploads are stored as `<memberId>/logo-<uuid>-<name>` in the public
 * member-logos bucket (logo.server.ts); gallery and creator uploads never
 * start with "logo-". Returns a SQL LIKE pattern matching only the logo
 * files, so gallery listings can leave them out -- a logo belongs in the logo
 * slot only, shows as a broken thumbnail through /api/admin-media (which
 * reads member-media), and can't be used as a cover or slide.
 */
export function logoStoragePathPattern(memberId: string): string {
  return `${memberId}/logo-%`;
}
