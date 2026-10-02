export const CANVA_BACKGROUND_REMOVER_URL = "https://www.canva.com/features/background-remover/";

/**
 * Under the logo upload, above Logo background (owner, 2026-10-02): where
 * to turn a JPG logo into the PNG the site needs.
 */
export function PngHelpNote() {
  return (
    <div className="flex items-start gap-3 rounded-[11px] border border-[#EBC9A8] bg-[#FCF3EA] px-4 py-3 text-[13px] leading-[1.5] text-ink">
      <svg
        width="18"
        height="18"
        viewBox="0 0 16 16"
        fill="none"
        className="mt-px shrink-0 text-brand"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.2v3.6M8 5.1v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="m-0 min-w-0 text-pretty">
        <strong className="font-semibold">You don't have a PNG format?</strong> Get it converted now
        with{" "}
        <a
          href={CANVA_BACKGROUND_REMOVER_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
        >
          Canva's Background Removal tool
        </a>
        . Download the result as a PNG, then upload it here.
      </p>
    </div>
  );
}
