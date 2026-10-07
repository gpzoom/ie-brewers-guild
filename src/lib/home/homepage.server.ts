import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  CAROUSEL_WINDOW_DAYS,
  nextGuildEvent,
  selectCarouselEvents,
  type GuildEvent,
  type HomeEventCard,
  type HomeEventHost,
  type HomeEventInputRow,
  type HomeEventMember,
} from "@/lib/home/member-events";
import {
  DEFAULT_CAROUSEL_DWELL_SECONDS,
  SITE_SETTINGS_COLUMNS,
  toSiteSettingsView,
  type CarouselDwellSeconds,
  type SiteSettingsRow,
} from "@/lib/guild/site-settings";
import { getMemberThemeHex, type MemberThemeName } from "@/lib/theme/member-themes";
import { logoBackgroundColor } from "@/lib/members/logo-background";
import { guildEvents } from "@/data/site";
import { loadGuestInfo } from "@/lib/events/guest-info";

export type HomepageData = {
  cards: HomeEventCard[];
  guildEvent: GuildEvent | null;
  dwellSeconds: CarouselDwellSeconds;
  /** The uploaded hero image, or null for the built-in one. */
  heroImageUrl: string | null;
};

const EVENT_COLUMNS =
  "id, member_id, kind, title, description, starts_at, ends_at, all_day, venue_name, city, overlay_status, overlay_starts_at, is_hidden";

type MemberRow = {
  id: string;
  slug: string;
  business_name: string;
  theme: string | null;
  timezone: string | null;
  logo_asset_id: string | null;
  logo_background: string | null;
  cover_asset_id: string | null;
};

/** Published members' events (anon client: RLS keeps it to published, unhidden events). */
async function loadCards(now: Date): Promise<HomeEventCard[]> {
  const supabase = await getSupabaseServerClient();
  // A day back catches events still going on; a rescheduled event is found by its new time.
  const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + CAROUSEL_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: eventRows, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("kind", "event")
    .or(
      `and(starts_at.gte.${from},starts_at.lt.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lt.${to})`,
    );
  if (error) throw new Error(error.message);
  const rows = (eventRows ?? []) as HomeEventInputRow[];
  if (rows.length === 0) return [];

  // Guild Mobile members at taprooms: a stop with a shown link is the
  // taproom's card. A failed read just leaves every card as it was.
  const hostsByEventId = new Map<string, HomeEventHost>();
  const { data: linkRows } = await supabase
    .from("event_hosts")
    .select("event_id, host_member_id")
    .in("event_id", rows.map((row) => row.id))
    .eq("status", "shown");
  const links = (linkRows ?? []) as Array<{ event_id: string; host_member_id: string }>;
  if (links.length) {
    const memberOf = new Map(rows.map((row) => [row.id, row.member_id]));
    const guests = await loadGuestInfo(supabase, links.map((l) => memberOf.get(l.event_id) ?? ""));
    for (const l of links) {
      const guest = guests.get(memberOf.get(l.event_id) ?? "");
      if (guest) hostsByEventId.set(l.event_id, { hostMemberId: l.host_member_id, guest: { name: guest.name, tag: guest.tag } });
    }
  }

  const memberIds = [
    ...new Set([...rows.map((row) => row.member_id), ...[...hostsByEventId.values()].map((h) => h.hostMemberId)]),
  ];

  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .select("id, slug, business_name, theme, timezone, logo_asset_id, logo_background, cover_asset_id")
    .in("id", memberIds)
    .eq("status", "published");
  if (memberError) throw new Error(memberError.message);
  const published = (memberRows ?? []) as MemberRow[];

  const logoIds = published.map((m) => m.logo_asset_id).filter((id): id is string => Boolean(id));
  const logoUrls = new Map<string, string>();
  if (logoIds.length) {
    // media_assets' own RLS decides readability (approved + a published member's logo).
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, storage_path")
      .in("id", logoIds);
    for (const asset of (assets ?? []) as Array<{ id: string; storage_path: string }>) {
      logoUrls.set(
        asset.id,
        supabase.storage.from("member-logos").getPublicUrl(asset.storage_path).data.publicUrl,
      );
    }
  }

  const members = new Map<string, HomeEventMember>();
  for (const m of published) {
    const theme = (m.theme ?? "amber") as MemberThemeName;
    members.set(m.id, {
      id: m.id,
      slug: m.slug,
      businessName: m.business_name,
      themeHex: getMemberThemeHex(theme),
      timezone: m.timezone || "America/Los_Angeles",
      logoUrl: m.logo_asset_id ? (logoUrls.get(m.logo_asset_id) ?? null) : null,
      logoTileHex: logoBackgroundColor(m.logo_background, theme),
      coverAssetId: m.cover_asset_id,
    });
  }
  return selectCarouselEvents(rows, members, now, {}, hostsByEventId);
}

/**
 * The carousel's dwell time and the hero image. site_settings is readable
 * only by the super admin, so this public read uses the service role (like
 * getActiveBrandTokens) and falls back to the defaults if it can't.
 */
async function loadSettings(): Promise<{ dwellSeconds: CarouselDwellSeconds; heroImageUrl: string | null }> {
  try {
    const service = await getSupabaseServiceRoleClient();
    const { data } = await service
      .from("site_settings")
      .select(SITE_SETTINGS_COLUMNS)
      .eq("id", true)
      .maybeSingle();
    const view = toSiteSettingsView(data as SiteSettingsRow | null);
    return {
      dwellSeconds: view.carouselDwellSeconds,
      heroImageUrl: view.heroImagePath
        ? service.storage.from("site-images").getPublicUrl(view.heroImagePath).data.publicUrl
        : null,
    };
  } catch (err) {
    console.error("getHomepageData: couldn't read site_settings, using defaults", err);
    return { dwellSeconds: DEFAULT_CAROUSEL_DWELL_SECONDS, heroImageUrl: null };
  }
}

export const getHomepageData = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomepageData> => {
    const now = new Date();
    const [cards, settings] = await Promise.all([
      loadCards(now).catch((err) => {
        // The homepage must still load without the carousel.
        console.error("getHomepageData: couldn't load member events", err);
        return [] as HomeEventCard[];
      }),
      loadSettings(),
    ]);
    return { cards, guildEvent: nextGuildEvent(guildEvents, now), ...settings };
  },
);
