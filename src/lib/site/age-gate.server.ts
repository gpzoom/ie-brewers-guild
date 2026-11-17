import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { AGE_COOKIE, isCrawler } from "@/lib/site/age-gate";

/** Whether this visitor already confirmed their age, and whether it's a search engine. */
export const getAgeGateState = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ confirmed: boolean; crawler: boolean }> => ({
    confirmed: getCookie(AGE_COOKIE) === "1",
    crawler: isCrawler(getRequestHeader("User-Agent")),
  }),
);
