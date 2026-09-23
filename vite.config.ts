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
          // src/lib/members/member-profile.server.ts,
          // src/lib/auth/require-member-session.server.ts,
          // src/lib/members/member-basics.server.ts,
          // src/lib/hours/hours-editor.server.ts,
          // src/lib/media/media-gallery.server.ts,
          // src/lib/media/carousel.server.ts,
          // src/lib/media/cover.server.ts,
          // src/lib/media/logo.server.ts, and
          // src/lib/media/upload-tokens.server.ts are the files in this
          // repo the restored "**/*.server.*" default pattern would now
          // also catch, and all nine are deliberate exceptions, not a
          // gap: every export of each file (`getMemberProfileData`;
          // `requireMemberSession`; `getMemberBasics`/`updateMemberBasics`;
          // `listHours`/`upsertHoursRow`/`deleteHoursRow`/
          // `upsertSpecialHoursRow`/`deleteSpecialHoursRow`;
          // `listMemberMedia`/`uploadMemberMedia`/`deleteMemberMedia`;
          // `listCarouselSlides`/`assignCarouselSlide`/
          // `unassignCarouselSlide`/`updateCarouselSlideCrop`/
          // `updateCarouselSlideLink`;
          // `getMemberCover`/`updateCoverAsset`/`updateCoverCrop`;
          // `uploadMemberLogo`/`getMemberLogo`;
          // `listUploadTokens`/`createUploadToken`/`revokeUploadToken`) is a
          // createServerFn().handler(...) call -- already the exact safe
          // client/server RPC boundary this deny rule exists to push
          // people toward (see the plugin's own "Import denied" message).
          // src/routes/members_.$slug.tsx, src/routes/admin.tsx,
          // src/routes/admin.basics.tsx (plus BasicsForm.tsx, which calls
          // updateMemberBasics from an onBlur/onValueChange handler),
          // src/routes/admin.hours.tsx (plus HoursEditor.tsx, same
          // pattern), and src/routes/admin.media.tsx (plus
          // MediaGallery.tsx, which calls uploadMemberMedia/
          // deleteMemberMedia from its own handlers, CarouselEditor.tsx,
          // which calls assignCarouselSlide/unassignCarouselSlide/
          // updateCarouselSlideCrop/updateCarouselSlideLink the same way,
          // CoverEditor.tsx, which calls updateCoverAsset/
          // updateCoverCrop the same way -- getMemberCover is imported
          // straight into the route's own loader instead -- LogoUploader.tsx,
          // which calls uploadMemberLogo from its own onFileSelected handler
          // the same way -- getMemberLogo is likewise imported straight into
          // the route's own loader instead -- and CreatorLinkPanel.tsx, which
          // calls createUploadToken/revokeUploadToken from its own onCreate/
          // onRevoke handlers the same way -- listUploadTokens is likewise
          // imported straight into the route's own loader instead) import
          // them directly by design, per TanStack Start's own createServerFn
          // convention -- that is not a violation to catch, so all nine are
          // excluded here rather than renamed off the *.server.* convention
          // project-wide. The next file added to this list should get the
          // same treatment: update this comment to describe it too, so the
          // gap that broke the build for require-member-session.server.ts
          // doesn't repeat.
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
          excludeFiles: [
            "**/node_modules/**",
            "src/lib/members/member-profile.server.ts",
            "src/lib/auth/require-member-session.server.ts",
            "src/lib/members/member-basics.server.ts",
            "src/lib/hours/hours-editor.server.ts",
            "src/lib/media/media-gallery.server.ts",
            "src/lib/media/carousel.server.ts",
            "src/lib/media/cover.server.ts",
            "src/lib/media/logo.server.ts",
            "src/lib/media/upload-tokens.server.ts",
          ],
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
