import type { MemberType } from "@/lib/supabase/types";

export type MemberFieldKey = "street_address" | "service_area" | "lead_time" | "contact_email" | "discount";

const FIELDS_BY_TYPE: Record<MemberType, MemberFieldKey[]> = {
  producer: ["street_address"],
  mobile: ["service_area"],
  allied: ["street_address", "service_area", "lead_time", "contact_email", "discount"],
};

/**
 * Which type-specific fields render for a given member_type (spec, "Member
 * types" comparison table). This controls what's SHOWN only -- the mutation
 * layer (member-basics.server.ts) never nulls out a hidden field on a type
 * switch, only on an explicit edit of that field itself, which is what
 * actually satisfies "switching type must never delete data."
 */
export function visibleFieldsForMemberType(memberType: MemberType): MemberFieldKey[] {
  return FIELDS_BY_TYPE[memberType];
}

export function isFieldVisibleForMemberType(memberType: MemberType, field: MemberFieldKey): boolean {
  return FIELDS_BY_TYPE[memberType].includes(field);
}

export const LOCATION_FIELD_LABEL: Record<MemberType, string> = {
  producer: "Street address",
  mobile: "Service area",
  allied: "Warehouse address",
};
