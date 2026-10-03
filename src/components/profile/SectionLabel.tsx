import type { ReactNode } from "react";

/**
 * The profile's module heading row (artboards D/E/V/L): a 10px (11px on
 * desktop) uppercase letterspaced label, with optional quiet gray text on
 * the right ("Hours confirmed Sep 2026", "Synced from Google Calendar").
 * Rendered as an <h2> so the modules keep a real heading outline.
 */
export function SectionLabel({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className ?? ""}`}>
      <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted lg:text-[11px]">
        {children}
      </h2>
      {aside && <span className="text-right text-[10px] text-ink-subtle lg:text-[11px]">{aside}</span>}
    </div>
  );
}
