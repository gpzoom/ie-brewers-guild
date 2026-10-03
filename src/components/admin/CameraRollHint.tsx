import type { ViewerRole } from "@/lib/drafts/sections";
import { InfoBox } from "@/components/admin/basics/ui";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";

/** The creator link panel's anchor (CreatorLinkPanel.tsx), on the same page as the hint. */
export const CREATOR_LINK_ANCHOR = "creator-link";

/**
 * Only the owner sees People. A Guild admin editing as the member acts with
 * owner rights (resolveViewerRole gives them "guild_admin"; the portal shell
 * gives them "owner").
 */
export function canInvitePeople(role: ViewerRole | null, isImpersonating: boolean): boolean {
  return isImpersonating || role === "owner" || role === "guild_admin";
}

// Inline links: the vertical padding widens the tap target to 44px+ without
// changing the line height. Ink on canvas-2 is well over 4.5:1.
const linkClass =
  "py-[13px] font-medium text-ink underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The camera roll nudge under the gallery upload box (portal Photos, wizard
 * Photos step, /admin/media). A hint only: members' best photos are often
 * already posted, and the camera roll original beats a compressed post
 * image. Deliberately no importing from a post link (docs/member-profiles.md,
 * "Where media comes from").
 *
 * `peopleHref` is where People lives on this surface; null in the setup
 * wizard, which has no People page until setup is done.
 */
export function CameraRollHint({ peopleHref }: { peopleHref: string | null }) {
  const editing = useMemberEditing();
  const showPeople = canInvitePeople(editing?.role ?? null, editing?.isImpersonating ?? false);
  const creatorLink = (
    <a href={`#${CREATOR_LINK_ANCHOR}`} className={linkClass}>
      creator upload link
    </a>
  );
  return (
    <InfoBox>
      <p>
        Posted it on Instagram or Facebook? The original photo is probably still in your phone's
        camera roll. Upload that one for the sharpest result.
      </p>
      <p className="mt-1.5">
        {showPeople ? (
          <>
            Someone else takes your photos? Invite them as a{" "}
            {peopleHref ? (
              <a href={peopleHref} className={linkClass}>
                Photos &amp; events editor
              </a>
            ) : (
              "Photos & events editor (from People, once setup is done)"
            )}
            , or send them a {creatorLink}.
          </>
        ) : (
          <>Someone else takes your photos? Send them a {creatorLink}.</>
        )}
      </p>
    </InfoBox>
  );
}
