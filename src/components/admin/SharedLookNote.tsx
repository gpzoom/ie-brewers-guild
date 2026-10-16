import { useMemberEditing } from "@/components/admin/MemberEditingContext";
import { sharedLookNote, type SharedLook } from "@/lib/portal/shared-look";

/** BZ3: where the manager changes the shared look while short setup shows it read-only. */
export const SHARED_LOOK_SETUP_LINE =
  "Change them from any location's Logo, Photos & Cover page; every location updates.";

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-0.5 shrink-0 text-ink-muted"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-[10px] bg-canvas-2 px-3.5 py-3 text-[13px] leading-normal text-ink"
    >
      <InfoIcon />
      <p className="m-0 text-pretty">{text}</p>
    </div>
  );
}

/**
 * The shared look's note above a look editor (logo, cover, link preview,
 * theme) in a one-manager business (artboards BZ3, BZ5):
 * - the manager (or a Guild admin): a small "Shared by all N locations" pill;
 * - in short setup, where even the manager sees it read-only: the pill and
 *   BZ3's line saying where to change it;
 * - anyone else: an info box naming who manages it (BZ5).
 */
export function SharedLookNote({
  look,
  readOnlyInSetup = false,
}: {
  look: SharedLook;
  readOnlyInSetup?: boolean;
}) {
  if (!look.canChange) return <InfoBox text={sharedLookNote(look)} />;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-canvas-2 px-[11px] py-[5px] text-[12px] font-semibold text-[#3A332C]">
        <LockIcon />
        {sharedLookNote(look)}
      </span>
      {readOnlyInSetup && <InfoBox text={SHARED_LOOK_SETUP_LINE} />}
    </div>
  );
}

/**
 * What a look editor needs: the shared look (null for separate businesses
 * and single locations, where nothing changes) and whether it's locked --
 * read-only on purpose (short setup), or shared and this viewer isn't the
 * one who manages it. The database refuses the change either way; this
 * only keeps the controls from offering it.
 */
export function useSharedLookLock(readOnly: boolean | undefined): {
  look: SharedLook | null;
  locked: boolean;
} {
  const look = useMemberEditing()?.sharedLook ?? null;
  return { look, locked: Boolean(readOnly) || (look !== null && !look.canChange) };
}

/** The note for an editor, or nothing when the look isn't shared. */
export function EditorSharedLookNote({
  look,
  readOnly,
}: {
  look: SharedLook | null;
  readOnly: boolean | undefined;
}) {
  return look ? <SharedLookNote look={look} readOnlyInSetup={Boolean(readOnly)} /> : null;
}
