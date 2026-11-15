import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { DraftStatusProvider, useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import {
  MemberEditingProvider,
  type MemberEditingValue,
} from "@/components/admin/MemberEditingContext";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { PngHelpNote } from "@/components/admin/PngHelpNote";
import { MediaGallery } from "@/components/admin/MediaGallery";
import { CoverEditor } from "@/components/admin/CoverEditor";
import { LinksContactEditor } from "@/components/admin/LinksContactEditor";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  fieldErrorClass,
  hintClass,
  labelClass,
  leadClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/public-forms/PublicFormParts";
import { draftSaveQueue } from "@/lib/drafts/save-queue";
import { TAGLINE_MAX } from "@/lib/drafts/validate-patch";
import { markApplicationDone, type JoinFinishForm } from "@/lib/join/finish.server";

const TAGLINE_SAVE_DELAY_MS = 800;

/**
 * Join the Guild, step 2 (/join/finish): a short page, not the portal --
 * logo, cover photo, tagline and links, each the portal's own editor
 * saving to the applicant's draft (spec section 5). "Update preview" opens
 * the draft preview (/portal/preview, whose "Back to editing" returns here
 * through /portal); "I'm done" tells the Guild (at most once a day, decided
 * on the server). Both wait for any save still running first.
 */
export function FinishForm({ state }: { state: JoinFinishForm }) {
  const editing = useMemo<MemberEditingValue>(
    () => ({
      memberId: state.memberId,
      memberName: state.memberName,
      memberType: state.memberType,
      role: state.draftStatus.role,
      isImpersonating: state.isImpersonating,
      isPublished: false,
      slug: state.slug,
      surface: "portal",
      // No other portal screens to link to from here.
      paths: { basics: null, hours: null, events: null },
    }),
    [state],
  );

  return (
    <MemberEditingProvider value={editing}>
      <DraftStatusProvider initial={state.draftStatus}>
        <FinishPage state={state} />
      </DraftStatusProvider>
    </MemberEditingProvider>
  );
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <CanvasCard className="gap-4">
        <div className="flex flex-col gap-1.5">
          <CanvasHeading as="h2" size="sm" id={id}>
            {title}
          </CanvasHeading>
          {lede && <p className="text-pretty text-[14px] leading-[1.5] text-ink-muted">{lede}</p>}
        </div>
        {children}
      </CanvasCard>
    </section>
  );
}

function FinishPage({ state }: { state: JoinFinishForm }) {
  const router = useRouter();
  const { draft, assets, memberId } = state;
  const basics = draft.data.basics;
  const [busy, setBusy] = useState<"preview" | "done" | null>(null);
  const [done, setDone] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const flushTaglineRef = useRef<() => void>(() => {});

  /** Sends a tagline still waiting for its typing pause, then waits for every draft save to finish. */
  async function settleSaves() {
    flushTaglineRef.current();
    await draftSaveQueue.whenIdle(`${memberId}:`);
  }

  async function onPreview() {
    setBusy("preview");
    try {
      await settleSaves();
      await router.navigate({ to: "/portal/preview" });
    } finally {
      setBusy(null);
    }
  }

  async function onDone() {
    setBusy("done");
    setDoneError(null);
    try {
      await settleSaves();
      await markApplicationDone({ data: { memberId } });
      setDone(true);
    } catch (err) {
      setDoneError(
        err instanceof Error && err.message && err.message.length < 200
          ? err.message
          : "Something went wrong. Try again in a moment.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg pb-16 font-sans">
      <div className="mx-auto w-full max-w-[720px]">
        <BrandBar linkHome />
        <div className="mx-2.5 flex flex-col gap-4 sm:mx-0 sm:mt-4">
          <CanvasCard>
            <div className="flex flex-col gap-[9px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                Join the Guild · Step 2
              </p>
              <CanvasHeading>Finish your profile</CanvasHeading>
              <p className={leadClass}>
                Add your logo, a cover photo, a tagline and your links for{" "}
                <strong className="font-semibold text-ink">{state.businessName}</strong>. Everything
                saves as you go. The Guild reviews your application before your page goes live.
              </p>
            </div>
          </CanvasCard>

          <Section
            id="finish-logo"
            title="Logo"
            lede="PNG or WebP, at least 400 pixels tall. A see-through (transparent) background looks best."
          >
            <LogoUploader
              memberId={memberId}
              initialLogoUrl={draft.logoUrl}
              initialBackground={basics.logo_background}
              theme={draft.data.theme.theme}
              businessName={basics.business_name}
              belowUpload={<PngHelpNote />}
            />
          </Section>

          <Section
            id="finish-cover"
            title="Cover photo"
            lede="The wide photo across the top of your page. Upload a photo or two, then pick your cover from them."
          >
            <MediaGallery memberId={memberId} assets={assets} />
            <CoverEditor
              memberId={memberId}
              coverAssetId={basics.cover_asset_id}
              coverCrop={basics.cover_crop}
              galleryAssets={assets}
              lookAssets={draft.lookAssets}
            />
          </Section>

          <Section id="finish-tagline" title="Tagline">
            <TaglineField memberId={memberId} initial={basics.tagline} flushRef={flushTaglineRef} />
          </Section>

          <Section
            id="finish-links"
            title="Links"
            lede="Your website, Instagram, Facebook and more. They show as buttons on your page."
          >
            <LinksContactEditor
              memberId={memberId}
              initialLinks={draft.data.links.links}
              memberType={draft.member.member_type}
              contact={{
                phone: basics.phone,
                contactEmail: basics.contact_email,
                street: basics.street_address,
                city: basics.city,
                state: basics.state,
              }}
              showHeading={false}
            />
          </Section>

          <CanvasCard className="gap-4">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={onPreview}
                disabled={busy !== null}
              >
                {busy === "preview" ? "Opening preview…" : "Update preview"}
              </button>
              <button
                type="button"
                className={`${primaryButtonClass} sm:h-12`}
                onClick={onDone}
                disabled={busy !== null}
              >
                {busy === "done" ? "Sending…" : "I'm done"}
              </button>
            </div>
            {doneError && (
              <p role="alert" className={fieldErrorClass}>
                {doneError}
              </p>
            )}
            <div role="status">
              {done && (
                <p className="rounded-[11px] border border-canvas-border bg-white px-4 py-3 text-[14px] leading-[1.55] text-ink text-pretty">
                  <strong className="font-semibold">Thanks!</strong> The Guild will review your
                  application and email you. You can come back and make changes until then: just
                  sign in with this email.
                </p>
              )}
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * The tagline (draft basics.tagline): saves after a short typing pause and
 * on leaving the field, like Basics & hours does. `flushRef` lets the page
 * send a pending save before the preview or "I'm done".
 */
function TaglineField({
  memberId,
  initial,
  flushRef,
}: {
  memberId: string;
  initial: string | null;
  flushRef: React.MutableRefObject<() => void>;
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const [value, setValue] = useState(initial ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const savedRef = useRef(initial ?? "");

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next === null || next === savedRef.current) return;
    setSaveState({ kind: "saving" });
    saveDraft("basics", { tagline: next.trim() === "" ? null : next }).then(
      () => {
        savedRef.current = next;
        setSaveState({ kind: "saved" });
      },
      (err: unknown) => {
        setSaveState({
          kind: "error",
          message: err instanceof Error && err.message ? err.message : "Couldn't save the tagline. Try again.",
        });
      },
    );
  }, [saveDraft]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush, flushRef]);

  // Send anything still waiting when the page goes away.
  useEffect(() => () => flush(), [flush]);

  function onChange(next: string) {
    setValue(next);
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, TAGLINE_SAVE_DELAY_MS);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="finish-tagline-input" className={labelClass}>
        A short line about your business
      </label>
      <textarea
        id="finish-tagline-input"
        className={textareaClass}
        rows={2}
        maxLength={TAGLINE_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        aria-describedby="finish-tagline-hint"
        aria-invalid={saveState.kind === "error" || undefined}
      />
      <p id="finish-tagline-hint" className={hintClass}>
        Up to {TAGLINE_MAX} characters ({value.length} used).
        {saveState.kind === "saving" && " Saving…"}
        {saveState.kind === "saved" && " Saved."}
      </p>
      {saveState.kind === "error" && (
        <p role="alert" className={fieldErrorClass}>
          {saveState.message}
        </p>
      )}
    </div>
  );
}
