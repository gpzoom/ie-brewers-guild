import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NOTICE_MESSAGES: Record<string, string> = {
  "no-account": "We couldn't find a member or Guild admin account for that sign-in link. Contact the Guild if you think this is a mistake.",
  "invalid-link": "That sign-in link is invalid or has expired. Request a new one below.",
  "missing-code": "That sign-in link is missing its code. Request a new one below.",
};

type SignInSearch = {
  notice?: string;
};

function validateSignInSearch(search: Record<string, unknown>): SignInSearch {
  const result: SignInSearch = {};

  if (typeof search.notice === "string") {
    result.notice = search.notice;
  }

  return result;
}

export const Route = createFileRoute("/signin")({
  validateSearch: validateSignInSearch,
  head: () => ({ meta: [{ title: "Member sign in — IE Brewers Guild" }] }),
  component: SignInPage,
});

function SignInPage() {
  const { notice } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Couldn't send the sign-in link.");
    }
  };

  return (
    <section className="mx-auto max-w-md px-4 py-24">
      <h1 className="font-display text-3xl text-foreground">Member sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the email your Guild membership is registered under. We'll send you a one-click sign-in
        link — no password needed.
      </p>

      {notice && NOTICE_MESSAGES[notice] && (
        <p role="alert" className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-foreground">
          {NOTICE_MESSAGES[notice]}
        </p>
      )}

      {status === "sent" ? (
        <p role="status" className="mt-6 rounded-md border border-open/40 bg-open/10 p-3 text-sm text-foreground">
          Check your email for a sign-in link. It's good for a little while, then you'll need a fresh one.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="signin-email">Email address</Label>
            <Input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          {status === "error" && errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <Button type="submit" disabled={status === "sending"} className="h-11 w-full">
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      )}
    </section>
  );
}
