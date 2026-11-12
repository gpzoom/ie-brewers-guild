/**
 * A file Resend fetches itself: `path` is a short-lived signed Storage URL,
 * so the Worker never holds the file's bytes (Resend's remote attachment).
 */
export type OutgoingAttachment = { filename: string; path: string };

export type BroadcastRecipient = {
  email: string;
  html: string;
  text: string;
  unsubscribeUrl: string | null;
  oneClickUrl: string | null;
};

const RESEND_URL = "https://api.resend.com/emails";
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function sendBroadcastEmails(p: {
  apiKey: string;
  from: string;
  replyTo: string;
  subject: string;
  recipients: BroadcastRecipient[];
  attachments: OutgoingAttachment[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
}): Promise<{ sent: string[]; failed: string[] }> {
  const fetchImpl = p.fetchImpl ?? globalThis.fetch;
  const sleep = p.sleep ?? defaultSleep;
  const gapMs = p.gapMs ?? 550;
  const sent: string[] = [];
  const failed: string[] = [];

  const post = async (r: BroadcastRecipient): Promise<{ ok: boolean; status: number; text: string }> => {
    const body: Record<string, unknown> = {
      from: p.from,
      to: [r.email],
      subject: p.subject,
      html: r.html,
      text: r.text,
      reply_to: p.replyTo,
    };
    if (r.oneClickUrl) {
      body.headers = { "List-Unsubscribe": `<${r.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    }
    if (p.attachments.length > 0) body.attachments = p.attachments;
    const res = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Always read the body so the Worker doesn't hold an unread response.
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  };

  for (let i = 0; i < p.recipients.length; i++) {
    const r = p.recipients[i];
    if (i > 0) await sleep(gapMs);
    try {
      let res = await post(r);
      if (res.status === 429) {
        await sleep(1000);
        res = await post(r);
      }
      if (res.ok) {
        sent.push(r.email);
      } else {
        console.error(`Broadcast: Resend refused ${r.email} (${res.status}): ${res.text.slice(0, 200)}`);
        failed.push(r.email);
      }
    } catch (err) {
      console.error(`Broadcast: couldn't send to ${r.email}`, err instanceof Error ? err.message : err);
      failed.push(r.email);
    }
  }
  return { sent, failed };
}
