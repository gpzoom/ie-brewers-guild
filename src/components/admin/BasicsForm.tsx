import { useEffect, useRef, useState } from "react";
import { type BasicsMember, type BasicsPatch, updateMemberBasics } from "@/lib/members/member-basics.server";
import { updateMemberEmail } from "@/lib/members/member-email.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import { listIanaTimezones } from "@/lib/timezone/timezones";
import type { MemberType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEZONES = listIanaTimezones();

// Plan's Decision 6: "~400ms debounce, saves as the member types." A
// member who types then backgrounds the tab, loses connectivity, or
// navigates away without ever blurring the field still gets an autosave
// attempt fired on this timer, not just on blur.
const SAVE_DEBOUNCE_MS = 400;
const MIN_MEMBER_SINCE_YEAR = 1800;
const MAX_MEMBER_SINCE_YEAR = new Date().getFullYear() + 1;

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
const IDLE: SaveState = { status: "idle" };

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  if (state.status === "saving") {
    return <p className="mt-1 text-xs text-muted-foreground">Saving…</p>;
  }
  if (state.status === "saved") {
    return <p className="mt-1 text-xs text-open">Saved</p>;
  }
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {state.message ?? "Couldn't save — try again."}
    </p>
  );
}

/**
 * The sign-in email tied to this member's account, shown and editable
 * ONLY while a Guild admin is impersonating this member (product decision,
 * 2026-09-24 -- see member-email.server.ts's own doc comment on
 * changeMemberEmail for the full reasoning: a departed employee should
 * never be able to permanently lock a member out of, or retain access to,
 * their own account). An explicit "Update email" button, not autosave --
 * unlike every field above, a half-typed value here would otherwise get
 * committed as someone's actual login credential 400ms after a keystroke.
 */
function SignInEmailEditor({ memberId, email }: { memberId: string; email: string | null }) {
  const [value, setValue] = useState(email ?? "");
  const [status, setStatus] = useState<SaveState>(IDLE);

  async function handleUpdate() {
    setStatus({ status: "saving" });
    try {
      await updateMemberEmail({ data: { memberId, newEmail: value } });
      setStatus({ status: "saved" });
    } catch (error) {
      setStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't update the email — try again.",
      });
    }
  }

  // No member_users row yet -- this member has never been invited/claimed,
  // so there is no account to change an email ON. changeMemberEmail's own
  // server-side check would reject this the same way, but surfacing it
  // here avoids a confusing round-trip error on a button that could never
  // have worked. Use the roster's existing "Invite" action instead, which
  // is the flow that actually creates the first account+email.
  if (email === null) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4">
        <p className="text-sm text-foreground">
          This member hasn't been invited yet, so there's no sign-in email to show or change here. Use{" "}
          <strong>Invite</strong> from the Guild roster to give them their first one.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-warn/40 bg-warn/10 p-4">
      <Label htmlFor="member_email">Sign-in email</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        The email this member uses to sign in. Changing it takes effect immediately — the member will need to
        sign in with the new address from then on.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          id="member_email"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 max-w-sm"
        />
        <Button type="button" onClick={handleUpdate} disabled={status.status === "saving"} className="h-11">
          {status.status === "saving" ? "Updating…" : "Update email"}
        </Button>
      </div>
      <SaveIndicator state={status} />
    </div>
  );
}

/**
 * Every field here autosaves via its own small patch -- debounced ~400ms
 * after the last keystroke for text fields (this plan's Decision 6),
 * immediately on change for the radio/select -- never a whole-form submit.
 * That's what keeps a member-type switch from ever clobbering a hidden
 * field's stored value (this plan's Decision 6 and Global Constraint 2);
 * the server-side column allowlist in member-basics.server.ts is what
 * actually enforces it, this is just the client half of the same rule.
 */
export function BasicsForm({
  member,
  email = null,
  isImpersonating = false,
}: {
  member: BasicsMember;
  email?: string | null;
  isImpersonating?: boolean;
}) {
  const [local, setLocal] = useState(member);
  const [status, setStatus] = useState<Record<string, SaveState>>({});

  // The last value this component knows to be persisted, per field --
  // used both to skip no-op saves (tabbing through the form without
  // changing anything shouldn't fire a write) and, on a debounced field,
  // to know what to compare a keystroke against. Deliberately a ref, not
  // state: updating it must never itself trigger a re-render.
  const savedRef = useRef<BasicsMember>(member);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedStatusTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = debounceTimers.current;
    const statusTimers = savedStatusTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
      for (const timer of Object.values(statusTimers)) clearTimeout(timer);
    };
  }, []);

  function isNoOp(patch: BasicsPatch) {
    return Object.entries(patch).every(([key, value]) => savedRef.current[key as keyof BasicsMember] === value);
  }

  function performSave(field: string, patch: BasicsPatch) {
    if (isNoOp(patch)) return;

    if (savedStatusTimers.current[field]) {
      clearTimeout(savedStatusTimers.current[field]);
      delete savedStatusTimers.current[field];
    }
    setStatus((prev) => ({ ...prev, [field]: { status: "saving" } }));

    updateMemberBasics({ data: { memberId: member.id, patch } })
      .then(() => {
        savedRef.current = { ...savedRef.current, ...patch };
        setStatus((prev) => ({ ...prev, [field]: { status: "saved" } }));
        savedStatusTimers.current[field] = setTimeout(() => {
          setStatus((prev) => (prev[field]?.status === "saved" ? { ...prev, [field]: IDLE } : prev));
        }, 2000);
      })
      .catch((error: unknown) => {
        setStatus((prev) => ({
          ...prev,
          [field]: { status: "error", message: error instanceof Error ? error.message : "Couldn't save — try again." },
        }));
      });
  }

  /** Radio/select fields: no debounce, save fires on the change itself. */
  function saveNow(field: string, patch: BasicsPatch) {
    setLocal((prev) => ({ ...prev, ...patch }));
    performSave(field, patch);
  }

  /** Text fields: debounce while typing... */
  function scheduleSave(field: string, patch: BasicsPatch) {
    setLocal((prev) => ({ ...prev, ...patch }));
    if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);
    debounceTimers.current[field] = setTimeout(() => {
      delete debounceTimers.current[field];
      performSave(field, patch);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Clears a field's pending debounced save, if any. Every client-side
   * validation rejection below calls this FIRST -- otherwise an earlier,
   * still-valid keystroke's timer keeps counting down in the background
   * and fires anyway once it elapses, saving stale data while the field
   * shows a rejection (or nothing at all). That's exactly the regression
   * Finding B caught in member_since_year's range check before this
   * helper existed: type "2020" (arms a save), then keep typing to
   * "20205" (out of range) -- without canceling here, the "2020" timer
   * still fires, saves successfully, and flips the indicator to "Saved"
   * while the input reads "20205" and the DB holds "2020".
   */
  function cancelPendingSave(field: string) {
    if (debounceTimers.current[field]) {
      clearTimeout(debounceTimers.current[field]);
      delete debounceTimers.current[field];
    }
  }

  /** ...and flush immediately on blur, so leaving the field never waits out the timer. */
  function flushSave(field: string, patch: BasicsPatch) {
    cancelPendingSave(field);
    performSave(field, patch);
  }

  /**
   * business_name/city/state are conceptually NOT NULL -- guard client-side
   * too (the server rejects an empty patch value the same way, but there's
   * no reason to round-trip a request that's certain to fail, or to leave
   * the field looking silently saved while it's actually blank in the DB).
   */
  function requireNonEmpty(field: string, value: string): boolean {
    if (value.trim() !== "") return true;
    cancelPendingSave(field);
    setStatus((prev) => ({ ...prev, [field]: { status: "error", message: "Can't be empty." } }));
    return false;
  }

  /** member_since_year's client-side range guard -- see cancelPendingSave's doc comment. */
  function requireValidYear(value: number | null): boolean {
    if (value === null || (value >= MIN_MEMBER_SINCE_YEAR && value <= MAX_MEMBER_SINCE_YEAR)) return true;
    cancelPendingSave("member_since_year");
    setStatus((prev) => ({
      ...prev,
      member_since_year: {
        status: "error",
        message: `Must be between ${MIN_MEMBER_SINCE_YEAR} and ${MAX_MEMBER_SINCE_YEAR}.`,
      },
    }));
    return false;
  }

  return (
    <div className="max-w-2xl space-y-6">
      {isImpersonating && <SignInEmailEditor memberId={member.id} email={email} />}

      <div>
        <Label htmlFor="business_name">Business name</Label>
        <Input
          id="business_name"
          defaultValue={local.business_name}
          className="mt-1 h-11"
          required
          onChange={(e) => {
            if (requireNonEmpty("business_name", e.target.value)) {
              scheduleSave("business_name", { business_name: e.target.value });
            }
          }}
          onBlur={(e) => {
            if (requireNonEmpty("business_name", e.target.value)) {
              flushSave("business_name", { business_name: e.target.value });
            }
          }}
        />
        <SaveIndicator state={status.business_name ?? IDLE} />
      </div>

      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Textarea
          id="tagline"
          defaultValue={local.tagline ?? ""}
          maxLength={70}
          className="mt-1"
          onChange={(e) => scheduleSave("tagline", { tagline: e.target.value || null })}
          onBlur={(e) => flushSave("tagline", { tagline: e.target.value || null })}
        />
        <p className="mt-1 text-xs text-muted-foreground">Up to 70 characters — the one place you speak in your own words.</p>
        <SaveIndicator state={status.tagline ?? IDLE} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Member type</legend>
        <RadioGroup
          defaultValue={local.member_type}
          className="mt-2 flex flex-col gap-2"
          onValueChange={(value) => saveNow("member_type", { member_type: value as MemberType })}
        >
          {(["producer", "mobile", "allied"] as MemberType[]).map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2 rounded-md border border-border p-3">
              <RadioGroupItem value={type} id={`member_type_${type}`} />
              <span className="capitalize">{type}</span>
            </label>
          ))}
        </RadioGroup>
        <SaveIndicator state={status.member_type ?? IDLE} />
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            defaultValue={local.city}
            className="mt-1 h-11"
            required
            onChange={(e) => {
              if (requireNonEmpty("city", e.target.value)) {
                scheduleSave("city", { city: e.target.value });
              }
            }}
            onBlur={(e) => {
              if (requireNonEmpty("city", e.target.value)) {
                flushSave("city", { city: e.target.value });
              }
            }}
          />
          <SaveIndicator state={status.city ?? IDLE} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            defaultValue={local.state}
            className="mt-1 h-11"
            required
            onChange={(e) => {
              if (requireNonEmpty("state", e.target.value)) {
                scheduleSave("state", { state: e.target.value });
              }
            }}
            onBlur={(e) => {
              if (requireNonEmpty("state", e.target.value)) {
                flushSave("state", { state: e.target.value });
              }
            }}
          />
          <SaveIndicator state={status.state ?? IDLE} />
        </div>
      </div>

      {isFieldVisibleForMemberType(local.member_type, "street_address") && (
        <div>
          <Label htmlFor="street_address">{LOCATION_FIELD_LABEL[local.member_type]}</Label>
          <Input
            id="street_address"
            defaultValue={local.street_address ?? ""}
            className="mt-1 h-11"
            onChange={(e) => scheduleSave("street_address", { street_address: e.target.value || null })}
            onBlur={(e) => flushSave("street_address", { street_address: e.target.value || null })}
          />
          <SaveIndicator state={status.street_address ?? IDLE} />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "service_area") && (
        <div>
          <Label htmlFor="service_area">Service area</Label>
          <Input
            id="service_area"
            defaultValue={local.service_area ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. Inland Empire and Coachella Valley"
            onChange={(e) => scheduleSave("service_area", { service_area: e.target.value || null })}
            onBlur={(e) => flushSave("service_area", { service_area: e.target.value || null })}
          />
          <SaveIndicator state={status.service_area ?? IDLE} />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "lead_time") && (
        <div>
          <Label htmlFor="lead_time">Typical lead time</Label>
          <Input
            id="lead_time"
            defaultValue={local.lead_time ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. 2–3 business days"
            onChange={(e) => scheduleSave("lead_time", { lead_time: e.target.value || null })}
            onBlur={(e) => flushSave("lead_time", { lead_time: e.target.value || null })}
          />
          <SaveIndicator state={status.lead_time ?? IDLE} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="member_since_year">Member since</Label>
          <Input
            id="member_since_year"
            type="number"
            min={MIN_MEMBER_SINCE_YEAR}
            max={MAX_MEMBER_SINCE_YEAR}
            defaultValue={local.member_since_year ?? ""}
            className="mt-1 h-11"
            onChange={(e) => {
              const value = e.target.value ? Number(e.target.value) : null;
              if (requireValidYear(value)) {
                scheduleSave("member_since_year", { member_since_year: value });
              }
            }}
            onBlur={(e) => {
              const value = e.target.value ? Number(e.target.value) : null;
              if (requireValidYear(value)) {
                flushSave("member_since_year", { member_since_year: value });
              }
            }}
          />
          <SaveIndicator state={status.member_since_year ?? IDLE} />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Select defaultValue={local.timezone} onValueChange={(value) => saveNow("timezone", { timezone: value })}>
            <SelectTrigger id="timezone" className="mt-1 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SaveIndicator state={status.timezone ?? IDLE} />
        </div>
      </div>
    </div>
  );
}
