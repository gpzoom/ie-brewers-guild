import { useState } from "react";
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

  /**
   * Awaits the mutation and rolls back on failure, instead of the brief's
   * given fire-and-forget shape -- if updateMemberTheme throws (an
   * RLS-denied write surfaced as the new row-count-zero error, or the
   * database's own CHECK constraint rejecting a value) that would
   * otherwise be an unhandled promise rejection with the swatch left
   * showing selected even though the server-side write never happened.
   * `previous` is captured before the optimistic update below, as a
   * single value -- there's no list here to snapshot whole, unlike
   * MediaGallery.tsx's reinsertAsset. Same shape as CoverEditor.tsx's
   * onChooseAsset / PublishGateDialog.tsx's onPublish/onUnpublish.
   */
  async function onSelect(theme: MemberThemeName) {
    const previous = selected;
    setError(undefined);
    setSelected(theme);
    try {
      await updateMemberTheme({ data: { memberId, theme } });
    } catch (err) {
      setSelected(previous);
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
