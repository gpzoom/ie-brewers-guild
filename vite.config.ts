import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// Replaces @lovable.dev/vite-tanstack-config. See MIGRATION_STAGE1.md for what
// was intentionally dropped (Lovable-sandbox-only plugins) vs. kept.
// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig(async ({ command, mode }) => {
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
  ];

  // Cloudflare plugin only applies to production builds, matching the
  // original config's behavior (it never ran in `vite dev`).
  if (command === "build") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    const configPath = mode === "staging" ? "./wrangler.staging.jsonc" : "./wrangler.jsonc";
    plugins.push(cloudflare({ configPath, viteEnvironment: { name: "ssr" } }));
  }

  return {
    plugins,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: {
      host: "::",
      port: 8080,
    },
  };
});
