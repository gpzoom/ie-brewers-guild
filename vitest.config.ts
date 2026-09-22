import { defineConfig } from "vite";
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
