import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { markNotificationRead } from "@/lib/notifications/portal.server";
import {
  surfaceHref,
  type NotificationGroups,
  type NotificationItem,
} from "@/lib/notifications/portal-view";

/**
 * The Notifications screen (portal and /admin; spec 2026-11-13, "The member
 * portal: Notifications"): Open problems, Unread messages, then Resolved /
 * Read from the last 30 days, faded. Each item is the registry's portal
 * title, body and buttons. Opening a message, or clicking its button,
 * marks it read. No artboard yet: built from the portal's patterns, to be
 * restyled.
 */

const buttonClass =
  "inline-flex min-h-10 items-center rounded-[9px] border border-canvas-border bg-white px-3.5 text-[13px] font-semibold text-ink no-underline hover:bg-canvas-2";

function when(iso: string): string {
  // A fixed zone, so the server's render and the browser's agree (every member is in SoCal).
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(iso));
}

function GroupHeading({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
      {children}
    </h2>
  );
}

function Buttons({
  item,
  surface,
  onFollow,
}: {
  item: NotificationItem;
  surface: "portal" | "admin";
  onFollow?: () => void;
}) {
  if (item.buttons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {item.buttons.map((b) => (
        <Link
          key={b.label}
          to={surfaceHref(b.to, surface)}
          className={buttonClass}
          onClick={onFollow}
        >
          {b.label}
        </Link>
      ))}
    </div>
  );
}

function statusPill(item: NotificationItem) {
  const label = { open: "Open", resolved: "Resolved", unread: "Unread", read: "Read" }[item.status];
  const tone =
    item.status === "open"
      ? "bg-[#FEF3F2] text-[#B42318]"
      : item.status === "unread"
        ? "bg-ink text-canvas"
        : "bg-canvas-2 text-ink-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${tone}`}
    >
      {label}
    </span>
  );
}

function ItemCard({
  item,
  surface,
  faded = false,
}: {
  item: NotificationItem;
  surface: "portal" | "admin";
  faded?: boolean;
}) {
  return (
    <li
      className={`flex flex-col gap-2.5 rounded-[12px] border border-canvas-border bg-white px-[18px] py-[15px] ${faded ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-[9px]">
        <span className="text-[15px] font-semibold text-ink">{item.title}</span>
        {statusPill(item)}
        <span className="text-[12px] text-ink-subtle">{when(item.when)}</span>
      </div>
      {item.body && <p className="text-pretty text-[13px] leading-normal text-ink">{item.body}</p>}
      {!faded && <Buttons item={item} surface={surface} />}
    </li>
  );
}

/** An unread message: collapsed to its title; opening it (or its button) marks it read. */
function MessageCard({
  item,
  surface,
  onRead,
}: {
  item: NotificationItem;
  surface: "portal" | "admin";
  onRead: (item: NotificationItem) => void;
}) {
  return (
    <li className="rounded-[12px] border border-canvas-border bg-white px-[18px] py-[15px]">
      <details
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) onRead(item);
        }}
      >
        <summary className="flex cursor-pointer flex-wrap items-center gap-[9px]">
          <span className="text-[15px] font-semibold text-ink">{item.title}</span>
          {statusPill(item)}
          <span className="text-[12px] text-ink-subtle">{when(item.when)}</span>
        </summary>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {item.body && (
            <p className="text-pretty text-[13px] leading-normal text-ink">{item.body}</p>
          )}
          <Buttons item={item} surface={surface} onFollow={() => onRead(item)} />
        </div>
      </details>
    </li>
  );
}

export function NotificationsView({
  initial,
  surface,
}: {
  initial: NotificationGroups;
  surface: "portal" | "admin";
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initial);
  const [loaded, setLoaded] = useState(initial);
  if (initial !== loaded) {
    setLoaded(initial);
    setGroups(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const [marking] = useState(() => new Set<string>());

  async function markRead(item: NotificationItem) {
    if (item.kind !== "message" || item.status !== "unread" || marking.has(item.id)) return;
    marking.add(item.id);
    setError(null);
    try {
      await markNotificationRead({ data: { id: item.id } });
      // Shown as read straight away; the reload below moves it to Read and updates the count.
      setGroups((prev) => ({
        ...prev,
        unread: prev.unread.map((i) => (i.id === item.id ? { ...i, status: "read" } : i)),
      }));
      void router.invalidate();
    } catch (err) {
      marking.delete(item.id);
      setError(err instanceof Error ? err.message : "Couldn't mark that as read. Try again.");
    }
  }

  const empty = groups.open.length + groups.unread.length + groups.history.length === 0;

  return (
    <div className="flex flex-col gap-[26px]">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-bold leading-[1.15] text-ink md:text-[27px]">
          Notifications
        </h1>
        <p className="text-pretty text-[13px] text-ink-muted">
          Problems with your listing clear themselves once they're fixed. Resolved and read items
          stay here for 30 days.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}

      {empty && (
        <p className="rounded-[12px] border border-canvas-border bg-white px-[18px] py-[15px] text-[13px] text-ink-muted">
          You're all set. Nothing needs your attention.
        </p>
      )}

      {groups.open.length > 0 && (
        <section className="flex flex-col gap-3">
          <GroupHeading>Open</GroupHeading>
          <ul className="flex flex-col gap-3">
            {groups.open.map((item) => (
              <ItemCard key={item.id} item={item} surface={surface} />
            ))}
          </ul>
        </section>
      )}

      {groups.unread.length > 0 && (
        <section className="flex flex-col gap-3">
          <GroupHeading>Unread</GroupHeading>
          <ul className="flex flex-col gap-3">
            {groups.unread.map((item) => (
              <MessageCard key={item.id} item={item} surface={surface} onRead={markRead} />
            ))}
          </ul>
        </section>
      )}

      {groups.history.length > 0 && (
        <section className="flex flex-col gap-3">
          <GroupHeading>Resolved / Read (last 30 days)</GroupHeading>
          <ul className="flex flex-col gap-3">
            {groups.history.map((item) => (
              <ItemCard key={item.id} item={item} surface={surface} faded />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
