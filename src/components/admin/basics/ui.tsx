import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small shared pieces for the "Basics & hours" page (artboard F,
 * docs/design/artboards/AdminBasics.dc.html; phone: AdminPhone.dc.html).
 * Plain class strings + tiny components, so BasicsForm, HoursEditor and
 * LogoUploader all speak the same visual language without a new
 * abstraction layer.
 */

export type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
export const IDLE: SaveState = { status: "idle" };

/**
 * Autosave status line. Deliberately NOT the light --open green on white
 * (too little contrast for 12px text): "Saving…" and "Saved" use ink-muted
 * (#6B6156, ~5.9:1 on white/canvas), errors use --danger.
 */
export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  if (state.status === "idle") return null;
  if (state.status === "saving") {
    return <p className={cn("text-[12px] text-ink-muted", className)}>Saving…</p>;
  }
  if (state.status === "saved") {
    return (
      <p className={cn("flex items-center gap-1 text-[12px] text-ink-muted", className)}>
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        Saved
      </p>
    );
  }
  return (
    <p role="alert" className={cn("text-[12px] font-medium text-danger", className)}>
      {state.message ?? "Couldn't save — try again."}
    </p>
  );
}

/** 10px uppercase letterspaced section label. */
export const sectionLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";

/** 13px/500 field label. */
export const fieldLabelClass = "text-[13px] font-medium text-ink";

/**
 * Text input look: 46px / 9px radius / white / 1px canvas-border on
 * desktop, 48px / 10px / 15px text on a phone (artboard AdminPhone).
 * Passed as `className` to the shadcn Input, whose own defaults
 * tailwind-merge overrides.
 */
export const textInputClass =
  "h-12 rounded-[10px] border-canvas-border bg-white px-[13px] text-[15px] text-ink shadow-none md:h-[46px] md:rounded-[9px] md:text-[14px]";

/** Secondary button (artboard's "Replace"): 44px, canvas fill, #D3CBBD border. */
export const secondaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Primary button (accent fill). */
export const primaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] bg-brand px-[18px] text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** Label + control + hint + autosave status, 7px apart. */
export function Field({
  id,
  label,
  hint,
  state,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  state?: SaveState;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-ink-muted">{hint}</p>}
      {state && <SaveIndicator state={state} />}
    </div>
  );
}

export function InfoIcon() {
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

/** Canvas-2 info box with the ⓘ icon. */
export function InfoBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[11px] bg-canvas-2 px-[17px] py-[15px] text-ink-muted",
        className,
      )}
    >
      <InfoIcon />
      <div className="text-[13px] leading-[1.5] text-[#3A332C] text-pretty">{children}</div>
    </div>
  );
}
