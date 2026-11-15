/**
 * Pure: decides what "Fill from Google" writes into a member's draft.
 * It only ever fills EMPTY fields; anything the member already has is kept.
 */
import type { BasicsDraft, LinksDraft } from "@/lib/drafts/sections";
import type { PlaceProfile } from "@/lib/google/place-profile";

export type FillField = "address" | "phone" | "tagline" | "hours" | "website";

export type FillPatch = {
  basics: Partial<BasicsDraft>;
  /** The whole links list to save, or null when links are unchanged. */
  links: LinksDraft | null;
  filled: FillField[];
  kept: FillField[];
};

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function computeFillPatch(
  basics: BasicsDraft,
  links: LinksDraft,
  profile: PlaceProfile,
): FillPatch {
  const patch: Partial<BasicsDraft> = {};
  let linksOut: LinksDraft | null = null;
  const filled: FillField[] = [];
  const kept: FillField[] = [];

  // Address: one block, only when Google has a street address.
  if (hasText(profile.street_address)) {
    if (hasText(basics.street_address)) {
      kept.push("address");
    } else {
      patch.street_address = profile.street_address;
      if (profile.city) patch.city = profile.city;
      if (profile.state) patch.state = profile.state;
      patch.postal_code = profile.postal_code;
      patch.latitude = profile.latitude;
      patch.longitude = profile.longitude;
      filled.push("address");
    }
  }

  if (hasText(profile.phone)) {
    if (hasText(basics.phone)) kept.push("phone");
    else {
      patch.phone = profile.phone;
      filled.push("phone");
    }
  }

  if (hasText(profile.tagline)) {
    if (hasText(basics.tagline)) kept.push("tagline");
    else {
      patch.tagline = profile.tagline;
      filled.push("tagline");
    }
  }

  if (profile.hours && profile.hours.length > 0) {
    if (basics.hours.length > 0) kept.push("hours");
    else {
      patch.hours = profile.hours;
      filled.push("hours");
    }
  }

  if (hasText(profile.website)) {
    if (links.links.some((l) => l.kind === "website")) kept.push("website");
    else {
      linksOut = {
        links: [
          ...links.links,
          { kind: "website", label: null, url: profile.website as string, sort_order: links.links.length },
        ],
      };
      filled.push("website");
    }
  }

  return { basics: patch, links: linksOut, filled, kept };
}
