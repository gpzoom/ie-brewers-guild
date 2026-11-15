import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { JoinPreview, previewUsesGoogle } from "@/components/join/JoinPreview";
import {
  CanvasCard,
  CanvasHeading,
  IconTile,
  MailIcon,
  NoticeBox,
  cardLinkClass,
  fieldErrorClass,
  hintClass,
  inputClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/public-forms/PublicFormParts";
import { getJoinPreview } from "@/lib/join/join-preview.server";
import { joinSearchPlaces, submitJoin } from "@/lib/join/join.server";
import { safeJoinMessage } from "@/lib/join/join-messages";
import { validateJoinInput, type JoinFieldErrors } from "@/lib/join/join-validation";
import type { MemberProfileData } from "@/lib/members/profile-object";
import type { PlaceCandidate } from "@/lib/google/places-client.server";
import type { MemberType } from "@/lib/supabase/types";

type Step = "form" | "choose" | "preview" | "check-email" | "already-member";

const TYPE_CHOICES: { value: MemberType; label: string; hint: string }[] = [
  { value: "producer", label: "Producer", hint: "Brewery, meadery, cidery or distillery with a taproom." },
  { value: "mobile", label: "Mobile", hint: "Entertainment, food truck or pop-up." },
  { value: "allied", label: "Affiliate Member", hint: "Supply house, ingredients, equipment or services." },
];

const NO_GOOGLE_NOTE =
  "We couldn't find your business on Google right now, so you can continue without it. You can add details later.";

/** A thrown server-function error shows only when it's one of our known messages (rate limit, closed…); else generic. */
const messageOf = safeJoinMessage;

/**
 * The whole /join flow on one route: details form, "Is this you?" (Producer
 * and Affiliate Member only), the profile preview, then the result screens.
 * Every button disables while its request runs, which also stops double
 * submits; focus moves to the new step's heading whenever the step changes.
 */
export function JoinForm() {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState({ email: "", businessName: "", city: "", memberType: "" as MemberType | "", honeypot: "" });
  const [fieldErrors, setFieldErrors] = useState<JoinFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [googleNote, setGoogleNote] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MemberProfileData | null>(null);
  const [previewPlaceId, setPreviewPlaceId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const describedBy = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined;
  const memberType = form.memberType as MemberType;

  async function loadPreview(placeId: string | null) {
    setBusy(true);
    setFormError(null);
    try {
      const result = await getJoinPreview({ data: { businessName: form.businessName, city: form.city, memberType, placeId } });
      if (result.kind === "already-member") {
        setStep("already-member");
        return;
      }
      setPreview(result.data);
      setPreviewPlaceId(placeId);
      setSubmitError(null);
      setStep("preview");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onContinue(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = validateJoinInput({ ...form, memberType, placeId: null });
    if (!result.ok) {
      setFieldErrors(result.errors);
      setFormError("Fix the highlighted fields and try again.");
      return;
    }
    setFieldErrors({});
    setFormError(null);

    // Mobile (food trucks) has no Google step.
    if (memberType === "mobile") {
      await loadPreview(null);
      return;
    }

    setBusy(true);
    try {
      const result = await joinSearchPlaces({ data: { businessName: form.businessName, city: form.city } });
      if (result.kind === "results" && result.candidates.length > 0) {
        setCandidates(result.candidates);
        setGoogleNote(null);
      } else {
        setCandidates([]);
        // Rate-limit messages are shown as they are; the rest is the friendly note.
        setGoogleNote(result.kind === "error" ? result.message : NO_GOOGLE_NOTE);
      }
      setSelectedPlaceId(null);
      setStep("choose");
    } catch {
      setCandidates([]);
      setGoogleNote(NO_GOOGLE_NOTE);
      setStep("choose");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitToGuild() {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await submitJoin({
        data: {
          email: form.email,
          businessName: form.businessName,
          city: form.city,
          memberType,
          placeId: previewPlaceId,
          honeypot: form.honeypot,
        },
      });
      if (result.kind === "check-email") setStep("check-email");
      else if (result.kind === "already-member") setStep("already-member");
      else if (result.kind === "invalid") {
        setFieldErrors(result.errors);
        setFormError("Fix the highlighted fields and try again.");
        setStep("form");
      } else setSubmitError(result.message);
    } catch (err) {
      setSubmitError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "preview" && preview) {
    return (
      <JoinPreview
        ref={headingRef}
        data={preview}
        showGoogleCredit={previewUsesGoogle(preview, previewPlaceId !== null)}
        submitting={busy}
        error={submitError}
        onSubmit={onSubmitToGuild}
        onBack={() => setStep(memberType === "mobile" ? "form" : "choose")}
      />
    );
  }

  return (
    <section className="bg-bg px-2.5 pb-16 pt-6 font-sans sm:px-6 sm:pb-24 sm:pt-12">
      <div className="mx-auto w-full max-w-[640px]">
        {step === "check-email" && (
          <CanvasCard className="gap-[18px]">
            <IconTile>
              <MailIcon />
            </IconTile>
            <div className="flex flex-col gap-[9px]" role="status">
              <CanvasHeading>
                <span ref={headingRef} tabIndex={-1} className="focus:outline-none">
                  Check your email
                </span>
              </CanvasHeading>
              <p className={leadClass}>
                We sent a link to <strong>{form.email.trim().toLowerCase()}</strong>. Open it to finish setting up your profile.
              </p>
            </div>
          </CanvasCard>
        )}

        {step === "already-member" && (
          <CanvasCard className="gap-[18px]">
            <div className="flex flex-col gap-[9px]" role="status">
              <CanvasHeading>
                <span ref={headingRef} tabIndex={-1} className="focus:outline-none">
                  We may already have you
                </span>
              </CanvasHeading>
              <p className={leadClass}>
                We may already have {form.businessName.trim()}. Please{" "}
                <Link to="/contact" className={cardLinkClass}>
                  contact us
                </Link>
                .
              </p>
            </div>
          </CanvasCard>
        )}

        {step === "choose" && (
          <CanvasCard>
            <div className="flex flex-col gap-[9px]">
              <CanvasHeading>
                <span ref={headingRef} tabIndex={-1} className="focus:outline-none">
                  Is this you?
                </span>
              </CanvasHeading>
              <p className={leadClass}>
                {candidates.length > 0
                  ? "Pick your business and we will fill in your profile from Google."
                  : "No Google match to pick from."}
              </p>
            </div>

            {googleNote && <NoticeBox tone="warn">{googleNote}</NoticeBox>}

            {candidates.length > 0 && (
              <fieldset className="flex flex-col gap-2.5 border-0 p-0">
                <legend className="sr-only">Your business on Google</legend>
                {candidates.map((c) => (
                  <label
                    key={c.placeId}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[13px] border border-canvas-border bg-white px-[15px] py-3.5 has-[:checked]:border-2 has-[:checked]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
                  >
                    <input
                      type="radio"
                      name="place"
                      value={c.placeId}
                      checked={selectedPlaceId === c.placeId}
                      onChange={() => setSelectedPlaceId(c.placeId)}
                      className="mt-1 h-5 w-5 shrink-0 accent-brand"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                      <span className="text-[13px] text-ink-muted">{c.address}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {formError && <NoticeBox tone="danger">{formError}</NoticeBox>}

            <div className="flex flex-col gap-3">
              {candidates.length > 0 && (
                <button
                  type="button"
                  disabled={busy || !selectedPlaceId}
                  aria-busy={busy}
                  onClick={() => loadPreview(selectedPlaceId)}
                  className={primaryButtonClass}
                >
                  {busy ? "Loading…" : "This is my business"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => loadPreview(null)}
                className={candidates.length > 0 ? secondaryButtonClass : primaryButtonClass}
              >
                Not listed — continue without Google
              </button>
              <button type="button" disabled={busy} onClick={() => setStep("form")} className={secondaryButtonClass}>
                Back
              </button>
            </div>
            {candidates.length > 0 && <p className="text-xs text-ink-muted">Powered by Google</p>}
          </CanvasCard>
        )}

        {step === "form" && (
          <CanvasCard>
            <div className="flex flex-col gap-[9px]">
              <CanvasHeading>
                <span ref={headingRef} tabIndex={-1} className="focus:outline-none">
                  Join the Guild
                </span>
              </CanvasHeading>
              <p className={leadClass}>
                Tell us a little about your business and see your Guild profile in seconds. Nothing goes public until
                you submit and we approve it.
              </p>
            </div>

            <form onSubmit={onContinue} className="relative flex flex-col gap-[22px]" noValidate>
              {/* Honeypot: hidden from people and screen readers; a form-filling bot often fills it. */}
              <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.honeypot}
                  onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="join-email" className={labelClass}>
                  Your email
                </label>
                <input
                  id="join-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={320}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={describedBy("join-email-hint", fieldErrors.email && "join-email-error")}
                  className={inputClass}
                />
                <p id="join-email-hint" className={hintClass}>
                  We will email you a link to finish your profile. This will be your sign-in email.
                </p>
                {fieldErrors.email && (
                  <p id="join-email-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="join-business" className={labelClass}>
                  Business name
                </label>
                <input
                  id="join-business"
                  name="businessName"
                  type="text"
                  autoComplete="organization"
                  required
                  maxLength={200}
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.businessName)}
                  aria-describedby={fieldErrors.businessName ? "join-business-error" : undefined}
                  className={inputClass}
                />
                {fieldErrors.businessName && (
                  <p id="join-business-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.businessName}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor="join-city" className={labelClass}>
                  City
                </label>
                <input
                  id="join-city"
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  required
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.city)}
                  aria-describedby={fieldErrors.city ? "join-city-error" : undefined}
                  className={inputClass}
                />
                {fieldErrors.city && (
                  <p id="join-city-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.city}
                  </p>
                )}
              </div>

              <fieldset
                className="flex flex-col gap-2.5 border-0 p-0"
                aria-describedby={fieldErrors.memberType ? "join-type-error" : undefined}
              >
                <legend className={`${labelClass} mb-[7px]`}>What kind of member are you?</legend>
                {TYPE_CHOICES.map((choice) => (
                  <label
                    key={choice.value}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[13px] border border-canvas-border bg-white px-[15px] py-3.5 has-[:checked]:border-2 has-[:checked]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
                  >
                    <input
                      type="radio"
                      name="memberType"
                      value={choice.value}
                      checked={form.memberType === choice.value}
                      onChange={() => setForm({ ...form, memberType: choice.value })}
                      className="mt-1 h-5 w-5 shrink-0 accent-brand"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-ink">{choice.label}</span>
                      <span className="text-[13px] text-ink-muted">{choice.hint}</span>
                    </span>
                  </label>
                ))}
                {fieldErrors.memberType && (
                  <p id="join-type-error" role="alert" className={fieldErrorClass}>
                    {fieldErrors.memberType}
                  </p>
                )}
              </fieldset>

              {formError && <NoticeBox tone="danger">{formError}</NoticeBox>}

              <button type="submit" disabled={busy} aria-busy={busy} className={primaryButtonClass}>
                {busy ? "One moment…" : "Continue"}
              </button>
            </form>

            <p className="text-xs leading-[1.55] text-ink-muted text-pretty">
              Already a member?{" "}
              <Link to="/signin" className={cardLinkClass}>
                Sign in
              </Link>
              .
            </p>
          </CanvasCard>
        )}
      </div>
    </section>
  );
}
