/**
 * Privacy and Terms links for the pages that don't show the site footer
 * (Sign-in, a member's photo-sharing link). New tab, so a form isn't lost.
 */
export function LegalLinks({
  className = "text-center text-[12px] text-ink-muted",
}: {
  className?: string;
}) {
  const link = "underline underline-offset-2 hover:opacity-80";
  return (
    <p className={className}>
      <a href="/privacy" target="_blank" rel="noreferrer" className={link}>
        Privacy Policy
      </a>
      {" · "}
      <a href="/terms" target="_blank" rel="noreferrer" className={link}>
        Terms of Use
      </a>
    </p>
  );
}
