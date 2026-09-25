import { Link, useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";

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
 */
export function ProfilePreviewBanner({
  isPreview,
  isImpersonating,
  viewerIsEditor,
  viewerIsGuildAdmin = false,
}: {
  isPreview: boolean;
  isImpersonating: boolean;
  viewerIsEditor: boolean;
  viewerIsGuildAdmin?: boolean;
}) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  const canEdit = isImpersonating || viewerIsEditor;

  let message: string;
  if (isImpersonating) {
    message = isPreview
      ? "You're previewing this member's profile while editing as them. Every change is logged against your own Guild admin account."
      : "You're viewing this member's live profile while editing as them.";
  } else if (viewerIsEditor) {
    message = isPreview
      ? "This is a preview of your profile. It isn't published yet — only you can see this page."
      : "This is your live profile, as visitors see it.";
  } else if (viewerIsGuildAdmin) {
    message = "This profile isn't published yet — only the member and Guild admins can see it.";
  } else {
    message = "This is a preview of your profile. It isn't published yet — only you can see this page.";
  }

  const buttonClass =
    "inline-flex min-h-11 items-center rounded-md border border-current/60 px-3 py-1 font-semibold hover:bg-white/10";

  return (
    <div
      role="alert"
      className={`flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm font-medium ${
        isPreview || isImpersonating ? "bg-danger text-white" : "bg-primary text-primary-foreground"
      }`}
    >
      <span>{message}</span>
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link to="/admin/basics" className={buttonClass}>
            Back to editing
          </Link>
        )}
        {!canEdit && viewerIsGuildAdmin && (
          <Link to="/guild/roster" className={buttonClass}>
            Back to roster
          </Link>
        )}
        {isImpersonating && (
          <button type="button" onClick={handleStop} className={buttonClass}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
