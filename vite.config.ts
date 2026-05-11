// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Lovable's secret manager blocks names starting with `VITE_` (because Vite
// inlines those into the public client bundle). Browser-side Google Maps keys
// are intentionally public — they're protected by HTTP referrer restrictions —
// but the secret manager doesn't know that. We accept the same value under
// `AVITE_*` and inject it under `import.meta.env.AVITE_*` so client code can
// read it the same way as a normal VITE_ var.
const mode = process.env.NODE_ENV ?? "development";
const aviteEnv = loadEnv(mode, process.cwd(), "AVITE_");
const aviteDefine = Object.fromEntries(
  Object.entries(aviteEnv).map(([key, value]) => [
    `import.meta.env.${key}`,
    JSON.stringify(value),
  ]),
);

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: aviteDefine,
  },
});
