import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { ImageAnnouncement } from "@/components/home/ImageAnnouncement";
import type { CommunityEvent } from "@/lib/home/sections";

/**
 * The Community Events carousel (owner, 2026-11-27;
 * docs/superpowers/specs/2026-11-27-community-events-carousel-design.md):
 * the super admin's event graphics, one at a time, with arrows either side.
 * It loops and flips every `dwellSeconds`, the same setting as the Member
 * Events calendar, and pauses like it: Pause, mouse over the graphic, or
 * keyboard focus inside. Phones can swipe. Every graphic sits in the same grid
 * cell, so the carousel is as tall as the tallest and the page doesn't jump.
 * One event: just the graphic.
 */

const arrowClass =
  "absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Whether focus arrived by keyboard (a mouse click on a button doesn't pause it). */
function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return target instanceof Element && target.matches(":focus-visible") && !target.hasAttribute("data-carousel-toggle");
  } catch {
    return false;
  }
}

export function CommunityEventsCarousel({ events, dwellSeconds }: { events: CommunityEvent[]; dwellSeconds: number }) {
  const count = events.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const pointerStart = useRef<number | null>(null);

  const playing = count > 1 && !userPaused;
  const running = playing && !hovered && !focused;
  const shown = count > 0 ? index % count : 0;

  const goBy = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (((i + delta) % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => goBy(1), dwellSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, index, dwellSeconds, goBy]);

  if (count === 0) return null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goBy(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBy(-1);
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch") pointerStart.current = event.clientX;
  }
  function onPointerUp(event: PointerEvent) {
    if (pointerStart.current === null) return;
    const dx = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(dx) > 40) goBy(dx < 0 ? 1 : -1);
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Community events"
      className="flex flex-col gap-4"
      onKeyDown={onKeyDown}
      onFocus={(event) => setFocused(isKeyboardFocus(event.target))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="relative" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div
          className="grid"
          aria-live={running ? "off" : "polite"}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {events.map((e, i) => {
            const isShown = i === shown;
            return (
              <div
                key={e.id}
                data-slide={i}
                aria-hidden={isShown ? undefined : true}
                inert={!isShown}
                className={`self-center [grid-area:1/1] motion-safe:transition-opacity motion-safe:duration-500 ${
                  isShown ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <ImageAnnouncement section={e} />
              </div>
            );
          })}
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous event" className={`${arrowClass} left-2 md:left-3`} onClick={() => goBy(-1)}>
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button type="button" aria-label="Next event" className={`${arrowClass} right-2 md:right-3`} onClick={() => goBy(1)}>
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            data-carousel-toggle=""
            aria-label={playing ? "Pause" : "Play"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setUserPaused(playing)}
          >
            {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
          </button>
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              aria-label={`Show event ${i + 1}`}
              aria-current={i === shown ? true : undefined}
              className="inline-flex h-11 w-6 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setIndex(i)}
            >
              <span
                aria-hidden="true"
                className={`block h-2.5 w-2.5 rounded-full transition-colors ${i === shown ? "bg-primary" : "bg-border"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
