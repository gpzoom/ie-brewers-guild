import type { ReactNode } from "react";
import { LEGAL } from "@/lib/site/legal";

/** Shared look for /terms and /privacy: a title, the effective date, then numbered sections. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{LEGAL.name}</p>
      <h1 className="mt-3 font-display text-4xl tracking-wide md:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Effective {LEGAL.effectiveDate}</p>
      <div className="mt-8 space-y-4 text-foreground/85">{intro}</div>
      <div className="mt-10 space-y-10">{children}</div>
    </section>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-foreground/85">
      <h2 className="font-display text-2xl tracking-wide text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalEmail() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="text-primary underline underline-offset-2">
      {LEGAL.email}
    </a>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  );
}
