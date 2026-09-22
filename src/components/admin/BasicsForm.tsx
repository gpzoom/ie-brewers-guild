import { useEffect, useRef, useState } from "react";
import { type BasicsMember, type BasicsPatch, updateMemberBasics } from "@/lib/members/member-basics.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import { listIanaTimezones } from "@/lib/timezone/timezones";
import type { MemberType } from "@/lib/supabase/types";
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
 * Every field here autosaves via its own small patch -- debounced ~400ms
 * after the last keystroke for text fields (this plan's Decision 6),
 * immediately on change for the radio/select -- never a whole-form submit.
 * That's what keeps a member-type switch from ever clobbering a hidden
 * field's stored value (this plan's Decision 6 and Global Constraint 2);
 * the server-side column allowlist in member-basics.server.ts is what
 * actually enforces it, this is just the client half of the same rule.
 */
export function BasicsForm({ member }: { member: BasicsMember }) {
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

  /** ...and flush immediately on blur, so leaving the field never waits out the timer. */
  function flushSave(field: string, patch: BasicsPatch) {
    if (debounceTimers.current[field]) {
      clearTimeout(debounceTimers.current[field]);
      delete debounceTimers.current[field];
    }
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
    if (debounceTimers.current[field]) {
      clearTimeout(debounceTimers.current[field]);
      delete debounceTimers.current[field];
    }
    setStatus((prev) => ({ ...prev, [field]: { status: "error", message: "Can't be empty." } }));
    return false;
  }

  return (
    <div className="max-w-2xl space-y-6">
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
              if (value !== null && (value < MIN_MEMBER_SINCE_YEAR || value > MAX_MEMBER_SINCE_YEAR)) {
                setLocal((prev) => ({ ...prev, member_since_year: value }));
                setStatus((prev) => ({
                  ...prev,
                  member_since_year: {
                    status: "error",
                    message: `Must be between ${MIN_MEMBER_SINCE_YEAR} and ${MAX_MEMBER_SINCE_YEAR}.`,
                  },
                }));
                return;
              }
              scheduleSave("member_since_year", { member_since_year: value });
            }}
            onBlur={(e) => {
              const value = e.target.value ? Number(e.target.value) : null;
              if (value !== null && (value < MIN_MEMBER_SINCE_YEAR || value > MAX_MEMBER_SINCE_YEAR)) return;
              flushSave("member_since_year", { member_since_year: value });
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
