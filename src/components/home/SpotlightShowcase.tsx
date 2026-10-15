import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  AWARD_LABEL,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  beatsOf,
  markerPath,
  zoomFor,
  type Spotlight,
  type SpotlightAward,
} from "@/lib/home/spotlight";

/**
 * The homepage spotlight (docs/member-profiles.md, "Homepage" > "Spotlight"):
 * award slides, one highlighted name at a time. For each name the slide
 * shows in full, then glides in close, the rest dims, and an orange marker
 * loop draws itself around the name (owner, 2026-10-14). The caption under
 * the slide says the same in plain text.
 *
 * Like the events carousel it plays by itself and stops on Pause, while the
 * mouse is over it and while keyboard focus is inside it; it also waits
 * while scrolled out of view, so nobody misses the reveal. With reduced
 * motion there's no glide or drawing, and it doesn't play by itself.
 */

/** How long each name stays up, from the slide appearing to the next name. */
const BEAT_MS = 7000;
/** Full view before gliding in (a new slide only). */
const OVERVIEW_MS = 900;
/** The glide, then the loop draws. */
const GLIDE_MS = 1200;

const AWARD_COLORS: Record<SpotlightAward, { background: string; color: string }> = {
  gold: { background: "#D9AE3B", color: "#241F1A" },
  silver: { background: "#B9BEC5", color: "#241F1A" },
  bronze: { background: "#C27C4E", color: "#241F1A" },
  finalist: { background: "var(--primary)", color: "var(--primary-foreground)" },
};

const controlClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Whether focus arrived by keyboard (a mouse click on a button doesn't pause it). */
function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return (
      target instanceof Element &&
      target.matches(":focus-visible") &&
      !target.hasAttribute("data-spotlight-toggle")
    );
  } catch {
    return false;
  }
}

type Phase = "overview" | "zoom" | "circle";

export function SpotlightShowcase({ spotlight }: { spotlight: Spotlight }) {
  const beats = useMemo(() => beatsOf(spotlight), [spotlight]);
  const count = beats.length;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const phone = useMediaQuery("(max-width: 767px)");

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("overview");
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<number | null>(null);
  const previousSlide = useRef<number | null>(null);

  const beat = beats[Math.min(index, count - 1)];
  const slide = spotlight.slides[beat.slideIndex];
  const highlight = slide.highlights[beat.highlightIndex];

  const playing = count > 1 && !userPaused && !reducedMotion;
  const running = playing && !hovered && !focused && visible;

  // Waits for the section to be on screen before the first reveal.
  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.6,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The reveal for the current name: full view (new slide only), glide, draw.
  useEffect(() => {
    if (reducedMotion) {
      setPhase("circle");
      previousSlide.current = beat.slideIndex;
      return;
    }
    if (!visible) {
      // Scrolled away: the next time it's on screen, the reveal starts over.
      previousSlide.current = null;
      setPhase("overview");
      return;
    }
    const sameSlide = previousSlide.current === beat.slideIndex;
    previousSlide.current = beat.slideIndex;
    setPhase(sameSlide ? "zoom" : "overview");
    const timers = [
      window.setTimeout(() => setPhase("zoom"), sameSlide ? 0 : OVERVIEW_MS),
      window.setTimeout(() => setPhase("circle"), (sameSlide ? 0 : OVERVIEW_MS) + GLIDE_MS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per beat, or when it comes into view
  }, [index, reducedMotion, visible]);

  const go = useCallback(
    (next: number) => {
      if (count < 2) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(index + 1), BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, go]);

  const zoomed = phase !== "overview";
  const zoom = zoomed ? zoomFor(highlight.box, phone ? 2.8 : 1.9) : { scale: 1, x: 0, y: 0 };
  const motion = reducedMotion ? "none" : `transform ${GLIDE_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`;
  const pad = 16;
  const hole = {
    x: highlight.box.x - pad,
    y: highlight.box.y - pad,
    w: highlight.box.w + pad * 2,
    h: highlight.box.h + pad * 2,
  };
  const maskId = `spotlight-mask-${spotlight.id}`;
  const blurId = `spotlight-blur-${spotlight.id}`;
  const award = AWARD_COLORS[highlight.award];

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch") pointerStart.current = event.clientX;
  }
  function onPointerUp(event: PointerEvent) {
    if (pointerStart.current === null) return;
    const dx = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? index + 1 : index - 1);
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={spotlight.eyebrow}
      className="flex flex-col gap-8"
      onKeyDown={onKeyDown}
      onFocus={(event) => setFocused(isKeyboardFocus(event.target))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="max-w-2xl">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          {spotlight.eyebrow}
        </div>
        <h2 className="text-3xl md:text-4xl">{spotlight.title}</h2>
        <p className="mt-3 text-muted-foreground">{spotlight.intro}</p>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        {/* The slide: image and overlay share one stage, so they glide together. */}
        <div
          ref={frameRef}
          className="relative aspect-video w-full touch-pan-y overflow-hidden rounded-[20px] bg-[#FBF8F2] shadow-lg"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            key={beat.slideIndex}
            // A pixel of overhang on every side, so no seam shows at the frame's edge.
            className="spotlight-slide-in absolute -inset-px origin-top-left"
            style={{
              transform: `translate(${zoom.x}%, ${zoom.y}%) scale(${zoom.scale})`,
              transition: motion,
            }}
          >
            <img
              src={slide.image}
              alt={slide.alt}
              width={SLIDE_WIDTH}
              height={SLIDE_HEIGHT}
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
              decoding="async"
            />
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%">
                  <feGaussianBlur stdDeviation="14" />
                </filter>
                <mask id={maskId}>
                  <rect width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill="white" />
                  <rect
                    x={hole.x}
                    y={hole.y}
                    width={hole.w}
                    height={hole.h}
                    rx="40"
                    fill="black"
                    filter={`url(#${blurId})`}
                    style={{ transition: reducedMotion ? "none" : "all 600ms ease" }}
                  />
                </mask>
              </defs>
              <rect
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                fill="#171410"
                mask={`url(#${maskId})`}
                style={{
                  opacity: zoomed ? 0.58 : 0,
                  transition: reducedMotion ? "none" : "opacity 900ms ease",
                }}
              />
              {phase === "circle" && (
                <path
                  key={index}
                  d={markerPath(highlight.box)}
                  pathLength={1}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={reducedMotion ? undefined : "spotlight-draw"}
                  style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }}
                />
              )}
            </svg>
          </div>
        </div>

        {/* The same news in plain text: readable on any screen, and for screen readers. */}
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div
            key={index}
            className="spotlight-caption-in flex min-w-0 flex-col gap-1.5"
            aria-live={running ? "off" : "polite"}
            aria-atomic="true"
          >
            <span
              className="w-fit rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em]"
              style={award}
            >
              {AWARD_LABEL[highlight.award]}
            </span>
            <p className="font-display text-[26px] leading-tight md:text-[30px]">
              {highlight.beer}
            </p>
            <p className="text-[16px] font-semibold text-foreground">
              {highlight.brewery} · {highlight.city}
            </p>
            <p className="text-[14px] text-muted-foreground">{slide.category}</p>
            {highlight.memberSlug && (
              <Link
                to="/members/$slug"
                params={{ slug: highlight.memberSlug }}
                className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-primary"
              >
                See their profile →
              </Link>
            )}
          </div>

          {count > 1 && (
            <div className="flex shrink-0 flex-col gap-3 md:items-end">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Previous"
                  className={controlClass}
                  onClick={() => go(index - 1)}
                >
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  data-spotlight-toggle=""
                  aria-label={playing ? "Pause" : "Play"}
                  className={controlClass}
                  onClick={() => setUserPaused(playing)}
                  disabled={reducedMotion}
                >
                  {playing ? (
                    <Pause aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Play aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className={controlClass}
                  onClick={() => go(index + 1)}
                >
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                {spotlight.slides.map((s, i) => {
                  const first = beats.findIndex((b) => b.slideIndex === i);
                  const current = i === beat.slideIndex;
                  return (
                    <button
                      key={s.image}
                      type="button"
                      aria-label={`Slide ${i + 1} of ${spotlight.slides.length}`}
                      aria-current={current ? "true" : undefined}
                      onClick={() => go(first)}
                      className="flex h-11 w-7 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span
                        className={`block h-2 rounded-full transition-all ${current ? "w-6 bg-primary" : "w-2 bg-border"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
