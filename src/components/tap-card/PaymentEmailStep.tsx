import { useState } from "react";
import { CanvasHeading, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";

/** /trail/join, last step before Zeffy: the pass goes to the email typed THERE, so show the one to use. */
export function PaymentEmailStep({
  email,
  url,
  emailLocked,
  onChangeEmail,
}: {
  email: string;
  url: string;
  emailLocked: boolean;
  onChangeEmail: () => void;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CanvasHeading size="md">Use this email on the payment page</CanvasHeading>
      <p className="select-all break-all rounded-xl border-2 border-brand bg-white px-4 py-4 text-center text-[19px] font-semibold text-ink">{email}</p>
      <button type="button" className={secondaryButtonClass} onClick={onCopy}>
        {copied === "yes" ? "Copied" : "Copy email"}
      </button>
      <p role="status" className={copied === "failed" ? leadClass : "sr-only"}>
        {copied === "yes" && "Email copied."}
        {copied === "failed" && "Copying didn't work. Press and hold the email above to copy it."}
      </p>
      <p className={leadClass}>
        Your Beer Trail Pass goes to the email you enter on the payment page. If that page fills in a different one, change it to this one.
      </p>
      <a href={url} className={primaryButtonClass}>
        Go to the payment page
      </a>
      {!emailLocked && (
        <button type="button" className="w-fit text-[14px] font-medium text-ink-muted underline underline-offset-2" onClick={onChangeEmail}>
          Change my email
        </button>
      )}
    </div>
  );
}
