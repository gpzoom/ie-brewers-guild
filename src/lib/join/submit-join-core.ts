/**
 * The Join form's submit, minus the I/O so it's testable (join.server.ts
 * wires Supabase, Google and the emails). Input is already validated.
 *
 * - Google details are fetched first (by place id, never from the browser),
 *   so the already-a-member check also covers Google's city. A permanently
 *   closed place counts as no Google data.
 * - A business already on the roster → "already-member", nothing created.
 * - The same person's own earlier application (same owner email) → no new
 *   member and no second Guild email, just a fresh draft link.
 * - Too many Join applications in the last hour (ruling R12) → a "try
 *   later" error, nothing created.
 * - Otherwise: create the applied member, then create the login and link it
 *   as owner, email the Guild, then email the draft link.
 * - Ruling R10: an email that already has a login is NOT linked and gets no
 *   draft link. The applicant row is created unlinked and the Guild email
 *   says so, so the Guild can check and use Invite on the roster.
 *
 * Whether the email already had a login is never revealed: both cases answer
 * "check-email". An existing login is never touched; only a login this call
 * created is removed again if a later step fails. Emails never undo
 * anything once the member exists.
 */
import { JOIN_BRAKE_PER_HOUR, JOIN_BUSY } from "./join-messages";
import type { DuplicateResult } from "./duplicate-check";
import type { JoinInput } from "./join-validation";
import type { PlaceProfile } from "@/lib/google/place-profile";

export type { JoinInput, JoinFieldErrors } from "./join-validation";

export type JoinDeps = {
  findDuplicate(input: {
    businessName: string;
    city: string;
    googleCity: string | null;
    placeId: string | null;
    email: string;
  }): Promise<DuplicateResult>;
  getProfile(placeId: string): Promise<PlaceProfile>;
  /** Join applications created in the last hour (ruling R12's brake). */
  countRecentApplications(): Promise<number>;
  createApplicant(input: JoinInput, profile: PlaceProfile | null): Promise<string /* memberId */>;
  /** Creates a login for a new email; an email that already has one is left alone ({ created: false }). */
  createUserIfNew(email: string): Promise<{ created: true; userId: string } | { created: false }>;
  linkOwner(memberId: string, userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  deleteMember(memberId: string): Promise<void>;
  sendGuildEmail(memberId: string, existingLogin: boolean): Promise<void>;
  sendDraftLink(email: string, businessName: string): Promise<void>;
};

export type JoinOutcome = { kind: "check-email" } | { kind: "already-member" } | { kind: "error"; message: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function sendDraftLinkLogged(deps: JoinDeps, input: JoinInput) {
  try {
    await deps.sendDraftLink(input.email, input.businessName);
  } catch (err) {
    console.error("submitJoin: the draft link email failed", errorMessage(err));
  }
}

export async function submitJoinCore(deps: JoinDeps, input: JoinInput): Promise<JoinOutcome> {
  // A failed lookup (no key, Google down) doesn't stop the application: it's
  // created from the typed fields.
  let profile: PlaceProfile | null = null;
  if (input.placeId) {
    try {
      profile = await deps.getProfile(input.placeId);
    } catch (err) {
      console.error("submitJoin: Google details lookup failed; continuing without it", errorMessage(err));
    }
  }
  // A permanently closed place gives no data and isn't linked to the application
  // (the duplicate check below still uses its id).
  const closedPlace = profile?.permanentlyClosed === true;
  if (closedPlace) profile = null;

  const duplicate = await deps.findDuplicate({
    businessName: input.businessName,
    city: input.city,
    googleCity: profile?.city || null,
    placeId: input.placeId,
    email: input.email,
  });
  if (duplicate.kind === "existing") return { kind: "already-member" };
  if (duplicate.kind === "own-application") {
    await sendDraftLinkLogged(deps, input);
    return { kind: "check-email" };
  }

  if ((await deps.countRecentApplications()) > JOIN_BRAKE_PER_HOUR) {
    return { kind: "error", message: JOIN_BUSY };
  }

  const memberId = await deps.createApplicant(closedPlace ? { ...input, placeId: null } : input, profile);

  let user: { created: true; userId: string } | { created: false } | null = null;
  try {
    user = await deps.createUserIfNew(input.email);
    if (user.created) await deps.linkOwner(memberId, user.userId);
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

  const existingLogin = !user.created;
  try {
    await deps.sendGuildEmail(memberId, existingLogin);
  } catch (err) {
    console.error("submitJoin: the Guild's application email failed", errorMessage(err));
  }
  if (!existingLogin) await sendDraftLinkLogged(deps, input);

  return { kind: "check-email" };
}
