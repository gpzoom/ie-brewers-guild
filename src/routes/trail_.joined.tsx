import { createFileRoute } from "@tanstack/react-router";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { TrailJoined } from "@/components/tap-card/TrailJoined";

/** /trail/joined: Zeffy's thank-you redirect after buying a Beer Trail Pass (spec 2026-11-19). */
export const Route = createFileRoute("/trail_/joined")({
  head: () => ({ meta: [{ title: "Welcome to the Beer Trail — Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <TapCardShell>
      <TrailJoined />
    </TapCardShell>
  ),
});
