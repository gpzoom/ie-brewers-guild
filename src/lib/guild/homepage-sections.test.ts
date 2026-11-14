import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteAnnouncementCore,
  deleteGalleryImageCore,
  listHomepageSectionsCore,
  moveSectionCore,
  saveAnnouncementCore,
  saveGalleryImageCore,
  setSectionEnabledCore,
  updateGalleryAltCore,
} from "./homepage-sections";

const now = new Date("2026-11-14T20:00:00Z");

type Write = { table: string; op: string; values?: unknown; filters: Array<[string, unknown]> };

/** A fake session client: reads answer from `tables`, writes are recorded in `writes`. */
function fakeSession(isSuperAdmin: boolean, tables: Record<string, unknown[]> = {}) {
  const writes: Write[] = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "me@example.com" } },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: null, error: null };
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_guild_admin: true, is_super_admin: isSuperAdmin },
                error: null,
              }),
            }),
          }),
        };
      }
      const rows = tables[table] ?? [];
      let write: Write | null = null;
      const filters: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {};
      const result = () => ({ data: write ? rows : rows, error: null });
      for (const op of ["insert", "update", "delete"]) {
        builder[op] = (values?: unknown) => {
          write = { table, op, values, filters };
          writes.push(write);
          return builder;
        };
      }
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        filters.push([col, val]);
        return builder;
      };
      builder.in = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      builder.single = async () => ({ data: rows[0] ?? { id: "new-id" }, error: null });
      builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, writes, rpcs };
}

const announcement = {
  imageId: "img-1",
  altText: null,
  linkKind: "none" as const,
  linkTarget: null,
  startsOn: null,
  endsOn: null,
  enabled: true,
};

describe("homepage sections: super admin only", () => {
  it("a Guild admin is refused by every core, and nothing is written", async () => {
    const s = fakeSession(false);
    const c = s.client;
    const refusal = "Only the super admin can change the homepage.";
    await expect(listHomepageSectionsCore(c, now)).rejects.toThrow(refusal);
    await expect(setSectionEnabledCore(c, "a", true, now)).rejects.toThrow(refusal);
    await expect(moveSectionCore(c, "a", 1)).rejects.toThrow(refusal);
    await expect(saveAnnouncementCore(c, announcement, now)).rejects.toThrow(refusal);
    await expect(deleteAnnouncementCore(c, "a")).rejects.toThrow(refusal);
    await expect(
      saveGalleryImageCore(
        c,
        { path: "announcements/a.jpg", altText: "A", width: null, height: null },
        now,
      ),
    ).rejects.toThrow(refusal);
    await expect(updateGalleryAltCore(c, "a", "A", now)).rejects.toThrow(refusal);
    await expect(deleteGalleryImageCore(c, "a")).rejects.toThrow(refusal);
    expect(s.writes).toEqual([]);
    expect(s.rpcs).toEqual([]);
  });
});

describe("saveAnnouncementCore", () => {
  it("rejects a javascript: link and an end date before the start date", async () => {
    const s = fakeSession(true);
    await expect(
      saveAnnouncementCore(
        s.client,
        { ...announcement, linkKind: "external", linkTarget: "javascript:alert(1)" },
        now,
      ),
    ).rejects.toThrow("Web addresses start with https://");
    await expect(
      saveAnnouncementCore(s.client, { ...announcement, linkKind: "internal", linkTarget: " " }, now),
    ).rejects.toThrow("Choose a page or enter a web address.");
    await expect(
      saveAnnouncementCore(
        s.client,
        { ...announcement, startsOn: "2026-12-10", endsOn: "2026-12-01" },
        now,
      ),
    ).rejects.toThrow("The end date is before the start date.");
    expect(s.writes).toEqual([]);
  });

  it("new rows go after the last position; trims the link and stores null for an empty alt", async () => {
    const s = fakeSession(true, { homepage_sections: [{ position: 4 }] });
    await saveAnnouncementCore(
      s.client,
      { ...announcement, altText: "  ", linkKind: "external", linkTarget: " https://example.com " },
      now,
    );
    const insert = s.writes.find((w) => w.op === "insert");
    expect(insert?.values).toMatchObject({
      kind: "image",
      position: 5,
      image_id: "img-1",
      alt_text: null,
      link_kind: "external",
      link_target: "https://example.com",
    });
  });
});

describe("setSectionEnabledCore", () => {
  it("the spotlight row writes only its own row (the old switch is retired)", async () => {
    const s = fakeSession(true, { homepage_sections: [{ kind: "spotlight" }] });
    await setSectionEnabledCore(s.client, "sp", false, now);
    expect(s.writes.map((w) => `${w.table}:${w.op}`)).toEqual(["homepage_sections:update"]);
  });

  it("other rows leave site_settings alone", async () => {
    const s = fakeSession(true, { homepage_sections: [{ kind: "events" }] });
    await setSectionEnabledCore(s.client, "ev", false, now);
    expect(s.writes.map((w) => w.table)).toEqual(["homepage_sections"]);
  });
});

describe("moveSectionCore", () => {
  it("calls the RPC", async () => {
    const s = fakeSession(true);
    await moveSectionCore(s.client, "a", -1);
    expect(s.rpcs).toEqual([{ fn: "move_homepage_section", args: { p_id: "a", p_direction: -1 } }]);
  });
});

describe("gallery", () => {
  it("won't delete an image used by an announcement, and names it", async () => {
    const s = fakeSession(true, {
      announcement_images: [{ image_path: "announcements/a.jpg" }],
      homepage_sections: [{ alt_text: "Holiday parties", image: { alt_text: "Party" } }],
    });
    await expect(deleteGalleryImageCore(s.client, "img-1")).rejects.toThrow(
      "In use by: Holiday parties. Remove it from those announcements first.",
    );
    expect(s.writes).toEqual([]);
  });

  it("deletes an unused image and returns its path", async () => {
    const s = fakeSession(true, { announcement_images: [{ image_path: "announcements/a.jpg" }] });
    // homepage_sections has no rows in this fake, so nothing uses it
    const out = await deleteGalleryImageCore(s.client, "img-1");
    expect(out).toEqual({ removedPath: "announcements/a.jpg" });
    expect(s.writes.map((w) => `${w.table}:${w.op}`)).toEqual(["announcement_images:delete"]);
  });

  it("requires a description", async () => {
    const s = fakeSession(true);
    await expect(
      saveGalleryImageCore(
        s.client,
        { path: "announcements/a.jpg", altText: "  ", width: null, height: null },
        now,
      ),
    ).rejects.toThrow("Add a short description of the image.");
    await expect(updateGalleryAltCore(s.client, "img-1", "", now)).rejects.toThrow(
      "Add a short description of the image.",
    );
    expect(s.writes).toEqual([]);
  });
});

describe("deleteAnnouncementCore", () => {
  it("deletes only the image section row, never the gallery", async () => {
    const s = fakeSession(true);
    await deleteAnnouncementCore(s.client, "sec-1");
    expect(s.writes.map((w) => w.table)).toEqual(["homepage_sections"]);
    expect(s.writes[0].filters).toContainEqual(["kind", "image"]);
  });
});

describe("listHomepageSectionsCore", () => {
  it("returns statuses, gallery usage, and member pages with the city for multi-location members", async () => {
    const s = fakeSession(true, {
      homepage_sections: [
        {
          id: "sec-1",
          kind: "image",
          position: 1,
          enabled: true,
          image_id: "img-1",
          alt_text: null,
          link_kind: "none",
          link_target: null,
          starts_on: "2026-12-01",
          ends_on: null,
          image: { image_path: "announcements/a.jpg", alt_text: "Holiday parties", width: 10, height: 5 },
        },
      ],
      announcement_images: [
        { id: "img-1", image_path: "announcements/a.jpg", alt_text: "Holiday parties", width: 10, height: 5 },
      ],
      members: [
        { id: "m1", slug: "hangar-24-redlands", business_name: "Hangar 24", business_id: "b", city: "Redlands" },
        { id: "m2", slug: "hangar-24-riverside", business_name: "Hangar 24", business_id: "b", city: "Riverside" },
        { id: "m3", slug: "solo", business_name: "Solo Brewing", business_id: null, city: "Upland" },
      ],
    });
    const out = await listHomepageSectionsCore(s.client, now);
    expect(out.sections[0]).toMatchObject({
      status: "scheduled",
      imageUrl: "https://cdn.test/announcements/a.jpg",
    });
    expect(out.gallery[0]).toMatchObject({
      id: "img-1",
      imageUrl: "https://cdn.test/announcements/a.jpg",
      alt: "Holiday parties",
      usedBy: ["Holiday parties"],
    });
    expect(out.memberPages).toEqual([
      { path: "/members/hangar-24-redlands", label: "Hangar 24 · Redlands" },
      { path: "/members/hangar-24-riverside", label: "Hangar 24 · Riverside" },
      { path: "/members/solo", label: "Solo Brewing" },
    ]);
  });
});
