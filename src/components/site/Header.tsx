import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.svg";

const nav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/members", label: "Members" },
  { to: "/events", label: "Events" },
  { to: "/news", label: "News" },
  { to: "/contact", label: "Contact" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-lg tracking-wider">
          <img src={logo} alt="Inland Southern California Brewers Guild" className="h-14 w-14 rounded-sm object-contain" />
          <span>Inland Southern California Brewers Guild</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-foreground/80 transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
          <div className="ml-3 flex items-center gap-2 border-l border-border/60 pl-3 text-foreground/70">
            <a href="https://www.instagram.com/iebrewers/" target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-primary"><Instagram className="h-4 w-4" /></a>
            <a href="https://www.facebook.com/iebrewersguild/" target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-primary"><Facebook className="h-4 w-4" /></a>
          </div>
        </nav>

        <button
          aria-label="Toggle menu"
          className="md:hidden rounded-md p-2 text-foreground/80 hover:text-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium uppercase tracking-wide text-foreground/80 hover:text-primary"
                activeProps={{ className: "text-primary" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
