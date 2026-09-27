import { useState } from "react";
import { cn } from "@/lib/utils";
import { linkifyText } from "@/lib/text/linkify";

// A description longer than this, or with more than two line breaks, starts
// clamped to three lines with a "More" button.
const LONG_DESCRIPTION = 140;

/**
 * The event's description (from the member's calendar, as plain text --
 * cleanEventDescription in ics-sync.ts). Line breaks are kept; React
 * escapes the text, so nothing in it is ever treated as HTML. Web addresses
 * in it become links (linkifyText: http(s) only), opening in a new tab.
 */
export function EventDescription({ text, muted }: { text: string; muted: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_DESCRIPTION || text.split("\n").length > 3;
  return (
    <div className="flex flex-col items-start gap-0.5 pt-0.5">
      <p
        className={cn(
          "whitespace-pre-line break-words text-xs leading-[1.45] lg:text-[13px]",
          muted ? "text-ink-subtle" : "text-[#3A332C]",
          long && !open && "line-clamp-3",
        )}
      >
        {linkifyText(text).map((part, index) =>
          part.kind === "link" ? (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="break-all font-medium text-brand underline underline-offset-2 hover:text-brand-hover"
            >
              {part.text}
            </a>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="min-h-8 text-xs font-semibold text-brand underline-offset-2 hover:underline lg:text-[13px]"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
