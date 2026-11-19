import { createFileRoute } from "@tanstack/react-router";
import { webhookPaymentId } from "@/lib/tap-card/zeffy";
import { recordPaymentById } from "@/lib/tap-card/zeffy.server";

/**
 * Zeffy webhook (payment.completed / updated / deleted). Only the payment id
 * is taken from the body; the payment is re-read from Zeffy's API with our
 * key, so a forged message can't create or refund anything. Calls the server
 * helpers directly, not a createServerFn (see api.unsubscribe.$token.ts).
 * Logs the event type and outcome only, never buyer data.
 */
export const Route = createFileRoute("/api/zeffy/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const rawType = (body as { type?: unknown })?.type;
        const type = typeof rawType === "string" && /^[a-z._]{1,40}$/.test(rawType) ? rawType : "unknown";
        // Until Zeffy's signature format is confirmed, note which headers it sends (names only).
        console.log(`zeffy webhook: ${type}; headers: ${[...request.headers.keys()].filter((k) => /sig|zeffy|webhook/i.test(k)).join(",") || "none"}`);
        const id = webhookPaymentId(body);
        if (!id) return new Response("ok", { status: 200 });
        try {
          const result = await recordPaymentById(id);
          console.log(`zeffy webhook: ${type} -> ${result.kind}`);
          return new Response("ok", { status: 200 });
        } catch (err) {
          console.error(`zeffy webhook: ${type} failed: ${err instanceof Error ? err.message : "error"}`);
          return new Response("Try again", { status: 500 });
        }
      },
    },
  },
});
