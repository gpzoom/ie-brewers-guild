import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Clock, MapPin, Pause, Play } from "lucide-react";
import { calendarPageDate, type GuildEvent, type HomeEventCard } from "@/lib/home/member-events";
import { formatTimeRange } from "@/components/profile/EventsModule";
import { linkifyText } from "@/lib/text/linkify";

/**
 * "Coming up at our members" (docs/member-profiles.md, "Homepage"; artboards
 * A, A2, A3): member events as tear-off calendar pages, built only from what
 * members already have (logo, theme color, cover photo, event text). A
 * Guild event, when one is coming up, is pinned first.
 *
 * It plays from page load and keeps looping when scrolled out of view
 * (owner, 2026-09-28: the motion invites exploring), advancing every
 * `dwellSeconds` (Super admin > Settings). It stops on Pause, while the
 * mouse is over the calendar page, and while keyboard focus is inside it
 * (a mouse click on a control doesn't count). Arrows, swipe and the Up next
 * list flip by hand. With reduced motion pages fade instead of tearing
 * (styles.css).
 */

type Slide = { kind: "guild"; event: GuildEvent } | { kind: "member"; card: HomeEventCard };

const PAPER = "#FBF8F2";
const INK = "#241F1A";
const INK_MUTED = "#6B6156";

function slideKey(slide: Slide): string {
  return slide.kind === "guild" ? `guild:${slide.event.slug}` : slide.card.id;
}

/** Whether focus arrived by keyboard (a mouse click on a button doesn't pause the carousel). */
function isKeyboardFocus(target: EventTarget): boolean {
  try {
    // The Play/Pause button itself doesn't count, or pressing Play from the
    // keyboard would leave it stopped.
    return (
      target instanceof Element &&
      target.matches(":focus-visible") &&
      !target.hasAttribute("data-carousel-toggle")
    );
  } catch {
    return false;
  }
}

function Description({ text }: { text: string }) {
  return (
    <p
      className="line-clamp-3 text-[14px] leading-[1.5]"
      style={{ color: "#3A332C" }}
    >
      {linkifyText(text).map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="relative z-10 break-all underline underline-offset-2"
            style={{ color: INK }}
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/** One tear-off calendar page (artboard A3 shows its states). */
function CalendarPage({ card }: { card: HomeEventCard }) {
  const { member } = card;
  const date = calendarPageDate(card.startsAt, member.timezone);
  const time = card.allDay ? "All day" : formatTimeRange(card.startsAt, card.endsAt, member.timezone);
  const place = [card.venue, card.city].filter(Boolean).join(" · ");
  return (
    <div className="relative w-full max-w-[440px]">
      {/* The pad's next two pages, peeking out underneath. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-3.5 -bottom-3.5 h-10 rounded-b-lg"
        style={{ background: "#DCD3C4" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[7px] -bottom-[7px] h-10 rounded-b-lg"
        style={{ background: "#EAE3D6" }}
      />
      <article
        className="relative overflow-hidden rounded-lg shadow-[0_18px_40px_rgba(0,0,0,0.35)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary"
        style={{ background: PAPER, color: INK }}
      >
        <div className="flex h-[62px] items-center gap-3 px-7" style={{ background: member.themeHex }}>
          <div
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{ background: member.logoTileHex }}
          >
            {member.logoUrl ? (
              <img src={member.logoUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-[13px] font-bold" style={{ color: INK_MUTED }}>
                {member.businessName.slice(0, 1)}
              </span>
            )}
          </div>
          <span className="truncate text-[14px] font-semibold text-white">{member.businessName}</span>
        </div>
        <div className="mx-2.5 border-t-2 border-dashed" style={{ borderColor: "#D3CBBD" }} />
        <div className="flex flex-col items-center gap-0.5 px-7 pb-5 pt-4">
          <span className="text-[13px] font-bold tracking-[0.3em]" style={{ color: INK_MUTED }}>
            {date.month}
          </span>
          <span
            className="font-display text-[112px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[132px]"
            style={{ color: member.themeHex }}
          >
            {date.day}
          </span>
          <span className="text-[13px] font-bold tracking-[0.3em]" style={{ color: INK_MUTED }}>
            {date.weekday}
          </span>
        </div>
        <div className="mx-7 border-t" style={{ borderColor: "#E6DFD2" }} />
        <div className="flex flex-col gap-2 px-7 pb-[18px] pt-4">
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <Clock aria-hidden="true" className="h-4 w-4" />
            <span>{card.rescheduled ? `Now ${time}` : time}</span>
            {card.rescheduled && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.08em]"
                style={{ background: "#F3E1D8", borderColor: "#D9A58C", color: "#8C2F1B" }}
              >
                RESCHEDULED
              </span>
            )}
          </div>
          <p className="line-clamp-2 font-display text-[24px] font-extrabold normal-case leading-[1.15] tracking-normal">
            <a
              href={`/members/${member.slug}#events`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {card.title}
            </a>
          </p>
          {place && (
            <p className="flex items-center gap-1.5 text-[13px]" style={{ color: INK_MUTED }}>
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
          {card.description && <Description text={card.description} />}
        </div>
        <div
          aria-hidden="true"
          className="flex min-h-12 items-center justify-between gap-3 border-t px-7 text-[13px]"
          style={{ borderColor: "#E6DFD2" }}
        >
          <span className="truncate" style={{ color: INK_MUTED }}>
            {member.businessName}
          </span>
          <span className="shrink-0 font-semibold underline underline-offset-[3px]">See their events →</span>
        </div>
      </article>
    </div>
  );
}

function guildDate(event: GuildEvent): { month: string; day: string; weekday: string } {
  // A date with no time: read it at noon Pacific so it can't slip a day.
  return calendarPageDate(`${event.date}T12:00:00-07:00`, "America/Los_Angeles");
}

/** The Guild's own event, pinned first: wider, with its poster and a tickets button. */
function GuildEventPage({ event }: { event: GuildEvent }) {
  const date = guildDate(event);
  return (
    <article className="flex w-full max-w-[880px] flex-col overflow-hidden rounded-[20px] border border-border bg-card md:flex-row">
      <div className="aspect-[4/3] shrink-0 md:aspect-auto md:w-[360px]">
        <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-6 md:p-9">
        <span className="self-start rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-primary-foreground">
          GUILD EVENT
        </span>
        <div className="flex items-baseline gap-3.5">
          <span className="font-display text-[64px] font-extrabold leading-none text-primary">{date.day}</span>
          <span className="flex flex-col text-[13px] font-bold tracking-[0.22em] text-muted-foreground">
            <span>{date.month}</span>
            <span>{date.weekday}</span>
          </span>
        </div>
        <p className="font-display text-[30px] font-extrabold normal-case leading-[1.1] tracking-normal md:text-[34px]">
          {event.title}
        </p>
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <MapPin aria-hidden="true" className="h-4 w-4" /> {event.location}
        </p>
        <p className="text-[15px] leading-[1.5] text-foreground/85">{event.excerpt}</p>
        {event.ticketsUrl && (
          <a
            href={event.ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex h-[46px] items-center self-start rounded-[9px] bg-primary px-5 text-[14px] font-bold text-primary-foreground hover:bg-primary/90"
          >
            Get tickets
          </a>
        )}
      </div>
    </article>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  return slide.kind === "guild" ? <GuildEventPage event={slide.event} /> : <CalendarPage card={slide.card} />;
}

/** The stage behind a page: the member's cover photo, blurred, or warm paper. */
function Backdrop({ slide }: { slide: Slide | undefined }) {
  const cover = slide?.kind === "member" ? slide.card.member.coverAssetId : null;
  return (
    <div aria-hidden="true" className="absolute inset-0" style={{ background: "#3A332C" }}>
      {cover && (
        <img
          key={cover}
          src={`/api/member-media/${cover}`}
          alt=""
          className="calendar-page-in h-full w-full scale-110 object-cover blur-2xl"
        />
      )}
      <div className="absolute inset-0 bg-background/35" />
    </div>
  );
}

function UpNextDate({ slide }: { slide: Slide }) {
  const color = slide.kind === "member" ? slide.card.member.themeHex : "var(--primary)";
  const date =
    slide.kind === "member"
      ? calendarPageDate(slide.card.startsAt, slide.card.member.timezone)
      : guildDate(slide.event);
  return (
    <span
      aria-hidden="true"
      className="flex h-[52px] w-12 shrink-0 flex-col items-center overflow-hidden rounded-md"
      style={{ background: PAPER }}
    >
      <span className="h-2 w-full" style={{ background: color }} />
      <span className="pt-[3px] font-display text-[22px] font-extrabold leading-[1.1]" style={{ color }}>
        {date.day}
      </span>
      <span className="text-[9px] font-bold tracking-[0.15em]" style={{ color: INK_MUTED }}>
        {date.month.slice(0, 3)}
      </span>
    </span>
  );
}

const controlClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function MemberEventsCarousel({
  cards,
  guildEvent,
  dwellSeconds,
}: {
  cards: HomeEventCard[];
  guildEvent: GuildEvent | null;
  dwellSeconds: number;
}) {
  const slides: Slide[] = [
    ...(guildEvent ? [{ kind: "guild" as const, event: guildEvent }] : []),
    ...cards.map((card) => ({ kind: "member" as const, card })),
  ];
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState<{ slide: Slide; id: number } | null>(null);
  const pointerStart = useRef<number | null>(null);

  const playing = count > 1 && !userPaused;
  const running = playing && !hovered && !focused;

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const go = useCallback(
    (next: number) => {
      if (count < 2) return;
      const target = ((next % count) + count) % count;
      if (target === index) return;
      setLeaving({ slide: slidesRef.current[index], id: Date.now() });
      setIndex(target);
    },
    [count, index],
  );

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(index + 1), dwellSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, index, dwellSeconds, go]);

  if (count === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[20px] border border-border bg-card p-8 text-center">
        <p className="font-display text-[24px] font-extrabold normal-case tracking-normal">
          No member events in the next two weeks.
        </p>
        <Link to="/members" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-primary">
          See who's pouring →
        </Link>
      </div>
    );
  }

  const current = slides[Math.min(index, count - 1)];
  const upNext = count > 1 ? [1, 2, 3].filter((k) => k < count).map((k) => (index + k) % count) : [];

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

  const stage = (
    <div
      className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-[20px] px-5 py-10 md:min-h-[640px] md:px-6 md:py-14"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <Backdrop slide={current} />
      <div
        className="relative flex w-full justify-center"
        aria-live={running ? "off" : "polite"}
        aria-atomic="true"
      >
        <div key={slideKey(current)} className="calendar-page-in flex w-full justify-center">
          {/* Hovering the page itself pauses, so it can be read. */}
          <div
            className="flex w-full justify-center"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <SlideView slide={current} />
          </div>
        </div>
        {leaving && (
          <div
            key={leaving.id}
            aria-hidden="true"
            className="calendar-tear-off pointer-events-none absolute inset-x-0 top-0 flex justify-center"
            onAnimationEnd={() => setLeaving(null)}
          >
            <SlideView slide={leaving.slide} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Coming up at our members"
      className="grid grid-cols-[minmax(0,1fr)] gap-8 [grid-template-areas:'head'_'stage'_'rest'] md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:gap-x-16 md:gap-y-9 md:[grid-template-areas:'head_stage'_'rest_stage']"
      onKeyDown={onKeyDown}
      onFocus={(event) => setFocused(isKeyboardFocus(event.target))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="[grid-area:head] md:self-end">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Around the Guild</div>
        <h2 className="text-3xl md:text-4xl">Coming up at our members</h2>
        <p className="mt-3 max-w-[440px] text-muted-foreground">
          Taproom nights, releases and pop-ups from Guild members over the next two weeks.
        </p>
      </div>

      <div className="[grid-area:stage] md:self-center">{stage}</div>

      <div className="flex flex-col gap-8 [grid-area:rest] md:self-start">
        {count > 1 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <button type="button" aria-label="Previous event" className={controlClass} onClick={() => go(index - 1)}>
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                data-carousel-toggle=""
                aria-label={playing ? "Pause" : "Play"}
                className={controlClass}
                onClick={() => {
                  setUserPaused(playing);
                }}
              >
                {playing ? (
                  <Pause aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Play aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
              <button type="button" aria-label="Next event" className={controlClass} onClick={() => go(index + 1)}>
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
              <span className="ml-1.5 text-[13px] text-muted-foreground">
                {index + 1} of {count}
              </span>
            </div>
            <div aria-hidden="true" className="h-[3px] w-full max-w-[260px] overflow-hidden rounded-full bg-border">
              <div
                key={`${index}:${playing}`}
                className="h-full origin-left bg-primary"
                style={
                  playing
                    ? {
                        animation: `carousel-progress ${dwellSeconds}s linear forwards`,
                        animationPlayState: running ? "running" : "paused",
                      }
                    : { transform: "scaleX(0)" }
                }
              />
            </div>
          </div>
        )}

        {upNext.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="pb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Up next
            </div>
            {upNext.map((i) => {
              const slide = slides[i];
              const title = slide.kind === "guild" ? slide.event.title : slide.card.title;
              const who = slide.kind === "guild" ? "ISC Brewers Guild" : slide.card.member.businessName;
              return (
                <button
                  key={slideKey(slide)}
                  type="button"
                  onClick={() => go(i)}
                  className="flex min-h-14 items-center gap-3.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <UpNextDate slide={slide} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold text-foreground">{title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{who}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <Link
          to="/members"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold uppercase tracking-wider text-primary hover:text-primary/80"
        >
          Meet all our members →
        </Link>
      </div>
    </div>
  );
}
