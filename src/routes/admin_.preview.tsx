import { createFileRoute, Link } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getMemberPreviewData } from "@/lib/members/member-profile.server";
import { MemberProfileTemplate } from "@/components/profile/MemberProfileTemplate";
import { StatusBand, bandButtonClass } from "@/components/shell/AppChrome";

/**
 * /admin/preview: the member's DRAFT rendered through the real profile
 * template (spec, "Drafts": "Preview renders the real profile template from
 * the draft"), behind a "Preview · not live yet" band. Opened from the
 * admin top bar's Preview button.
 *
 * Deliberately NOT a child of the /admin layout (the `admin_` prefix):
 * it's the public page's look -- dark site ground, the light profile card
 * -- not the admin shell with its sidebar. It runs the same member-session
 * check itself. /admin is a bare route prefix in __root.tsx (no site
 * header/footer), and this path is excluded from the canvas theme there so
 * the ground matches the live page.
 *
 * Photos load with mediaMode="preview" (/api/admin-media), since draft
 * photos aren't public yet.
 */
export const Route = createFileRoute("/admin_/preview")({
  beforeLoad: async () => {
    const session = await requireMemberSession();
    return { memberId: session.memberId };
  },
  loader: async ({ context }) => getMemberPreviewData({ data: { memberId: context.memberId } }),
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
            <Link to="/admin/basics" className={bandButtonClass}>
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
