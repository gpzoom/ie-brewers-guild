/** Styles and small pieces shared by the Settings cards. */

export const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
export const cardClass =
  "flex max-w-[640px] flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6";
export const outlineButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
export const darkButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:opacity-60";

export type Message = { kind: "ok" | "error"; text: string } | null;

export function StatusMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={message.kind === "error" ? "text-[13px] text-danger" : "text-[13px] text-ink-muted"}
    >
      {message.text}
    </p>
  );
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Couldn't save the setting — try again.";
}
