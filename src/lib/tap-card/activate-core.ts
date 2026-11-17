import { normalizeCardCode } from "@/lib/tap-card/card-code";

/**
 * Turning on a new card: name + email + the 21+ check (spec: name and email
 * are required). The customer can do it on their own phone, or the
 * bartender can do it on the bar device after checking ID. An email that
 * already has a Tap Card account gets the new card added to it -- that's
 * how a lost card is replaced, and the history carries over.
 */
export type ActivateInput = {
  code: string;
  name: string;
  email: string;
  ageConfirmed: boolean;
  via: "customer" | "staff";
  memberId: string | null;
};

export type ActivateFieldErrors = Partial<Record<"name" | "email" | "ageConfirmed", string>>;

export type ActivateOutcome =
  | { kind: "activated"; holderId: string; joinedExisting: boolean }
  | { kind: "already-active" }
  | { kind: "unknown-card" }
  | { kind: "invalid"; errors: ActivateFieldErrors };

export type ActivateStore = {
  findCard(code: string): Promise<{ id: string; holderId: string | null } | null>;
  findHolderIdByEmail(email: string): Promise<string | null>;
  createHolder(h: {
    name: string;
    email: string;
    ageConfirmedVia: "customer" | "staff";
    activatedByMemberId: string | null;
  }): Promise<string>;
  /** Links only while the card has no holder; otherwise "already-active". */
  linkCard(cardId: string, holderId: string): Promise<"ok" | "already-active">;
};

export const NAME_MAX = 80;
const EMAIL_MAX = 320;
// Same simple shape check as the contact form and Join.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateActivation(input: Pick<ActivateInput, "name" | "email" | "ageConfirmed" | "via">): {
  name: string;
  email: string;
  errors: ActivateFieldErrors;
} {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const errors: ActivateFieldErrors = {};
  if (!name) errors.name = "Enter a name.";
  else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters or fewer.`;
  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (input.ageConfirmed !== true) {
    errors.ageConfirmed = input.via === "staff" ? "Check their ID, then tick the box." : "Please confirm you are 21 or older.";
  }
  return { name, email, errors };
}

export async function activateCore(store: ActivateStore, input: ActivateInput): Promise<ActivateOutcome> {
  const code = normalizeCardCode(input.code);
  const card = code ? await store.findCard(code) : null;
  if (!card) return { kind: "unknown-card" };
  if (card.holderId) return { kind: "already-active" };

  const { name, email, errors } = validateActivation(input);
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors };

  const existing = await store.findHolderIdByEmail(email);
  const holderId =
    existing ??
    (await store.createHolder({ name, email, ageConfirmedVia: input.via, activatedByMemberId: input.memberId }));
  const linked = await store.linkCard(card.id, holderId);
  if (linked === "already-active") return { kind: "already-active" };
  return { kind: "activated", holderId, joinedExisting: existing !== null };
}
