import { describe, expect, it } from "vitest";
import { missingBuildEnv, missingBuildEnvMessage, REQUIRED_BUILD_ENV } from "./required-build-env";

const full = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  VITE_GOOGLE_MAPS_API_KEY: "AIza-test",
};

describe("missingBuildEnv", () => {
  it("is empty when every required value is set", () => {
    expect(missingBuildEnv(full)).toEqual([]);
  });

  it("lists every value when there is no .env at all", () => {
    expect(missingBuildEnv({})).toEqual([...REQUIRED_BUILD_ENV]);
  });

  it("treats blank and whitespace-only values as missing", () => {
    expect(missingBuildEnv({ ...full, VITE_GOOGLE_MAPS_API_KEY: "", VITE_SUPABASE_URL: "  " })).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_GOOGLE_MAPS_API_KEY",
    ]);
  });

  it("does not require the survey-only Web3Forms key", () => {
    expect(REQUIRED_BUILD_ENV).not.toContain("VITE_WEB3FORMS_KEY");
  });
});

describe("missingBuildEnvMessage", () => {
  it("names the missing values and the mode", () => {
    const msg = missingBuildEnvMessage(["VITE_GOOGLE_MAPS_API_KEY"], "production");
    expect(msg).toContain("VITE_GOOGLE_MAPS_API_KEY is not set");
    expect(msg).toContain('mode "production"');
    expect(msg).toContain(".env");
  });
});
