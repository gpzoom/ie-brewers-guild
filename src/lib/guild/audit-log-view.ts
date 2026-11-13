/**
 * How the super admin's Audit log screen (/guild/audit) words each row
 * (docs/member-profiles.md, "Super admin"). Pure, so it's tested on its
 * own. audit_log holds table + action (+ `details` for names that would
 * otherwise be lost); this turns that into a short sentence.
 */

import { PLAIN_LABEL } from "@/lib/portal/people";

export type AuditEntryInput = {
  tableName: string;
  action: string;
  details: Record<string, unknown> | null;
};

function detail(details: AuditEntryInput["details"], key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function roleLabel(role: string | null): string {
  if (!role) return "someone";
  return (PLAIN_LABEL as Record<string, string>)[role] ?? role;
}

/** The People-screen sentence for a row that carries `details.kind`, or null for old rows. */
function describePeopleChange(details: AuditEntryInput["details"]): string | null {
  const kind = detail(details, "kind");
  if (!kind) return null;
  const who = detail(details, "email") ?? "someone";
  switch (kind) {
    case "invite":
      return `Invited ${who} as ${roleLabel(detail(details, "role"))}`;
    case "resend":
      return `Resent the invite to ${who}`;
    case "cancel":
      return `Canceled the invite to ${who}`;
    case "remove":
      return `Removed ${who} (${roleLabel(detail(details, "role"))})`;
    case "change_access":
      return `Changed ${who} from ${roleLabel(detail(details, "fromRole"))} to ${roleLabel(detail(details, "toRole"))}`;
    case "leave":
      return `${who} left the profile`;
    default:
      return null;
  }
}

/**
 * Whether a row reads "[person], editing as [member]" (a Guild admin using
 * Edit as them). People rows store `details.impersonating`; older rows fall
 * back to whether the actor is (still) linked to the member.
 */
export function isEditingAs(
  row: { memberId: string | null; actorUserId: string; details: Record<string, unknown> | null },
  actorIsLinked: boolean,
): boolean {
  if (row.memberId === null) return false;
  const flag = row.details?.impersonating;
  if (typeof flag === "boolean") return flag;
  return !actorIsLinked;
}

const VERB: Record<string, string> = { insert: "Added", update: "Changed", delete: "Deleted" };

export function describeAuditEntry(entry: AuditEntryInput): string {
  const { tableName, action, details } = entry;
  const change = detail(details, "change");
  const email = detail(details, "email");
  switch (tableName) {
    case "member_drafts":
      return "Saved a draft change";
    case "members":
      if (action === "delete") {
        const name = detail(details, "business_name");
        return name ? `Deleted the member ${name}` : "Deleted a member";
      }
      return "Changed the live profile (publish, type or status)";
    case "media_assets":
      return action === "insert" ? "Added a photo" : action === "delete" ? "Deleted a photo" : "Changed a photo";
    case "events":
      return `${VERB[action] ?? "Changed"} an event`;
    case "calendar_connections":
      return "Changed the calendar link";
    case "upload_tokens":
      return action === "insert" ? "Made a creator upload link" : "Changed a creator upload link";
    case "member_invites":
      return describePeopleChange(details) ??
        (action === "insert" ? "Invited someone to the profile" : "Changed a profile invite");
    case "member_users":
      return describePeopleChange(details) ??
        (action === "delete" ? "Removed someone's access to the profile" : "Changed someone's access");
    case "support_requests":
      return "Asked the Guild for a type change";
    case "auth.users":
      return "Changed the member's sign-in email";
    case "broadcast_emails":
      return "Broadcast email sent";
    case "profiles":
    case "guild_admin_invites":
      if (change && email) return `${change[0].toUpperCase()}${change.slice(1)}: ${email}`;
      return tableName === "profiles" ? "Changed Guild admin access" : "Changed a Guild admin invite";
    default:
      return `${VERB[action] ?? action} ${tableName.replace(/_/g, " ")}`;
  }
}
