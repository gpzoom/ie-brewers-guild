import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  // Task 29: the two Cloudflare Cron Triggers declared in wrangler.jsonc's
  // triggers.crons -- a 15-minute ICS calendar refresh and a daily
  // hours-stale email-notice check. Both handlers are dynamically imported
  // (rather than imported at module top-level) so neither's code, nor its
  // transitive dependencies, is pulled into every single `fetch` request's
  // module graph -- this `scheduled` export is only ever invoked by the
  // platform on the matching cron schedule, never from an HTTP request.
  // ctx.waitUntil keeps the invocation alive until the async work finishes,
  // per Cloudflare Workers' own scheduled-handler contract.
  async scheduled(controller: { cron: string }, _env: unknown, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    if (controller.cron === "*/15 * * * *") {
      const { refreshAllIcsConnections } = await import("./lib/events/ics-refresh-cron.server");
      ctx.waitUntil(refreshAllIcsConnections());
    } else if (controller.cron === "0 13 * * *") {
      const { sendHoursStaleNotices } = await import("./lib/hours/hours-stale-cron.server");
      ctx.waitUntil(sendHoursStaleNotices());
    }
  },
};
