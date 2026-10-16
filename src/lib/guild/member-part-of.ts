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

/**
 * Add member's Part of select: what it shows and what it sends.
 * `choice` is the admin's pick by hand (null = untouched). Untouched, it
 * follows the typed name (trimmed, case-sensitive, like the database's
 * name rule): a business with that name, else the first single location
 * with it ("Group with …"), else None. Sends `undefined` -- leave it to the
 * name rule -- only when untouched and nothing matched; otherwise the
 * selection ("" is null, a real "no business").
 */
export function addMemberPartOf(input: {
  typedName: string;
  businesses: { id: string; name: string }[];
  singles: { id: string; name: string }[];
  choice: string | null;
}): { selected: string; send: string | null | undefined } {
  if (input.choice !== null) {
    return { selected: input.choice, send: input.choice === "" ? null : input.choice };
  }
  const name = input.typedName.trim();
  const matched =
    input.businesses.find((b) => b.name === name)?.id ??
    input.singles.find((s) => s.name === name)?.id ??
    null;
  return matched ? { selected: matched, send: matched } : { selected: "", send: undefined };
}
