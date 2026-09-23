import { useState } from "react";
import {
  deleteMemberLink,
  LINK_KINDS,
  updateMemberContact,
  upsertMemberLink,
} from "@/lib/links/member-links.server";
import type { MemberLinkRow, MemberType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function friendlyMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Picks just the given keys off `obj` -- same shape as EventsEditor.tsx's
 * own pickFields, used here so onFieldChange's rollback snapshot is scoped
 * to only the fields a given patch actually touches, never the whole row.
 */
function pickFields<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = obj[key];
  return picked;
}

export function LinksContactEditor({
  memberId,
  initialLinks,
  phone,
  contactEmail,
  memberType,
}: {
  memberId: string;
  initialLinks: MemberLinkRow[];
  phone: string | null;
  contactEmail: string | null;
  memberType: MemberType;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    setError(null);
    try {
      const { id } = await upsertMemberLink({
        data: { memberId, patch: { kind: "website", url: "", sort_order: links.length } },
      });
      // Nothing is optimistically added before this resolves, so there's
      // no rollback to do on failure here -- just surface the error (same
      // shape as EventsEditor.tsx's onAdd).
      setLinks((prev) => [
        ...prev,
        { id, member_id: memberId, kind: "website", label: null, url: "", sort_order: prev.length },
      ]);
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't add a new link — try again."));
    }
  }

  /**
   * Fire-and-forget from the caller's point of view (kept that way so a
   * Select's onValueChange / an Input's onBlur don't need to be async), but
   * now rolls back on failure instead of leaving a change the server never
   * actually saved silently showing in the UI. Rollback is scoped to just
   * the fields THIS patch touched, on the link's CURRENT id, via a
   * functional setLinks update read at rollback time -- not a whole-row or
   * whole-array snapshot captured when the call started. That's the exact
   * stale-whole-array-snapshot bug this plan has already found and fixed
   * multiple times (CarouselEditor's crop-autosave, CreatorLinkPanel's
   * onRevoke, ReviewTray's onApprove/onReject, EventsEditor's
   * onFieldChange/onOverlayChange/onToggleHidden): restoring an
   * old snapshot of the WHOLE list/row would silently undo any OTHER
   * change (to this link's other fields, or to a different link entirely)
   * that succeeded while this request was still in flight.
   */
  function onFieldChange(
    link: MemberLinkRow,
    patch: Parameters<typeof upsertMemberLink>[0]["data"]["patch"],
  ) {
    setError(null);
    const previousValues = pickFields(link, Object.keys(patch) as (keyof MemberLinkRow)[]);
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...patch } : l)));
    upsertMemberLink({ data: { memberId, id: link.id, patch } }).catch((err: unknown) => {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, ...previousValues } : l)));
      setError(friendlyMessage(err, "Couldn't save that change — try again."));
    });
  }

  async function onRemove(id: string) {
    setError(null);
    // Snapshot only the ONE link being removed, off the current `links`
    // closure at call time (same shape as CreatorLinkPanel.tsx's
    // onRevoke) -- not a whole-array snapshot restored wholesale on
    // failure, which could resurrect a DIFFERENT link that was itself
    // removed (and succeeded) while this one's request was still in
    // flight.
    const removed = links.find((l) => l.id === id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteMemberLink({ data: { id } });
    } catch (err) {
      // Reinsert by id into the CURRENT list (functional update), not the
      // stale snapshot from before other things may have changed --
      // matches EventsEditor.tsx's reinsertEvent for the same reason.
      if (removed) {
        setLinks((prev) =>
          prev.some((l) => l.id === id)
            ? prev
            : [...prev, removed].sort((a, b) => a.sort_order - b.sort_order),
        );
      }
      setError(friendlyMessage(err, "Couldn't remove this link — try again."));
    }
  }

  async function onPhoneBlur(value: string) {
    setError(null);
    try {
      await updateMemberContact({ data: { memberId, patch: { phone: value || null } } });
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't save that phone number — try again."));
    }
  }

  async function onContactEmailBlur(value: string) {
    setError(null);
    try {
      await updateMemberContact({ data: { memberId, patch: { contact_email: value || null } } });
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't save that email — try again."));
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-lg font-medium text-foreground">Contact</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-phone">
              {memberType === "mobile"
                ? "Booking phone"
                : memberType === "allied"
                  ? "Sales phone"
                  : "Phone"}
            </Label>
            <Input
              id="contact-phone"
              type="tel"
              defaultValue={phone ?? ""}
              className="mt-1 h-11"
              onBlur={(e) => void onPhoneBlur(e.target.value)}
            />
          </div>
          {memberType === "allied" && (
            <div>
              <Label htmlFor="contact-email">Sales email</Label>
              <Input
                id="contact-email"
                type="email"
                defaultValue={contactEmail ?? ""}
                className="mt-1 h-11"
                onBlur={(e) => void onContactEmailBlur(e.target.value)}
              />
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Links</h2>
          <Button type="button" className="h-11" onClick={onAdd}>
            Add a link
          </Button>
        </div>
        <ul className="mt-3 space-y-3">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center"
            >
              <Select
                defaultValue={link.kind}
                onValueChange={(value) =>
                  onFieldChange(link, { kind: value as MemberLinkRow["kind"] })
                }
              >
                <SelectTrigger className="h-11 sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                defaultValue={link.url}
                placeholder="https://…"
                className="h-11 flex-1"
                onBlur={(e) => onFieldChange(link, { url: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => onRemove(link.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
