import { useEffect, useState } from "react";
import { homeScreenKind, type HomeScreenKind } from "@/lib/tap-card/card-app";
import { secondaryButtonClass } from "@/components/public-forms/PublicFormParts";

type InstallPrompt = Event & { prompt(): Promise<void> };

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Save to Home Screen: Android's real install prompt where the browser offers
 * one; on iPhone (where no website may do it from a button) the steps; hidden
 * once the card is already opened from the Home Screen.
 */
export function SaveToHomeScreen() {
  const [kind, setKind] = useState<HomeScreenKind>("hidden");
  const [installEvent, setInstallEvent] = useState<InstallPrompt | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const decide = (canPrompt: boolean) => setKind(homeScreenKind({ userAgent: navigator.userAgent, standalone: isStandalone(), canPrompt }));
    decide(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPrompt);
      decide(true);
    };
    const onInstalled = () => setKind("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (kind === "hidden") return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={async () => {
          if (kind === "prompt" && installEvent) {
            await installEvent.prompt().catch(() => undefined);
            setInstallEvent(null);
          } else setShowSteps((s) => !s);
        }}
      >
        ⊕ Save to Home Screen
      </button>
      {showSteps && kind === "iphone" && (
        <ol className="list-decimal space-y-1.5 rounded-xl border border-canvas-border bg-white py-3 pl-9 pr-4 text-[14px] text-ink">
          <li>
            Tap <strong>Share</strong> (the square with an arrow). In Chrome it&rsquo;s at the top right; then tap <strong>View More</strong>.
          </li>
          <li>
            Tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Leave <strong>Open as Web App</strong> on, and tap <strong>Add</strong>.
          </li>
        </ol>
      )}
      {showSteps && kind !== "iphone" && (
        <ol className="list-decimal space-y-1.5 rounded-xl border border-canvas-border bg-white py-3 pl-9 pr-4 text-[14px] text-ink">
          <li>
            Open your browser&rsquo;s menu (<strong>⋮</strong>, usually at the top right).
          </li>
          <li>
            Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>, then <strong>Install</strong> or <strong>Add</strong>.
          </li>
        </ol>
      )}
    </div>
  );
}
