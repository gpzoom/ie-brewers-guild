import { pickOwnerLevelUserIds } from "@/lib/members/account-user";

export type BroadcastAudience =
  | { type: "all" }
  | {
      type: "type_or_category";
      memberType: "producer" | "mobile" | "allied" | null;
      categoryId: string | null;
    }
  | { type: "members"; memberIds: string[] };

export type AudienceMember = {
  id: string;
  business_name: string;
  member_type: string;
  status: string;
  categoryIds: string[];
};

export type AudienceUserRow = {
  member_id: string;
  user_id: string;
  role: string | null;
  created_at: string;
};

const ACTIVE_STATUSES = new Set(["published", "draft"]);

/** Active members (published or draft) that the audience selects. */
export function matchMembers(members: AudienceMember[], audience: BroadcastAudience): AudienceMember[] {
  const active = members.filter((m) => ACTIVE_STATUSES.has(m.status));
  switch (audience.type) {
    case "all":
      return active;
    case "members": {
      const ids = new Set(audience.memberIds);
      return active.filter((m) => ids.has(m.id));
    }
    case "type_or_category": {
      const { memberType, categoryId } = audience;
      if (!memberType && !categoryId) return [];
      return active.filter(
        (m) =>
          (!memberType || m.member_type === memberType) &&
          (!categoryId || m.categoryIds.includes(categoryId)),
      );
    }
  }
}

/**
 * One recipient per person: owner + every co-owner of each matched member,
 * minus unsubscribed users, deduped by user id and by lowercased email.
 * A member whose rows hold no owner/co-owner (editor-only) yields nobody,
 * even though pickOwnerLevelUserIds would fall back to its first row.
 */
export function buildRecipients(
  matched: AudienceMember[],
  userRows: AudienceUserRow[],
  emailsByUserId: Map<string, string | null>,
  unsubscribed: Set<string>,
): { recipients: { userId: string; email: string }[]; memberCount: number; unsubscribedCount: number } {
  const rowsByMember = new Map<string, AudienceUserRow[]>();
  for (const r of userRows) {
    const list = rowsByMember.get(r.member_id) ?? [];
    list.push(r);
    rowsByMember.set(r.member_id, list);
  }

  const recipients: { userId: string; email: string }[] = [];
  const seenUsers = new Set<string>();
  const seenEmails = new Set<string>();
  const unsubscribedSeen = new Set<string>();

  for (const member of matched) {
    const rows = (rowsByMember.get(member.id) ?? [])
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    // Editor-only (or media_events-only) members have no owner-level user.
    if (!rows.some((r) => r.role === "owner" || r.role === "co_owner")) continue;
    for (const userId of pickOwnerLevelUserIds(rows)) {
      if (seenUsers.has(userId)) continue;
      if (unsubscribed.has(userId)) {
        unsubscribedSeen.add(userId);
        continue;
      }
      const email = emailsByUserId.get(userId)?.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seenEmails.has(key)) continue;
      seenUsers.add(userId);
      seenEmails.add(key);
      recipients.push({ userId, email });
    }
  }

  return { recipients, memberCount: matched.length, unsubscribedCount: unsubscribedSeen.size };
}

const TYPE_LABELS: Record<"producer" | "mobile" | "allied", string> = {
  producer: "Producers",
  mobile: "Mobile members",
  allied: "Affiliate Members",
};

export function audienceLabel(
  audience: BroadcastAudience,
  _memberNames: Map<string, string>,
  categoryNames: Map<string, string>,
): string {
  switch (audience.type) {
    case "all":
      return "All members";
    case "members": {
      const n = audience.memberIds.length;
      return `${n} picked member${n === 1 ? "" : "s"}`;
    }
    case "type_or_category": {
      const parts: string[] = [];
      if (audience.memberType) parts.push(TYPE_LABELS[audience.memberType]);
      if (audience.categoryId) parts.push(categoryNames.get(audience.categoryId) ?? "Category");
      return parts.join(" · ");
    }
  }
}
