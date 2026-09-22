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
          // A custom `files` array REPLACES TanStack Start's own default
          // (["**/*.server.*"]) rather than merging with it, so the
          // default pattern must be listed explicitly alongside our own
          // "**/server/**" or every *.server.ts file loses file-based
          // import protection project-wide. This is defense-in-depth --
          // createServerOnlyFn's compile-time body-stripping is the real,
          // still-working guarantee against secret leaks -- but it costs
          // nothing to keep both patterns active.
          files: ["**/*.server.*", "**/server/**"],
          // src/lib/members/member-profile.server.ts is the one file in
          // this repo the restored "**/*.server.*" default pattern would
          // now also catch, and it's a deliberate exception, not a gap:
          // its ONLY export is `getMemberProfileData`, a
          // createServerFn().handler(...) call -- already the exact safe
          // client/server RPC boundary this deny rule exists to push
          // people toward (see the plugin's own "Import denied" message).
          // src/routes/members_.$slug.tsx imports it directly by design,
          // per TanStack Start's own createServerFn convention -- that is
          // not a violation to catch, so it's excluded here rather than
          // renamed off the *.server.* convention project-wide.
          //
          // "**/node_modules/**" MUST stay listed here too -- a custom
          // `excludeFiles` array replaces the framework's own default
          // (["**/node_modules/**"]) rather than merging with it, exactly
          // the same replace-not-merge behavior that caused the original
          // `files` bug this config is fixing. Nothing in today's
          // dependency graph trips this, but the first future dependency
          // that ships its own `.server.`/`server/`-named file would
          // otherwise hard-fail the client build with a confusing "Import
          // denied" error from inside node_modules.
          excludeFiles: ["**/node_modules/**", "src/lib/members/member-profile.server.ts"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
  ];

  // The Cloudflare plugin must also run in `vite dev` so that
  // `import { env } from "cloudflare:workers"` resolves locally inside
  // createServerFn/createServerOnlyFn handlers (src/lib/supabase/server.ts
  // and the private-media streaming route depend on this). It previously
  // only ran for `command === "build"" -- that gate is gone.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const configPath = mode === "staging" ? "./wrangler.staging.jsonc" : "./wrangler.jsonc";
  plugins.push(cloudflare({ configPath, viteEnvironment: { name: "ssr" } }));

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
