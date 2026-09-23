import { useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";

/**
 * The same non-dismissable treatment as AdminShell's impersonation banner
 * (spec: "a band sits on every admin screen and every preview for the
 * duration"), rendered on the public /members/$slug page when the viewer
 * is either the member's own editor (previewing their own unpublished
 * profile) or a Guild admin currently impersonating this exact member.
 */
export function ProfilePreviewBanner({ isImpersonatedPreview }: { isImpersonatedPreview: boolean }) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  return (
    <div
      role="alert"
      className="flex min-h-11 flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2 text-sm font-medium text-white"
    >
      <span>
        {isImpersonatedPreview
          ? "You're previewing this member's profile while editing as them. Every change is logged against your own Guild admin account."
          : "This is a preview of your profile. It isn't published yet — only you can see this page."}
      </span>
      {isImpersonatedPreview && (
        <button
          type="button"
          onClick={handleStop}
          className="min-h-11 rounded-md border border-white/60 px-3 py-1 font-semibold hover:bg-white/10"
        >
          Stop
        </button>
      )}
    </div>
  );
}
