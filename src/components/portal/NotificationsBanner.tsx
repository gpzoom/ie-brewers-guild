import { Link } from "@tanstack/react-router";

/**
 * The banner on every portal and /admin screen while a problem is open
 * (spec 2026-11-13, "The member portal: Notifications"): one sentence and
 * Review →. Unread messages raise the menu count but never show it.
 * No artboard yet: built from the portal's patterns, to be restyled.
 */
export function NotificationsBanner({ text, href }: { text: string | null; href: string }) {
  if (!text) return null;
  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[11px] border border-[#FECDCA] bg-[#FEF3F2] px-[17px] py-[13px] text-[13px] text-[#B42318] md:mb-6"
    >
      <span aria-hidden="true">⚠</span>
      <span className="min-w-0 flex-1 text-pretty">{text}</span>
      <Link to={href} className="font-semibold text-[#B42318] underline underline-offset-2">
        Review →
      </Link>
    </div>
  );
}
