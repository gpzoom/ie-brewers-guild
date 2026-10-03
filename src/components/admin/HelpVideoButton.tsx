import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { HelpVideo } from "@/data/help-videos";

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 5.2v5.6L11 8z" fill="currentColor" />
    </svg>
  );
}

/**
 * "Watch how (2:47)": opens a member how-to video in a pop-up. The player
 * iframe is only mounted while the pop-up is open, so the page never loads
 * the video until someone asks for it, and closing the pop-up stops it.
 */
export function HelpVideoButton({ video, label = "Watch how" }: { video: HelpVideo; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-semibold text-[#B45309] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <PlayIcon />
        {label}
        <span className="font-normal text-ink-muted">({video.duration})</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(960px,calc(100vw-32px))] gap-3 border-0 bg-[#171410] p-3 text-[#F7F3EC] sm:rounded-[14px] [&>button]:text-[#F7F3EC]">
          <DialogTitle className="pr-8 font-sans text-sm font-semibold normal-case tracking-normal">
            {video.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            How-to video, {video.duration} long.
          </DialogDescription>
          <div className="relative w-full overflow-hidden rounded-[9px] bg-black pt-[56.25%]">
            {open && (
              <iframe
                src={video.embedUrl}
                title={video.title}
                className="absolute inset-0 size-full border-0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
