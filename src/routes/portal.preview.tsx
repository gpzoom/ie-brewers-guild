import { createFileRoute, Link } from "@tanstack/react-router";
import { getPortalPreviewData } from "@/lib/portal/portal-shell.server";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";
import { StatusBand, bandButtonClass } from "@/components/shell/AppChrome";

/**
 * /portal/preview (docs/member-profiles.md, "Routes"): the member's draft in
 * the real profile template behind a "Preview · not live yet" band -- the
 * portal's twin of /admin/preview, for the member resolved from the
 * session. A Photos & events editor sees the live page with only their
 * photo changes, since that's what their Publish would put live.
 */
export const Route = createFileRoute("/portal/preview")({
  // Never reuse a previous visit's data: every member shares these URLs, so a
  // cached copy could show one member's profile while editing another.
  staleTime: 0,
  gcTime: 0,
  loader: () => getPortalPreviewData(),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `Preview: ${loaderData?.profile.member.business_name ?? "your profile"} — Inland Southern California Brewers Guild`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const { profile, appliedSections, isPublished } = Route.useLoaderData();
  const photosOnly = appliedSections.length === 1 && appliedSections[0] === "media";
  return (
    <>
      <StatusBand
        message={
          <>
            Preview · not live yet.{" "}
            <span className="font-normal">
              {photosOnly
                ? "Your live page with your unpublished photo changes."
                : "This is your profile with your unpublished changes."}
            </span>
          </>
        }
        actions={
          <>
            <Link to="/portal" className={bandButtonClass}>
              Back to editing
            </Link>
            {isPublished && (
              <a href={`/members/${profile.member.slug}`} className={bandButtonClass}>
                View live page
              </a>
            )}
          </>
        }
      />
      <div className="pt-4 md:pt-6">
        <MemberProfileTemplate data={profile} search={{}} mediaMode="preview" />
      </div>
    </>
  );
}
