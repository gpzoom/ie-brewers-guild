export type OutgoingAttachment = { filename: string; content: string };

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

  const post = async (r: BroadcastRecipient): Promise<Response> => {
    const body: Record<string, unknown> = {
      from: p.from,
      to: [r.email],
      subject: p.subject,
      html: r.html,
      text: r.text,
      reply_to: p.replyTo,
    };
    if (p.attachments.length > 0) body.attachments = p.attachments;
    if (r.oneClickUrl) {
      body.headers = { "List-Unsubscribe": `<${r.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    }
    return fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      (res.ok ? sent : failed).push(r.email);
    } catch {
      failed.push(r.email);
    }
  }
  return { sent, failed };
}
