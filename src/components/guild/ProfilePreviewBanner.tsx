import { Link, useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";
import { StatusBand, bandButtonClass } from "@/components/shell/AppChrome";

/**
 * The same non-dismissable treatment as AdminShell's impersonation banner
 * (spec: "a band sits on every admin screen and every preview for the
 * duration"), rendered on the public /members/$slug page whenever the
 * viewer can edit this profile or is looking at an unpublished one:
 *  - a Guild admin impersonating this exact member (draft or live),
 *  - the member's own editor (draft or live),
 *  - a Guild admin who isn't impersonating but can read the draft anyway
 *    (RLS), in which case the member-facing "only you can see this page"
 *    would be wrong.
 * Anyone who can edit gets "Back to editing" to /admin, so leaving the
 * editor to look at the profile never strands them (or ends an
 * impersonation session) -- Stop is a separate, explicit choice.
 *
 * Phase 2: this page always shows what's LIVE (the published version, or
 * for a never-published member the rows as they stand). Unpublished draft
 * changes are only visible at /admin/preview, so editors also get a
 * "Preview changes" link there.
 */
export function ProfilePreviewBanner({
  isPreview,
  isImpersonating,
  viewerIsEditor,
  viewerIsGuildAdmin = false,
  memberName = null,
}: {
  isPreview: boolean;
  isImpersonating: boolean;
  viewerIsEditor: boolean;
  viewerIsGuildAdmin?: boolean;
  memberName?: string | null;
}) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  const canEdit = isImpersonating || viewerIsEditor;

  let message: string;
  if (isImpersonating) {
    // Artboard GuildMembers's band wording, plus which version is showing.
    const who = memberName ?? "this member";
    message = isPreview
      ? `You are editing as ${who}. This page isn't published yet, and it doesn't show their unpublished changes.`
      : `You are editing as ${who}. This is their live page, without their unpublished changes.`;
  } else if (viewerIsEditor) {
    message = isPreview
      ? "Your profile isn't published yet — only you can see this page. Your latest changes show in Preview."
      : "This is your live profile, as visitors see it. Changes you haven't published show in Preview.";
  } else if (viewerIsGuildAdmin) {
    message = "This profile isn't published yet — only the member and Guild admins can see it.";
  } else {
    message = "This is a preview of your profile. It isn't published yet — only you can see this page.";
  }

  // Impersonation and unpublished drafts get the accent band (artboard
  // GuildMembers); an editor looking at their own live page -- nothing to
  // warn about -- gets the calmer dark ink band. White text on both.
  const tone = isImpersonating || isPreview ? "accent" : "ink";

  return (
    <StatusBand
      tone={tone}
      message={message}
      actions={
        <>
          {canEdit && (
            <Link to="/admin/basics" className={bandButtonClass}>
              Back to editing
            </Link>
          )}
          {canEdit && (
            <a href="/admin/preview" className={bandButtonClass}>
              Preview changes
            </a>
          )}
          {!canEdit && viewerIsGuildAdmin && (
            <Link to="/guild/roster" className={bandButtonClass}>
              Back to roster
            </Link>
          )}
          {isImpersonating && (
            <button type="button" onClick={handleStop} className={bandButtonClass}>
              Stop
            </button>
          )}
        </>
      }
    />
  );
}
