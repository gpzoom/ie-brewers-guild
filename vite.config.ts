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
          // ics-refresh-cron.server.ts and hours-stale-cron.server.ts
          // (Task 29) are already covered by the "**/*.server.*" glob above
          // -- listed here explicitly too, redundantly but harmlessly, per
          // this task's own instructions. Unlike every file in excludeFiles
          // below, neither exports a createServerFn: refreshAllIcsConnections
          // and sendHoursStaleNotices are plain async functions with no
          // client caller at all, only ever dynamically imported from
          // src/server.ts's own `scheduled` handler (a Worker-only entry
          // point, never bundled for the client) -- so, deliberately, they
          // are NOT added to excludeFiles the way the sixteen RPC-boundary
          // files below are. Doing so would defeat the point of import
          // protection for these two: it would let the client bundle
          // reference code that talks to the service-role Supabase client
          // and reads HOURS_CONFIRM_SECRET.
          files: [
            "**/*.server.*",
            "**/server/**",
            "src/lib/events/ics-refresh-cron.server.ts",
            "src/lib/hours/hours-stale-cron.server.ts",
          ],
          // src/lib/members/member-profile.server.ts,
          // src/lib/auth/require-member-session.server.ts,
          // src/lib/members/member-basics.server.ts,
          // src/lib/hours/hours-editor.server.ts,
          // src/lib/media/media-gallery.server.ts,
          // src/lib/media/carousel.server.ts,
          // src/lib/media/cover.server.ts,
          // src/lib/media/logo.server.ts,
          // src/lib/media/upload-tokens.server.ts,
          // src/lib/media/creator-upload.server.ts,
          // src/lib/media/review-tray.server.ts,
          // src/lib/hours/publish-gate.server.ts,
          // src/lib/theme/member-theme.server.ts,
          // src/lib/events/events.server.ts,
          // src/lib/events/calendar-connection.server.ts, and
          // src/lib/hours/confirm-token.server.ts are the files in
          // this repo the restored "**/*.server.*" default pattern would
          // now also catch, and all sixteen are deliberate exceptions, not
          // a gap: every export of each file (`getMemberProfileData`;
          // `requireMemberSession`; `getMemberBasics`/`updateMemberBasics`;
          // `listHours`/`upsertHoursRow`/`deleteHoursRow`/
          // `upsertSpecialHoursRow`/`deleteSpecialHoursRow`;
          // `listMemberMedia`/`uploadMemberMedia`/`deleteMemberMedia`;
          // `listCarouselSlides`/`assignCarouselSlide`/
          // `unassignCarouselSlide`/`updateCarouselSlideCrop`/
          // `updateCarouselSlideLink`;
          // `getMemberCover`/`updateCoverAsset`/`updateCoverCrop`;
          // `uploadMemberLogo`/`getMemberLogo`;
          // `listUploadTokens`/`createUploadToken`/`revokeUploadToken`;
          // `submitCreatorUpload`;
          // `listPendingMedia`/`approvePendingMedia`/`rejectPendingMedia`;
          // `publishMemberProfile`/`unpublishMemberProfile`/
          // `getPublishGateData`; `updateMemberTheme`; `listEvents`/
          // `createEvent`/`updateEvent`/`deleteEvent`/`setEventOverlay`/
          // `clearEventOverlay`/`toggleEventHidden`;
          // `getCalendarConnection`/`saveIcsConnection`/
          // `refreshIcsConnectionNow` -- calendar-connection.server.ts's
          // other export, `syncOneIcsConnection`, is a plain function, not
          // a createServerFn, but it's never imported client-side either;
          // it's only ever called from refreshIcsConnectionNow's own
          // handler here and from the Task 29 cron, both server-only
          // contexts; `checkHoursConfirmToken`/`confirmHoursStale`)
          // is a createServerFn().handler(...) call
          // -- already the exact safe client/server RPC boundary this deny
          // rule exists to push people toward (see the plugin's own
          // "Import denied" message).
          // src/routes/members_.$slug.tsx, src/routes/admin.tsx (which
          // calls getPublishGateData straight from its own loader, and
          // renders PublishGateDialog.tsx, which calls
          // publishMemberProfile/unpublishMemberProfile from its own
          // onPublish/onUnpublish handlers the same way),
          // src/routes/admin.basics.tsx (plus BasicsForm.tsx, which calls
          // updateMemberBasics from an onBlur/onValueChange handler),
          // src/routes/admin.hours.tsx (plus HoursEditor.tsx, same
          // pattern), src/routes/admin.media.tsx (plus
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
          // imported straight into the route's own loader instead -- and
          // ReviewTray.tsx, which calls approvePendingMedia/
          // rejectPendingMedia from its own onApprove/onReject handlers the
          // same way -- listPendingMedia is likewise imported straight into
          // the route's own loader instead), src/routes/admin.theme.tsx
          // (plus ThemePicker.tsx, which calls updateMemberTheme from its
          // own onSelect handler the same way -- getMemberBasics is
          // imported straight into the route's own loader instead),
          // src/routes/admin.events.tsx (plus EventsEditor.tsx, which
          // calls createEvent/updateEvent/deleteEvent/setEventOverlay/
          // clearEventOverlay/toggleEventHidden from its own onAdd/
          // onFieldChange/onDelete/onOverlayChange/onToggleHidden handlers
          // the same way -- listEvents is likewise imported straight into
          // the route's own loader instead -- and CalendarConnectionPanel.tsx,
          // which calls saveIcsConnection/refreshIcsConnectionNow from its
          // own onSave/onRefreshNow handlers the same way -- getCalendarConnection
          // is likewise imported straight into the route's own loader
          // instead), and
          // src/routes/send.$token.tsx (its own SendPage component calls
          // submitCreatorUpload directly from its onSubmit handler -- this
          // is the one route in this list with no server-side loader/action
          // of its own calling anything from the same file; the whole
          // point of this exclusion is that submitCreatorUpload's ONLY
          // caller is this direct client-side RPC call, since routing it
          // through a route-level server.handlers.POST instead is exactly
          // what broke this in production the first time: nothing in the
          // client bundle referenced the function, so the compiler never
          // emitted its RPC provider module. See creator-upload.server.ts's
          // own doc comment), and
          // src/routes/api.confirm-hours.$token.tsx (its loader calls
          // checkHoursConfirmToken, and its own ConfirmHoursPage component
          // calls confirmHoursStale directly from its onConfirm handler --
          // same reasoning as send.$token.tsx just above: no route-level
          // server.handlers.POST, so the client bundle's own direct call is
          // confirmHoursStale's only path to being reachable at all)
          // import them directly by design, per TanStack
          // Start's own createServerFn convention -- that is not a
          // violation to catch, so all sixteen are excluded here rather
          // than renamed off the *.server.* convention project-wide. The
          // next file added to this list should get the same treatment: update
          // this comment to describe it too, so the gap that broke the
          // build for require-member-session.server.ts doesn't repeat.
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
            "src/lib/media/creator-upload.server.ts",
            "src/lib/media/review-tray.server.ts",
            "src/lib/hours/publish-gate.server.ts",
            "src/lib/theme/member-theme.server.ts",
            "src/lib/events/events.server.ts",
            "src/lib/events/calendar-connection.server.ts",
            "src/lib/hours/confirm-token.server.ts",
            // src/lib/links/member-links.server.ts (Task 30) -- same
            // reasoning as the sixteen files above: every export
            // (listMemberLinks, upsertMemberLink, deleteMemberLink,
            // updateMemberContact, getMemberContactInfo) is a
            // createServerFn().handler(...) call, and src/routes/admin.links.tsx
            // imports listMemberLinks/getMemberContactInfo straight into its
            // own loader while src/components/admin/LinksContactEditor.tsx
            // calls upsertMemberLink/deleteMemberLink/updateMemberContact
            // directly from its own onAdd/onFieldChange/onRemove/
            // onPhoneBlur/onContactEmailBlur handlers -- the same safe
            // client/server RPC boundary this deny rule exists to push
            // people toward, already covered by the "**/*.server.*" glob
            // above and excluded here for the same reason as the rest.
            "src/lib/links/member-links.server.ts",
            // src/lib/members/discount.server.ts (Task 31) -- same
            // reasoning as the files above: its one createServerFn export,
            // updateMemberDiscount, is called directly from
            // src/components/admin/DiscountEditor.tsx's own save() handler
            // (src/routes/admin.discount.tsx's loader instead reuses
            // member-basics.server.ts's getMemberBasics, already covered
            // by its own exclusion entry) -- the same safe client/server
            // RPC boundary this deny rule exists to push people toward,
            // already covered by the "**/*.server.*" glob above and
            // excluded here for the same reason as the rest.
            "src/lib/members/discount.server.ts",
            // src/lib/media/social-image.server.ts (Social Sharing Image
            // feature) -- same reasoning as cover.server.ts above: both of
            // its createServerFn exports (updateSocialImageAsset,
            // clearSocialImageAsset) are called directly from
            // src/components/admin/SocialImageEditor.tsx's own
            // onChooseAsset/onRemove handlers, and getMemberSocialImage is
            // imported straight into src/routes/admin.media.tsx's own
            // loader -- the same safe client/server RPC boundary this deny
            // rule exists to push people toward, already covered by the
            // "**/*.server.*" glob above and excluded here for the same
            // reason as the rest.
            "src/lib/media/social-image.server.ts",
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
