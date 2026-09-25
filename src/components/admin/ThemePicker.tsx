import { useRef, useState } from "react";
import { MEMBER_THEMES, getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { updateMemberTheme } from "@/lib/theme/member-theme.server";

// The four swatches in the "No cover photo yet?" panel (artboard K) --
// illustrative only, not the member's choice.
const COVER_FALLBACK_EXAMPLES: MemberThemeName[] = ["amber", "teal", "plum", "forest"];

function CheckBadge({ color }: { color: string }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-white">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M2.5 6.2 5 8.6l4.5-5"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.9v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A fixed set of 8, never a free color picker (spec, "Profile hero and
 * theme"). Layout follows artboard K (AdminTheme): heading, the eight
 * swatch cards, the "No cover photo yet?" panel, the frame note, and a
 * live preview column on wide screens (stacked underneath on a phone).
 */
export function ThemePicker({
  memberId,
  currentTheme,
  businessName,
  city,
  state,
  tagline,
}: {
  memberId: string;
  currentTheme: MemberThemeName;
  /** Preview-only: shown in the live preview card. */
  businessName?: string | null;
  city?: string | null;
  state?: string | null;
  tagline?: string | null;
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
      // Same staleness guard as the catch block below -- without it, an
      // OLDER click's late-arriving SUCCESS (not just a failure) can
      // still clobber savedThemeRef back to a stale value after a newer
      // click already succeeded and correctly set it: click A, click B,
      // B resolves first (savedThemeRef = B, correct), then A also
      // resolves and unconditionally overwrites savedThemeRef back to A.
      // `selected` stays visibly correct (still B, untouched here), but
      // savedThemeRef is now quietly wrong -- so a LATER click's failure
      // would roll back to stale A instead of the actually-current B.
      if (clickId === latestClickRef.current) savedThemeRef.current = theme;
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

  const selectedHex = getMemberThemeHex(selected);
  const place = [city, state].filter(Boolean).join(", ");
  const name = businessName?.trim() || "Your business";

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[27px] font-bold leading-tight text-ink">Theme</h1>
          <p className="text-pretty text-[13px] text-ink-muted">
            Pick the colour that carries your buttons, highlights and cover fallback. Every option
            is checked for legibility, so none of them can make your page hard to read.
          </p>
        </div>

        <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-4">
          <legend className="mb-3 p-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
            Eight themes
          </legend>
          {MEMBER_THEMES.map((theme) => {
            const checked = selected === theme.name;
            const inputId = `theme-${theme.name}`;
            return (
              <label
                key={theme.name}
                htmlFor={inputId}
                className={`flex cursor-pointer flex-col overflow-hidden rounded-[12px] bg-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink has-[:focus-visible]:ring-offset-2 ${
                  checked ? "border-2 border-ink" : "border border-canvas-border"
                }`}
              >
                <span
                  className="flex h-[54px] items-start justify-end p-[7px]"
                  style={{ backgroundColor: theme.hex }}
                >
                  {checked && <CheckBadge color={theme.hex} />}
                </span>
                <span className="flex min-h-11 items-center gap-[9px] px-3 py-2.5">
                  <input
                    type="radio"
                    id={inputId}
                    name="member-theme"
                    value={theme.name}
                    checked={checked}
                    onChange={() => void onSelect(theme.name)}
                    className="size-4 shrink-0 accent-ink focus-visible:outline-none"
                  />
                  <span className={`text-[13px] text-ink ${checked ? "font-semibold" : ""}`}>
                    {theme.label}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {error && (
          <p role="alert" className="-mt-3 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3.5 rounded-[13px] bg-canvas-2 p-5">
          <div className="flex flex-col gap-[5px]">
            <p className="text-sm font-semibold text-ink">No cover photo yet?</p>
            <p className="text-xs leading-normal text-ink-muted">
              Your theme fills the cover band instead, so your page still looks finished. Add a
              photo whenever you have one.
            </p>
          </div>
          <div className="flex gap-3" aria-hidden="true">
            {COVER_FALLBACK_EXAMPLES.map((name) => (
              <div
                key={name}
                className="h-[62px] flex-1 rounded-[9px]"
                style={{ backgroundColor: getMemberThemeHex(name) }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[11px] border border-canvas-border px-[17px] py-[15px] text-ink-muted">
          <InfoIcon />
          <p className="text-pretty text-xs leading-normal text-ink">
            The Guild's own dark frame stays the same on every profile. Your theme colours what sits
            inside it, so the directory still reads as one site.
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-[320px] shrink-0 flex-col gap-3 lg:w-[320px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
          Live preview
        </p>

        <div className="overflow-hidden rounded-2xl bg-[#171410] pb-3.5" aria-hidden="true">
          <div className="flex h-[38px] items-center px-3.5">
            <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#B6AC9D]">
              ISC Brewers Guild
            </span>
          </div>
          <div className="mx-2 flex flex-col rounded-2xl bg-canvas">
            <div
              className="h-[110px] rounded-t-2xl transition-colors"
              style={{ backgroundColor: selectedHex }}
            />
            <div className="flex flex-col gap-3 px-3.5 pb-4">
              <div className="-mt-6 flex items-end gap-2.5">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-[13px] border-[3px] border-canvas bg-white font-display text-lg font-bold text-ink-subtle">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col gap-[3px] pb-0.5">
                  <span className="truncate font-display text-lg font-bold leading-[1.1] text-ink">
                    {name}
                  </span>
                  {place && <span className="text-[11px] text-ink-muted">{place}</span>}
                </div>
              </div>
              {tagline && <p className="text-xs leading-[1.45] text-[#3A332C]">{tagline}</p>}
              <div className="flex flex-col gap-2 rounded-[12px] bg-ink px-3.5 py-[13px]">
                <span className="font-display text-lg font-bold leading-none text-canvas">
                  Open now
                </span>
                <div className="flex gap-2">
                  <span
                    className="flex h-9 flex-1 items-center justify-center rounded-[9px] text-xs font-semibold text-white transition-colors"
                    style={{ backgroundColor: selectedHex }}
                  >
                    Directions
                  </span>
                  <span className="flex h-9 flex-1 items-center justify-center rounded-[9px] border border-[#4A4238] text-xs text-canvas">
                    Call
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-normal text-ink-subtle">
          Updates as you pick. Nothing changes on your live page until you publish.
        </p>
      </div>
    </div>
  );
}
