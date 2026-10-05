import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { confirmEmailLink } from "@/lib/auth/sign-in-verify.server";
import {
  BrandBar,
  CanvasCard,
  CanvasHeading,
  IconTile,
  MailIcon,
  leadClass,
  primaryButtonClass,
  cardLinkClass,
} from "@/components/public-forms/PublicFormParts";

type ConfirmSearch = { token_hash?: string; type?: string; next?: string };

/**
 * Where the sign-in email's link lands (sign-in-link.ts): one button that
 * signs in. Opening the page does nothing on its own, so an email
 * security scanner that "clicks" the link can't use it up -- and it works
 * in any browser or on any device, unlike the old link.
 */
export const Route = createFileRoute("/auth/confirm")({
  validateSearch: (search: Record<string, unknown>): ConfirmSearch => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Finish signing in — Inland Southern California Brewers Guild" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const search = Route.useSearch();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onConfirm = async () => {
    setStatus("working");
    setMessage(null);
    try {
      const result = await confirmEmailLink({
        data: { tokenHash: search.token_hash ?? "", type: search.type ?? "email", next: search.next },
      });
      if (result.ok) {
        window.location.assign(result.href);
        return;
      }
      setStatus("error");
      setMessage(result.message);
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Try again, or request a new sign-in email.");
    }
  };

  return (
    <div className="min-h-screen bg-bg pb-10 font-sans">
      <div className="mx-auto w-full max-w-[480px]">
        <BrandBar linkHome />
        <div className="mx-2.5 sm:mx-0 sm:mt-6">
          <CanvasCard className="gap-[18px]">
            <IconTile>
              <MailIcon />
            </IconTile>
            <div className="flex flex-col gap-[9px]">
              <CanvasHeading size="md">Finish signing in</CanvasHeading>
              <p className={leadClass}>Press the button to sign in to the Member Portal.</p>
            </div>
            <button type="button" onClick={onConfirm} disabled={status === "working" || !search.token_hash} className={primaryButtonClass}>
              {status === "working" ? "Signing in…" : "Sign in"}
            </button>
            {(message || !search.token_hash) && (
              <p role="alert" className="text-[13px] leading-normal text-danger">
                {message ?? "This link is missing its sign-in details."}{" "}
                <a href="/signin" className={cardLinkClass}>
                  Get a new sign-in email
                </a>
              </p>
            )}
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
