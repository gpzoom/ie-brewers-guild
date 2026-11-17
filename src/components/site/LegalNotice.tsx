/**
 * The one-line agreement shown beside Join's "Submit to the Guild" and every
 * Publish button (owner decision 2026-11-17: no checkbox). Plain links that
 * open in a new tab, so someone mid-publish keeps their page.
 */
export function LegalNotice({
  action,
  className = "text-[11px] leading-[1.45] text-ink-muted",
}: {
  action: "submitting" | "publishing";
  className?: string;
}) {
  const link = "underline underline-offset-2 hover:text-ink";
  return (
    <p className={className}>
      By {action}, you agree to the{" "}
      <a href="/terms" target="_blank" rel="noreferrer" className={link}>
        Terms
      </a>{" "}
      and{" "}
      <a href="/privacy" target="_blank" rel="noreferrer" className={link}>
        Privacy Policy
      </a>
      .
    </p>
  );
}
