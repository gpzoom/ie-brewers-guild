import { Mail, Instagram, Facebook } from "lucide-react";
import logo from "@/assets/logo.svg";

/**
 * The page the public sees while we test with the Sample members published
 * (owner, 2026-11-14): staging and live share one database, so a published
 * Sample shows on the live site too. Same look as UnderConstruction.
 */
export function MaintenanceMode() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <img
        src={logo}
        alt="Inland Southern California Brewers Guild"
        className="h-20 w-20 rounded-sm object-contain"
      />
      <h1 className="mt-6 font-display text-3xl tracking-wider text-foreground md:text-4xl">
        Inland Southern California Brewers Guild
      </h1>
      <p className="mt-4 max-w-md text-sm uppercase tracking-widest text-primary">
        Down for maintenance
      </p>
      <p className="mt-3 max-w-md text-pretty text-sm text-muted-foreground">
        We're making a few improvements to the site and will be back shortly. Thanks for your
        patience. Until then, feel free to reach out.
      </p>

      <a
        href="mailto:iscbrewersguild@gmail.com"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Mail className="h-4 w-4" /> iscbrewersguild@gmail.com
      </a>

      <div className="mt-8 flex items-center gap-4 text-foreground/70">
        <a
          href="https://www.instagram.com/iebrewers/"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className="hover:text-primary"
        >
          <Instagram className="h-5 w-5" />
        </a>
        <a
          href="https://www.facebook.com/iebrewersguild/"
          target="_blank"
          rel="noreferrer"
          aria-label="Facebook"
          className="hover:text-primary"
        >
          <Facebook className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
