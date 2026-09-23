import { useRef, useState } from "react";
import { MEMBER_THEMES, type MemberThemeName } from "@/lib/theme/member-themes";
import { updateMemberTheme } from "@/lib/theme/member-theme.server";

/** A fixed set of 8, never a free color picker (spec, "Profile hero and theme"). */
export function ThemePicker({
  memberId,
  currentTheme,
}: {
  memberId: string;
  currentTheme: MemberThemeName;
}) {
  const [selected, setSelected] = useState(currentTheme);
  const [error, setError] = useState<string | undefined>(undefined);

  // Last known PERSISTED theme -- updated ONLY when a save actually
  // succeeds, never captured per-click. Same shape as CoverEditor.tsx's
  // savedCropRef / CarouselEditor.tsx's savedCropRef: a rollback must
  // land on what the server actually has, not on whatever `selected`
  // happened to hold right before the click that's now failing. A
  // per-call `previous` variable (the brief's/an earlier version's
  // shape) breaks under overlapping requests: click A, then click B
  // before A resolves, then B's request lands successfully before A's
  // rejects -- A's catch would capture `previous = A` from ITS OWN call
  // (not O, but not B either), and either way would stomp the
  // already-persisted B with something stale. Rolling back to this ref
  // instead always lands on the true last-confirmed-saved value.
  const savedThemeRef = useRef<MemberThemeName>(currentTheme);

  // Identifies the most recent click, so a late-arriving failure from an
  // OLDER click can tell it's been superseded. Without this, the same
  // A-then-B race above would still show a spurious "Couldn't save this
  // theme" error for A after B already succeeded -- true, but
  // misleading, since the member's most recent action (B) did save, and
  // `selected`/savedThemeRef already correctly show it. Only the
  // still-latest click's own failure should ever surface a rollback or
  // an error.
  const latestClickRef = useRef(0);

  /**
   * Awaits the mutation and rolls back on failure, instead of the brief's
   * given fire-and-forget shape -- if updateMemberTheme throws (an
   * RLS-denied write surfaced as the new row-count-zero error, or the
   * database's own CHECK constraint rejecting a value) that would
   * otherwise be an unhandled promise rejection with the swatch left
   * showing selected even though the server-side write never happened.
   * Same shape as CoverEditor.tsx's onChooseAsset / PublishGateDialog.tsx's
   * onPublish/onUnpublish, extended with the two refs above for the
   * overlapping-clicks race neither of those single-in-flight-request
   * callers needs to guard against.
   */
  async function onSelect(theme: MemberThemeName) {
    const clickId = ++latestClickRef.current;
    setError(undefined);
    setSelected(theme);
    try {
      await updateMemberTheme({ data: { memberId, theme } });
      savedThemeRef.current = theme;
    } catch (err) {
      // A newer click already superseded this one -- if it succeeded,
      // savedThemeRef/`selected` already correctly reflect it and this
      // failure is moot; if it's still in flight or also fails, ITS OWN
      // catch (or success) will handle feedback when it settles. Either
      // way, this stale rejection must not roll back or show an error.
      if (clickId !== latestClickRef.current) return;
      setSelected(savedThemeRef.current);
      setError(err instanceof Error ? err.message : "Couldn't save this theme — try again.");
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Theme</h2>
      <p className="text-xs text-muted-foreground">
        Colours your primary button, highlights, and cover band when there's no cover photo.
      </p>
      <div role="radiogroup" aria-label="Member theme" className="mt-3 grid grid-cols-4 gap-3">
        {MEMBER_THEMES.map((theme) => (
          <button
            key={theme.name}
            type="button"
            role="radio"
            aria-checked={selected === theme.name}
            aria-label={theme.label}
            className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border-2 text-xs text-white ${
              selected === theme.name ? "border-foreground" : "border-transparent"
            }`}
            style={{ backgroundColor: theme.hex }}
            onClick={() => void onSelect(theme.name)}
          >
            {selected === theme.name && "✓"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
