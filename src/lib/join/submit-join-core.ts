/**
 * The Join form's submit, minus the I/O so it's testable (join.server.ts
 * wires Supabase, Google and the emails). Input is already validated.
 *
 * - A business already on the roster → "already-member", nothing created.
 * - The same person's own earlier application (same owner email) → no new
 *   member and no second Guild email, just a fresh draft link.
 * - Otherwise: create the applied member, create or find the login, link it
 *   as owner, email the Guild, then email the draft link.
 *
 * Whether the email already had a login is never revealed: both cases answer
 * "check-email". Like the roster invite (invite-member-core.ts), an existing
 * login is never deleted; only a login this call created is removed again if
 * a later step fails. Emails never undo anything once the member is linked.
 */
import type { DuplicateResult } from "./duplicate-check";
import type { JoinInput } from "./join-validation";
import type { PlaceProfile } from "@/lib/google/place-profile";

export type { JoinInput, JoinFieldErrors } from "./join-validation";

export type JoinDeps = {
  findDuplicate(input: { businessName: string; city: string; placeId: string | null; email: string }): Promise<DuplicateResult>;
  getProfile(placeId: string): Promise<PlaceProfile>;
  createApplicant(input: JoinInput, profile: PlaceProfile | null): Promise<string /* memberId */>;
  createOrFindUser(email: string): Promise<{ userId: string; created: boolean }>;
  linkOwner(memberId: string, userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  deleteMember(memberId: string): Promise<void>;
  sendGuildEmail(memberId: string): Promise<void>;
  sendDraftLink(email: string, businessName: string): Promise<void>;
};

export type JoinOutcome = { kind: "check-email" } | { kind: "already-member" };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function sendDraftLinkLogged(deps: JoinDeps, input: JoinInput) {
  try {
    await deps.sendDraftLink(input.email, input.businessName);
  } catch (err) {
    console.error("submitJoin: the draft link email failed", errorMessage(err));
  }
}

export async function submitJoinCore(deps: JoinDeps, input: JoinInput): Promise<JoinOutcome> {
  const duplicate = await deps.findDuplicate({
    businessName: input.businessName,
    city: input.city,
    placeId: input.placeId,
    email: input.email,
  });
  if (duplicate.kind === "existing") return { kind: "already-member" };
  if (duplicate.kind === "own-application") {
    await sendDraftLinkLogged(deps, input);
    return { kind: "check-email" };
  }

  // Google details are re-fetched here by place id, never taken from the
  // browser. A failed lookup (no key, Google down) doesn't stop the
  // application: it's created from the typed fields.
  let profile: PlaceProfile | null = null;
  if (input.placeId) {
    try {
      profile = await deps.getProfile(input.placeId);
    } catch (err) {
      console.error("submitJoin: Google details lookup failed; continuing without it", errorMessage(err));
    }
  }

  const memberId = await deps.createApplicant(input, profile);

  let user: { userId: string; created: boolean } | null = null;
  try {
    user = await deps.createOrFindUser(input.email);
    await deps.linkOwner(memberId, user.userId);
  } catch (err) {
    if (user?.created) {
      await deps.deleteUser(user.userId).catch((rollbackErr) => {
        console.error("submitJoin: failed to roll back the new login", errorMessage(rollbackErr));
      });
    }
    await deps.deleteMember(memberId).catch((rollbackErr) => {
      console.error("submitJoin: failed to roll back the new applicant", errorMessage(rollbackErr));
    });
    throw err;
  }

  try {
    await deps.sendGuildEmail(memberId);
  } catch (err) {
    console.error("submitJoin: the Guild's application email failed", errorMessage(err));
  }
  await sendDraftLinkLogged(deps, input);

  return { kind: "check-email" };
}
