import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo.svg";
import { cn } from "@/lib/utils";

/**
 * Shared pieces for the public-facing form pages -- sign in (artboard T),
 * contact (artboard O) and the creator upload link (artboard J), see
 * docs/design/README.md. All three draw a light "canvas" card on the dark
 * site ground. Every colour here is an explicit canvas token (text-ink,
 * bg-canvas, border-canvas-border...) rather than a shadcn alias, so the
 * card looks the same whether the page sits under html.theme-canvas
 * (/signin, /send) or the public dark theme (/contact).
 */

/** The small "logo + ISC BREWERS GUILD" bar at the top of the standalone pages. */
export function BrandBar({ linkHome = false }: { linkHome?: boolean }) {
  const inner = (
    <>
      <img
        src={logo}
        alt=""
        className="h-7 w-7 shrink-0 rounded-[5px] bg-[#38322A] object-contain"
      />
      <span className="text-[10px] font-semibold tracking-[0.16em] text-[#B6AC9D]">
        ISC BREWERS GUILD
      </span>
    </>
  );
  return (
    <div className="flex h-[58px] shrink-0 items-center px-3.5">
      {linkHome ? (
        <Link
          to="/"
          aria-label="Inland Southern California Brewers Guild — home"
          className="flex min-h-11 items-center gap-2.5 rounded-md no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-2.5" aria-label="Inland Southern California Brewers Guild">
          {inner}
        </div>
      )}
    </div>
  );
}

/** The rounded light card the whole form lives in. */
export function CanvasCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[22px] rounded-[22px] bg-canvas px-[18px] pb-[26px] pt-7 text-ink sm:px-10 sm:pb-10 sm:pt-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Sentence-case Bricolage heading; overrides the public site's uppercase base h1 style. */
export function CanvasHeading({
  as: Tag = "h1",
  size = "lg",
  children,
  id,
}: {
  as?: "h1" | "h2";
  size?: "lg" | "md" | "sm";
  children: ReactNode;
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "font-display font-bold normal-case text-ink",
        size === "lg" && "text-[30px] leading-[1.06] tracking-[-0.02em] sm:text-[34px]",
        size === "md" && "text-[26px] leading-[1.08] tracking-[-0.015em]",
        size === "sm" && "text-[20px] leading-[1.12] tracking-[-0.01em]",
      )}
    >
      {children}
    </Tag>
  );
}

export const leadClass = "text-[15px] leading-[1.55] text-ink-muted text-pretty";
export const labelClass = "text-[13px] font-medium text-ink";
export const hintClass = "text-xs text-ink-muted";
export const fieldErrorClass = "text-[13px] text-danger";
export const inputClass =
  "block h-[50px] w-full rounded-[10px] border border-canvas-border bg-white px-3.5 font-sans text-base text-ink placeholder:text-ink-subtle transition-colors focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger";
export const textareaClass =
  "block w-full resize-y rounded-[10px] border border-canvas-border bg-white px-3.5 py-[13px] font-sans text-base leading-normal text-ink placeholder:text-ink-subtle transition-colors focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger";
export const primaryButtonClass =
  "inline-flex h-[54px] w-full items-center justify-center rounded-[11px] border-0 bg-brand px-5 font-sans text-base font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:bg-canvas-border disabled:text-ink-subtle";
export const secondaryButtonClass =
  "inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-canvas-border bg-white px-5 font-sans text-sm font-medium text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60";
/** In-card links: the accent colour, underlined (the artboards' light orange fails contrast on the light card). */
export const cardLinkClass = "font-medium text-brand underline underline-offset-2 hover:text-brand-hover";

/** A whole-card checkbox label (artboard O's membership box, artboard J's credit/permission boxes). */
export function CheckCard({
  id,
  checked,
  onChange,
  title,
  description,
  tone = "plain",
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  tone?: "plain" | "accent";
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40",
        tone === "accent"
          ? "border-2 border-brand bg-[color-mix(in_srgb,var(--brand)_7%,white)] p-4"
          : "border border-canvas-border bg-white px-[15px] py-3.5",
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={descriptionId}
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 cursor-pointer focus-visible:outline-none",
          tone === "accent" ? "accent-brand" : "accent-ink",
        )}
      />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        {description && (
          <span id={descriptionId} className="text-[13px] leading-normal text-ink-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** 52px rounded tile holding an icon (artboard T's "Check your email" state). */
export function IconTile({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[13px] bg-canvas-2">
      {children}
    </div>
  );
}

export function MailIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink-muted">
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="m2.4 4.4 5.6 4 5.6-4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function InstagramIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink-muted">
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="3.4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.4" cy="4.6" r="0.8" fill="currentColor" />
    </svg>
  );
}

/** Warning/notice box on the light card. */
export function NoticeBox({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "danger" }) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-[10px] border px-3.5 py-3 text-sm leading-normal text-ink",
        tone === "warn" ? "border-warn/50 bg-warn/10" : "border-danger/40 bg-danger/10",
      )}
    >
      {children}
    </p>
  );
}
