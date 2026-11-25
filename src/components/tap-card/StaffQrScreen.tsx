import type { StaffQrPage } from "@/lib/tap-card/plate.server";
import { STAFF_QR_TURNED_OFF } from "@/lib/tap-card/staff-qr";
import { CanvasHeading, cardLinkClass, leadClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { CodeSignIn } from "@/components/tap-card/TrailJoined";
import { freeCardUrl } from "@/lib/tap-card/free-card";
import { joinPageUrl } from "@/lib/tap-card/trail-join";

/**
 * /s/<token> when the scan couldn't go straight to the check-in. A noted scan
 * never renders here: the route sends it to /card.
 */
export function StaffQrScreen({ view }: { view: Exclude<StaffQrPage, { view: "noted" }> }) {
  if (view.view === "unknown") {
    return (
      <>
        <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
        <p className={leadClass}>This code isn&rsquo;t working any more. Ask a staff member for the current one.</p>
      </>
    );
  }
  if (view.view === "closed" || view.view === "turned-off") {
    return (
      <>
        <Eyebrow>{view.memberName}</Eyebrow>
        <CanvasHeading size="md">
          {view.view === "closed" ? "This taproom isn’t taking Scan Pass check-ins right now." : STAFF_QR_TURNED_OFF}
        </CanvasHeading>
      </>
    );
  }
  return (
    <>
      <Eyebrow>{view.memberName}</Eyebrow>
      <CanvasHeading size="md">Sign in to check in</CanvasHeading>
      {/* next is /card: the staff code must never go in an email. */}
      <CodeSignIn
        initialEmail=""
        next="/card"
        intro="Enter the email you used for your Scan Pass. We'll email you a sign-in code. You'll only need to do this once on this phone."
        onSignedIn={() => window.location.reload()}
      />
      <p className={leadClass}>New here? Get a pass, then scan the staff QR code again.</p>
      <a href={freeCardUrl(view.plateCode)} className={`${cardLinkClass} w-fit text-[15px]`}>
        Get your free Scan Pass
      </a>
      {view.canJoinTrail && (
        <a href={joinPageUrl(view.plateCode)} className={`${cardLinkClass} w-fit text-[15px]`}>
          Join the Beer Trail
        </a>
      )}
    </>
  );
}
