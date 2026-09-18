import { Mail, Instagram, Facebook } from "lucide-react";
import logo from "@/assets/logo.jpg";

export function UnderConstruction() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <img src={logo} alt="IE Brewers Guild" className="h-20 w-20 rounded-sm object-contain" />
      <h1 className="mt-6 font-display text-3xl tracking-wider text-foreground md:text-4xl">
        IE Brewers Guild
      </h1>
      <p className="mt-4 max-w-md text-sm uppercase tracking-widest text-primary">
        We're brewing something new
      </p>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Our site is currently under construction. Check back soon — in the meantime, feel free to
        reach out.
      </p>

      <a
        href="mailto:hello@craftbrewersguild.org"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Mail className="h-4 w-4" /> hello@craftbrewersguild.org
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
