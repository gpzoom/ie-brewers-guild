import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRecipient } from "./resolve-recipient.server";
import { GUILD_NOTIFICATION_EMAIL } from "./build-email-content";

function fakeSupabase(opts: {
  memberUser: { user_id: string } | null;
  userEmail: string | null;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "member_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.memberUser, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: opts.userEmail ? { user: { email: opts.userEmail } } : { user: null },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("resolveRecipient", () => {
  it("member_invited uses the payload's own email, with no DB lookup", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient({ trigger: "member_invited", memberId: "m1", email: "new@example.com" }, supabase);
    expect(to).toBe("new@example.com");
  });

  it("contact_confirmation uses the payload's own email", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "contact_confirmation", inquiryId: "i1", name: "Jo", email: "jo@example.com", wantsMembershipInfo: false },
      supabase,
    );
    expect(to).toBe("jo@example.com");
  });

  it("contact_form_submitted always goes to the Guild's notification address", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      {
        trigger: "contact_form_submitted",
        inquiryId: "i1",
        name: "Jo",
        email: "jo@example.com",
        phone: null,
        message: null,
        wantsMembershipInfo: false,
      },
      supabase,
    );
    expect(to).toBe(GUILD_NOTIFICATION_EMAIL);
  });

  it("creator_upload_pending resolves the first member_users owner's real email", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: "owner@example.com" });
    const to = await resolveRecipient(
      { trigger: "creator_upload_pending", memberId: "m1", assetId: "a1", creatorName: null },
      supabase,
    );
    expect(to).toBe("owner@example.com");
  });

  it("hours_stale resolves the first member_users owner's real email", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: "owner@example.com" });
    const to = await resolveRecipient(
      { trigger: "hours_stale", memberId: "m1", confirmUrl: "https://x/y" },
      supabase,
    );
    expect(to).toBe("owner@example.com");
  });

  it("returns null when the member has no member_users row yet (unclaimed, imported member)", async () => {
    const supabase = fakeSupabase({ memberUser: null, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "hours_stale", memberId: "m1", confirmUrl: "https://x/y" },
      supabase,
    );
    expect(to).toBeNull();
  });

  it("returns null when the member_users row's user can't be looked up", async () => {
    const supabase = fakeSupabase({ memberUser: { user_id: "u1" }, userEmail: null });
    const to = await resolveRecipient(
      { trigger: "creator_upload_pending", memberId: "m1", assetId: "a1", creatorName: null },
      supabase,
    );
    expect(to).toBeNull();
  });
});
