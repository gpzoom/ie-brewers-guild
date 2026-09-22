// vitest/config's defineConfig (not plain "vite"'s) is what registers the
// `test` field's type augmentation on Vite's UserConfig -- required now
// that this file is included in tsconfig.json's `include` (finding #15)
// and actually type-checked by `tsc --noEmit`; "vite"'s own defineConfig
// has no `test` property and previously only escaped notice because this
// file was excluded from the TS project entirely.
import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// A separate, minimal Vite config for tests -- the app's own vite.config.ts
// pulls in the Cloudflare and TanStack Start plugins, neither of which
// pure-logic unit tests need or can run under Vitest's Node environment.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
