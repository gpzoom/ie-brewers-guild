/**
 * A member puts itself on the Beer Trail (owner, 2026-11-23): the checkbox at
 * the top of Portal/Admin > Scan Pass. It only adds. Coming off the trail is
 * the Guild's call (Roster), because customers have paid for a pass that lists
 * this stop.
 */
export type TrailOptInStatus = { producer: boolean; onTrail: boolean; published: boolean };

export type TrailOptInStore = {
  /** Null when the member doesn't exist. */
  find(memberId: string): Promise<(TrailOptInStatus & { businessName: string; city: string | null }) | null>;
  /** Turns the trail on; false when it was already on (a double click, or the Guild got there first). */
  addToTrail(memberId: string): Promise<boolean>;
  notifyGuild(p: { memberId: string; businessName: string; city: string | null; published: boolean }): Promise<void>;
};

export async function joinTrailCore(store: TrailOptInStore, memberId: string): Promise<TrailOptInStatus> {
  const member = await store.find(memberId);
  if (!member) throw new Error("Member not found.");
  if (!member.producer) throw new Error("Only taproom members can be Beer Trail stops.");
  const { published } = member;
  if (!member.onTrail && (await store.addToTrail(memberId))) {
    // A failed email never undoes or fails the opt-in.
    try {
      await store.notifyGuild({ memberId, businessName: member.businessName, city: member.city, published });
    } catch (err) {
      console.error("Beer Trail opt-in: Guild email failed", err);
    }
  }
  return { producer: true, onTrail: true, published };
}
