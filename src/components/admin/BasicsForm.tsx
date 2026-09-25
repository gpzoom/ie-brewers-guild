import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  type BasicsMember,
  type BasicsPatch,
  updateMemberBasics,
} from "@/lib/members/member-basics.server";
import { updateMemberEmail } from "@/lib/members/member-email.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import { listIanaTimezones } from "@/lib/timezone/timezones";
import type { MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveNoteText } from "@/components/admin/SaveNote";
import {
  Field,
  IDLE,
  InfoBox,
  type SaveState,
  SaveIndicator,
  fieldLabelClass,
  primaryButtonClass,
  sectionLabelClass,
  textInputClass,
} from "@/components/admin/basics/ui";

const TIMEZONES = listIanaTimezones();

// Plan's Decision 6: "~400ms debounce, saves as the member types." A
// member who types then backgrounds the tab, loses connectivity, or
// navigates away without ever blurring the field still gets an autosave
// attempt fired on this timer, not just on blur.
const SAVE_DEBOUNCE_MS = 400;
const MIN_MEMBER_SINCE_YEAR = 1800;
const MAX_MEMBER_SINCE_YEAR = new Date().getFullYear() + 1;

// Copy from artboard AdminBasics's MEMBER TYPE cards.
const MEMBER_TYPE_OPTIONS: { value: MemberType; title: string; description: string }[] = [
  {
    value: "producer",
    title: "Producer with a taproom",
    description:
      "Brewery, meadery, cidery or distillery the public can visit. Shows weekly hours, an open-now status and directions.",
  },
  {
    value: "mobile",
    title: "Mobile member",
    description:
      "Entertainment, food truck or pop-up. Shows an appearance calendar and a booking button instead of hours.",
  },
  {
    value: "allied",
    title: "Allied Member",
    description:
      "Supply house, ingredients, equipment or services. Same layout as a producer, with business hours and a trade contact.",
  },
];

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

  const heading = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={sectionLabelClass}>Sign-in email</span>
      <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
        Guild admin only
      </span>
    </div>
  );

  // No member_users row yet -- this member has never been invited/claimed,
  // so there is no account to change an email ON. changeMemberEmail's own
  // server-side check would reject this the same way, but surfacing it
  // here avoids a confusing round-trip error on a button that could never
  // have worked. Use the roster's existing "Invite" action instead, which
  // is the flow that actually creates the first account+email.
  if (email === null) {
    return (
      <section className="flex flex-col gap-3 rounded-[12px] border border-canvas-border bg-white px-[17px] py-[15px]">
        {heading}
        <p className="text-[13px] leading-[1.5] text-ink">
          This member hasn't been invited yet, so there's no sign-in email to show or change here.
          Use <strong>Invite</strong> from the Guild roster to give them their first one.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[12px] border border-canvas-border bg-white px-[17px] py-[15px]">
      {heading}
      <div className="flex flex-col gap-[7px]">
        <label htmlFor="member_email" className={fieldLabelClass}>
          Email this member signs in with
        </label>
        <p className="text-[12px] leading-[1.45] text-ink-muted">
          Changing it takes effect immediately — the member will need to sign in with the new
          address from then on.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            id="member_email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={cn(textInputClass, "min-w-0 flex-1 basis-60 md:h-11 md:max-w-sm")}
          />
          <button
            type="button"
            onClick={handleUpdate}
            disabled={status.status === "saving"}
            className={primaryButtonClass}
          >
            {status.status === "saving" ? "Updating…" : "Update email"}
          </button>
        </div>
        <SaveIndicator state={status} />
      </div>
    </section>
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
  logo,
  hours,
}: {
  member: BasicsMember;
  email?: string | null;
  isImpersonating?: boolean;
  /** The logo row card (LogoUploader), shown at the end of IDENTITY. */
  logo?: ReactNode;
  /** The weekly/special hours editor (HoursEditor), shown after IDENTITY. */
  hours?: ReactNode;
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
    return Object.entries(patch).every(
      ([key, value]) => savedRef.current[key as keyof BasicsMember] === value,
    );
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
          setStatus((prev) =>
            prev[field]?.status === "saved" ? { ...prev, [field]: IDLE } : prev,
          );
        }, 2000);
      })
      .catch((error: unknown) => {
        setStatus((prev) => ({
          ...prev,
          [field]: {
            status: "error",
            message: error instanceof Error ? error.message : "Couldn't save — try again.",
          },
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
    if (value === null || (value >= MIN_MEMBER_SINCE_YEAR && value <= MAX_MEMBER_SINCE_YEAR))
      return true;
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

  const isMobile = local.member_type === "mobile";
  const showStreet = isFieldVisibleForMemberType(local.member_type, "street_address");
  const showServiceArea = isFieldVisibleForMemberType(local.member_type, "service_area");
  const showLeadTime = isFieldVisibleForMemberType(local.member_type, "lead_time");

  return (
    <div className="flex max-w-[972px] flex-col gap-[22px] md:gap-[30px]">
      <h1 className="font-display text-[24px] leading-tight text-ink md:text-[27px]">
        Basics &amp; hours
      </h1>

      {isImpersonating && <SignInEmailEditor memberId={member.id} email={email} />}

      <fieldset className="m-0 flex flex-col gap-[9px] border-0 p-0 md:gap-3">
        <legend className={cn(sectionLabelClass, "mb-[9px] p-0 md:mb-3")}>Member type</legend>
        {MEMBER_TYPE_OPTIONS.map((option) => {
          const checked = local.member_type === option.value;
          return (
            <label
              key={option.value}
              htmlFor={`member_type_${option.value}`}
              className={cn(
                "flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[11px] bg-white md:gap-[13px] md:rounded-[12px]",
                checked
                  ? "border-2 border-ink px-[13px] py-[12px] md:px-[17px] md:py-[15px]"
                  : "border border-canvas-border px-[14px] py-[13px] md:px-[18px] md:py-4",
              )}
            >
              <input
                type="radio"
                id={`member_type_${option.value}`}
                name="member_type"
                value={option.value}
                checked={checked}
                onChange={() => saveNow("member_type", { member_type: option.value })}
                className="mt-0.5 h-[19px] w-[19px] shrink-0 cursor-pointer accent-ink md:h-[18px] md:w-[18px]"
              />
              <span className="flex flex-col gap-[3px] md:gap-1">
                <span className="text-[14px] font-semibold text-ink md:text-[15px]">
                  {option.title}
                </span>
                <span
                  className={cn(
                    "text-[12px] text-ink-muted md:block md:text-[13px]",
                    !checked && "hidden",
                  )}
                >
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
        <SaveIndicator state={status.member_type ?? IDLE} />
      </fieldset>

      <InfoBox>
        Your type decides which sections appear on your public page. Changing it won't delete
        anything you've already filled in.
      </InfoBox>

      <section className="flex flex-col gap-[14px] md:gap-4" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className={cn(sectionLabelClass, "font-sans")}>
          Identity
        </h2>
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 md:gap-4">
          <Field id="business_name" label="Business name" state={status.business_name ?? IDLE}>
            <Input
              id="business_name"
              defaultValue={local.business_name}
              className={textInputClass}
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
          </Field>

          <Field id="city" label="City" state={status.city ?? IDLE}>
            <Input
              id="city"
              defaultValue={local.city}
              className={textInputClass}
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
          </Field>

          <Field id="state" label="State" state={status.state ?? IDLE}>
            <Input
              id="state"
              defaultValue={local.state}
              className={textInputClass}
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
          </Field>

          <Field id="timezone" label="Timezone" state={status.timezone ?? IDLE}>
            <Select
              defaultValue={local.timezone}
              onValueChange={(value) => saveNow("timezone", { timezone: value })}
            >
              <SelectTrigger id="timezone" className={cn(textInputClass, "w-full")}>
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
          </Field>

          <Field
            id="tagline"
            label="Tagline"
            hint="Up to 70 characters — the one place you speak in your own words."
            state={status.tagline ?? IDLE}
            className="md:col-span-2"
          >
            <Textarea
              id="tagline"
              defaultValue={local.tagline ?? ""}
              maxLength={70}
              rows={2}
              className="min-h-[72px] rounded-[10px] border-canvas-border bg-white px-[13px] py-3 text-[15px] text-ink shadow-none md:rounded-[9px] md:text-[14px]"
              onChange={(e) => scheduleSave("tagline", { tagline: e.target.value || null })}
              onBlur={(e) => flushSave("tagline", { tagline: e.target.value || null })}
            />
          </Field>

          {showStreet && (
            <Field
              id="street_address"
              label={LOCATION_FIELD_LABEL[local.member_type]}
              state={status.street_address ?? IDLE}
              className="md:col-span-2"
            >
              <Input
                id="street_address"
                defaultValue={local.street_address ?? ""}
                className={textInputClass}
                onChange={(e) =>
                  scheduleSave("street_address", { street_address: e.target.value || null })
                }
                onBlur={(e) =>
                  flushSave("street_address", { street_address: e.target.value || null })
                }
              />
            </Field>
          )}

          {showServiceArea && (
            <Field id="service_area" label="Service area" state={status.service_area ?? IDLE}>
              <Input
                id="service_area"
                defaultValue={local.service_area ?? ""}
                className={textInputClass}
                placeholder="e.g. Inland Empire and Coachella Valley"
                onChange={(e) =>
                  scheduleSave("service_area", { service_area: e.target.value || null })
                }
                onBlur={(e) => flushSave("service_area", { service_area: e.target.value || null })}
              />
            </Field>
          )}

          {showLeadTime && (
            <Field id="lead_time" label="Typical lead time" state={status.lead_time ?? IDLE}>
              <Input
                id="lead_time"
                defaultValue={local.lead_time ?? ""}
                className={textInputClass}
                placeholder="e.g. 2–3 business days"
                onChange={(e) => scheduleSave("lead_time", { lead_time: e.target.value || null })}
                onBlur={(e) => flushSave("lead_time", { lead_time: e.target.value || null })}
              />
            </Field>
          )}

          <Field
            id="member_since_year"
            label="Member since"
            state={status.member_since_year ?? IDLE}
          >
            <Input
              id="member_since_year"
              type="number"
              inputMode="numeric"
              min={MIN_MEMBER_SINCE_YEAR}
              max={MAX_MEMBER_SINCE_YEAR}
              defaultValue={local.member_since_year ?? ""}
              className={textInputClass}
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
          </Field>
        </div>

        {logo}
      </section>

      {hours !== undefined && (
        <div id="hours" className="flex scroll-mt-6 flex-col gap-[22px] md:gap-[30px]">
          {isMobile && (
            <section className="flex flex-col gap-3" aria-labelledby="hours-mobile-heading">
              <h2 id="hours-mobile-heading" className={cn(sectionLabelClass, "font-sans")}>
                Weekly hours
              </h2>
              <InfoBox>
                Mobile members don't show weekly hours — your{" "}
                <Link
                  to="/admin/events"
                  className="font-medium text-brand underline-offset-2 hover:text-brand-hover hover:underline"
                >
                  events calendar
                </Link>{" "}
                is your schedule. Any hours you entered before are kept in case you switch back.
              </InfoBox>
            </section>
          )}
          {/*
            Hidden, not unmounted, for a mobile member: HoursEditor keeps
            its own row state, so remounting it after a type switch would
            reset it to the page-load rows (dropping rows added/removed
            since) while the database already has the newer ones.
          */}
          <div
            hidden={isMobile}
            className={cn("flex-col gap-[22px] md:gap-[30px]", isMobile ? "hidden" : "flex")}
          >
            {hours}
          </div>
        </div>
      )}

      <p className="border-t border-canvas-2 pt-[22px] text-[13px] text-ink-muted">
        <SaveNoteText />
      </p>
    </div>
  );
}
