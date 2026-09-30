// Member how-to videos, hosted on the Guild's livid.com account. The embed
// URL plays in the "Watch how" pop-up; the watch page is for places that
// can't open a pop-up (the printed member guide).
export type HelpVideo = {
  title: string;
  /** Shown on the button, e.g. "2:47". */
  duration: string;
  embedUrl: string;
  watchUrl: string;
};

export const HELP_VIDEOS = {
  googleEventsCalendar: {
    title: "Connect your Google Calendar",
    duration: "2:47",
    embedUrl: "https://livid.com/embed/H1WWGjbnsr9p",
    watchUrl: "https://livid.com/watch/H1WWGjbnsr9p",
  },
} satisfies Record<string, HelpVideo>;
