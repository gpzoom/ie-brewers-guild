import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitJoinCore, type JoinDeps } from "./submit-join-core";
import type { JoinInput } from "./join-validation";
import type { DuplicateResult } from "./duplicate-check";
import type { PlaceProfile } from "@/lib/google/place-profile";

const input: JoinInput = {
  email: "owner@example.com",
  businessName: "Sample Brewery",
  city: "Riverside",
  memberType: "producer",
  placeId: "ChIJabc123",
  honeypot: "",
};

const profile: PlaceProfile = {
  placeId: "ChIJabc123",
  businessName: "Sample Brewery",
  street_address: "1 Main St",
  city: "Riverside",
  state: "CA",
  postal_code: "92501",
  latitude: 33.9,
  longitude: -117.4,
  phone: "(951) 555-0100",
  website: "https://example.com",
  tagline: null,
  hours: null,
  permanentlyClosed: false,
};

function makeDeps(overrides: Partial<JoinDeps> = {}) {
  const calls: string[] = [];
  const deps: JoinDeps = {
    findDuplicate: vi.fn(async () => {
      calls.push("findDuplicate");
      return { kind: "none" } as DuplicateResult;
    }),
    getProfile: vi.fn(async () => {
      calls.push("getProfile");
      return profile;
    }),
    createApplicant: vi.fn(async () => {
      calls.push("createApplicant");
      return "member-1";
    }),
    createOrFindUser: vi.fn(async () => {
      calls.push("createOrFindUser");
      return { userId: "user-1", created: true };
    }),
    linkOwner: vi.fn(async () => {
      calls.push("linkOwner");
    }),
    deleteUser: vi.fn(async () => {
      calls.push("deleteUser");
    }),
    deleteMember: vi.fn(async () => {
      calls.push("deleteMember");
    }),
    sendGuildEmail: vi.fn(async () => {
      calls.push("sendGuildEmail");
    }),
    sendDraftLink: vi.fn(async () => {
      calls.push("sendDraftLink");
    }),
    ...overrides,
  };
  return { deps, calls };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("submitJoinCore", () => {
  it("new business: creates the applicant, links the owner, emails the Guild then the draft link", async () => {
    const { deps, calls } = makeDeps();
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(calls).toEqual([
      "findDuplicate",
      "getProfile",
      "createApplicant",
      "createOrFindUser",
      "linkOwner",
      "sendGuildEmail",
      "sendDraftLink",
    ]);
    expect(deps.findDuplicate).toHaveBeenCalledWith({
      businessName: "Sample Brewery",
      city: "Riverside",
      placeId: "ChIJabc123",
      email: "owner@example.com",
    });
    expect(deps.getProfile).toHaveBeenCalledWith("ChIJabc123");
    expect(deps.createApplicant).toHaveBeenCalledWith(input, profile);
    expect(deps.createOrFindUser).toHaveBeenCalledWith("owner@example.com");
    expect(deps.linkOwner).toHaveBeenCalledWith("member-1", "user-1");
    expect(deps.sendGuildEmail).toHaveBeenCalledWith("member-1");
    expect(deps.sendDraftLink).toHaveBeenCalledWith("owner@example.com", "Sample Brewery");
  });

  it("no place id: skips Google and creates the applicant from the typed fields", async () => {
    const { deps } = makeDeps();
    await expect(submitJoinCore(deps, { ...input, placeId: null })).resolves.toEqual({ kind: "check-email" });
    expect(deps.getProfile).not.toHaveBeenCalled();
    expect(deps.createApplicant).toHaveBeenCalledWith({ ...input, placeId: null }, null);
  });

  it("Google lookup fails at submit: proceeds without Google data", async () => {
    const { deps } = makeDeps({
      getProfile: vi.fn(async () => {
        throw new Error("Google lookup isn't set up");
      }),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(deps.createApplicant).toHaveBeenCalledWith(input, null);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("existing member: returns already-member and creates and sends nothing", async () => {
    const { deps, calls } = makeDeps({
      findDuplicate: vi.fn(async () => ({ kind: "existing", memberId: "m-9" }) as DuplicateResult),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "already-member" });
    expect(calls).toEqual([]);
    expect(deps.getProfile).not.toHaveBeenCalled();
    expect(deps.createApplicant).not.toHaveBeenCalled();
    expect(deps.createOrFindUser).not.toHaveBeenCalled();
    expect(deps.sendGuildEmail).not.toHaveBeenCalled();
    expect(deps.sendDraftLink).not.toHaveBeenCalled();
  });

  it("own application: no new member, no Guild email, just a fresh draft link", async () => {
    const { deps, calls } = makeDeps({
      findDuplicate: vi.fn(async () => ({ kind: "own-application", memberId: "m-7" }) as DuplicateResult),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(calls).toEqual(["sendDraftLink"]);
    expect(deps.createApplicant).not.toHaveBeenCalled();
    expect(deps.createOrFindUser).not.toHaveBeenCalled();
    expect(deps.linkOwner).not.toHaveBeenCalled();
    expect(deps.sendGuildEmail).not.toHaveBeenCalled();
    expect(deps.sendDraftLink).toHaveBeenCalledWith("owner@example.com", "Sample Brewery");
  });

  it("own application: a failed draft link is logged, still check-email", async () => {
    const { deps } = makeDeps({
      findDuplicate: vi.fn(async () => ({ kind: "own-application", memberId: "m-7" }) as DuplicateResult),
      sendDraftLink: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("link failure with a newly created user: deletes that user and the member, rethrows", async () => {
    const { deps } = makeDeps({
      linkOwner: vi.fn(async () => {
        throw new Error("link failed");
      }),
    });
    await expect(submitJoinCore(deps, input)).rejects.toThrow("link failed");
    expect(deps.deleteUser).toHaveBeenCalledWith("user-1");
    expect(deps.deleteMember).toHaveBeenCalledWith("member-1");
    expect(deps.sendGuildEmail).not.toHaveBeenCalled();
    expect(deps.sendDraftLink).not.toHaveBeenCalled();
  });

  it("link failure with an existing user: deletes only the member", async () => {
    const { deps } = makeDeps({
      createOrFindUser: vi.fn(async () => ({ userId: "user-old", created: false })),
      linkOwner: vi.fn(async () => {
        throw new Error("link failed");
      }),
    });
    await expect(submitJoinCore(deps, input)).rejects.toThrow("link failed");
    expect(deps.deleteUser).not.toHaveBeenCalled();
    expect(deps.deleteMember).toHaveBeenCalledWith("member-1");
  });

  it("user creation failure: deletes the member, rethrows", async () => {
    const { deps } = makeDeps({
      createOrFindUser: vi.fn(async () => {
        throw new Error("auth down");
      }),
    });
    await expect(submitJoinCore(deps, input)).rejects.toThrow("auth down");
    expect(deps.deleteUser).not.toHaveBeenCalled();
    expect(deps.deleteMember).toHaveBeenCalledWith("member-1");
  });

  it("a failing rollback still rethrows the original error", async () => {
    const { deps } = makeDeps({
      linkOwner: vi.fn(async () => {
        throw new Error("link failed");
      }),
      deleteUser: vi.fn(async () => {
        throw new Error("delete user failed");
      }),
      deleteMember: vi.fn(async () => {
        throw new Error("delete member failed");
      }),
    });
    await expect(submitJoinCore(deps, input)).rejects.toThrow("link failed");
  });

  it("Guild email failure doesn't block the draft link", async () => {
    const { deps } = makeDeps({
      sendGuildEmail: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(deps.sendDraftLink).toHaveBeenCalledWith("owner@example.com", "Sample Brewery");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("draft link failure after the applicant exists: logged, still check-email, nothing rolled back", async () => {
    const { deps } = makeDeps({
      sendDraftLink: vi.fn(async () => {
        throw new Error("generateLink failed");
      }),
    });
    await expect(submitJoinCore(deps, input)).resolves.toEqual({ kind: "check-email" });
    expect(deps.deleteMember).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("an email that already has a login gets the same check-email as a new one (no reveal)", async () => {
    const fresh = makeDeps();
    const existing = makeDeps({ createOrFindUser: vi.fn(async () => ({ userId: "user-old", created: false })) });
    const a = await submitJoinCore(fresh.deps, input);
    const b = await submitJoinCore(existing.deps, input);
    expect(b).toEqual(a);
    expect(b).toEqual({ kind: "check-email" });
    expect(existing.deps.linkOwner).toHaveBeenCalledWith("member-1", "user-old");
    expect(existing.deps.sendDraftLink).toHaveBeenCalled();
  });
});
