/**
 * Add member's "Part of" step (spec 2026-10-15). It runs after the member
 * row is inserted, so a refusal must not fail the whole add: the member
 * exists, and a retry would create a duplicate. The error comes back as a
 * message instead, and the dialog shows it as a warning.
 */
export async function runPartOfStep(
  apply: (target: string | null) => Promise<void>,
  current: string | null,
  partOf: string | null | undefined,
): Promise<string | null> {
  if (partOf === undefined || partOf === current) return null;
  try {
    await apply(partOf);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Part of could not be saved.";
  }
}

/** The toast Add member shows once the member exists. */
export function addMemberToast(
  name: string,
  partOfError: string | null,
): { kind: "success" | "warning"; message: string } {
  if (!partOfError) return { kind: "success", message: `Added ${name}` };
  const reason = partOfError.trim().replace(/\.$/, "");
  return {
    kind: "warning",
    message: `Added ${name}, but Part of wasn't saved: ${reason}. Set it from the row's Part of… menu.`,
  };
}
