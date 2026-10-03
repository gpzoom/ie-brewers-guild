import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Twitter } from "lucide-react";
import logo from "@/assets/logo.svg";

// The Newsletter sign-up box was removed (owner, 1 October 2026): it showed
// "Subscribed!" but saved the address nowhere. Bring it back only with a
// real list behind it.
export function Footer() {
  return (
    // theme-site keeps the footer dark on the light "canvas" routes
    // (/signin, /send/...); the background is the same 40% card-over-
    // background tint as before, just mixed opaquely so a light page
    // body behind it can't show through.
    <footer className="theme-site mt-24 border-t border-border/60 bg-[color-mix(in_oklab,var(--card)_40%,var(--background))]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-3 md:px-6">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-wider">
            <img src={logo} alt="Inland Southern California Brewers Guild" className="h-10 w-10 rounded-sm object-contain" />
            ISC Brewers Guild
          </Link>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Promoting and protecting independent craft breweries through advocacy, education,
            and community events.
          </p>
          <div className="mt-5 flex gap-3 text-foreground/70">
            <a href="https://www.instagram.com/iebrewers/" target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-primary"><Instagram className="h-5 w-5" /></a>
            <a href="https://www.facebook.com/iebrewersguild/" target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-primary"><Facebook className="h-5 w-5" /></a>
            <a href="#" aria-label="Twitter" className="hover:text-primary"><Twitter className="h-5 w-5" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-sm tracking-widest text-foreground">Explore</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/about" className="hover:text-primary">About</Link></li>
            <li><Link to="/members" className="hover:text-primary">Members</Link></li>
            <li><Link to="/news" className="hover:text-primary">News</Link></li>
            <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-2 border-t border-border/60 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:px-6">
        <span>© {new Date().getFullYear()} ISC Brewers Guild. All rights reserved.</span>
        <div className="flex flex-col items-center sm:items-end">
          <Link to="/signin" search={{ next: "/portal" }} className="min-h-11 py-2 hover:text-primary">
            Member Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
