import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Twitter } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";

export function Footer() {
  const [email, setEmail] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    toast.success("Subscribed!", { description: `We'll keep ${email} in the loop.` });
    setEmail("");
  };

  return (
    <footer className="mt-24 border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-wider">
            <Beer className="h-6 w-6 text-primary" />
            IE Brewers Guild
          </Link>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Promoting and protecting independent craft breweries through advocacy, education,
            and community events.
          </p>
          <div className="mt-5 flex gap-3 text-foreground/70">
            <a href="#" aria-label="Instagram" className="hover:text-primary"><Instagram className="h-5 w-5" /></a>
            <a href="#" aria-label="Facebook" className="hover:text-primary"><Facebook className="h-5 w-5" /></a>
            <a href="#" aria-label="Twitter" className="hover:text-primary"><Twitter className="h-5 w-5" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-sm tracking-widest text-foreground">Explore</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/about" className="hover:text-primary">About</Link></li>
            <li><Link to="/members" className="hover:text-primary">Members</Link></li>
            <li><Link to="/events" className="hover:text-primary">Events</Link></li>
            <li><Link to="/news" className="hover:text-primary">News</Link></li>
            <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm tracking-widest text-foreground">Newsletter</h4>
          <p className="mt-3 text-sm text-muted-foreground">Beer news, events, and member spotlights.</p>
          <form onSubmit={onSubmit} className="mt-3 flex gap-2">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-background"
            />
            <Button type="submit">Join</Button>
          </form>
        </div>
      </div>
      <div className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} IE Brewers Guild. All rights reserved.
      </div>
    </footer>
  );
}
