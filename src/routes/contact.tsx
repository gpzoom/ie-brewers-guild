import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Mail, MapPin, Phone } from "lucide-react";
import heroImg from "@/assets/hero-about.jpg";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — IE Brewers Guild" },
      { name: "description", content: "Get in touch with the IE Brewers Guild — membership, press, and general inquiries." },
      { property: "og:title", content: "Contact — IE Brewers Guild" },
      { property: "og:description", content: "Membership, press, and general inquiries." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Message sent!", { description: "We'll get back to you within a few business days." });
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <>
      <PageHero
        image={heroImg}
        eyebrow="Contact"
        title="Get in touch."
        subtitle="Membership, press, sponsorship, or just hello — we'd love to hear from you."
        minHeight="min-h-[45vh]"
      />

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-[1fr_2fr] md:px-6">
        <aside className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Email</div>
            <p className="mt-1 inline-flex items-center gap-2 text-foreground"><Mail className="h-4 w-4" /> hello@craftbrewersguild.org</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Phone</div>
            <p className="mt-1 inline-flex items-center gap-2 text-foreground"><Phone className="h-4 w-4" /> (555) 555-0142</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Mailing</div>
            <p className="mt-1 inline-flex items-start gap-2 text-foreground"><MapPin className="mt-0.5 h-4 w-4" /> 123 Brewery Row<br />Anytown, USA 90000</p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-background" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" rows={6} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="bg-background" />
          </div>
          <Button type="submit" size="lg">Send message</Button>
        </form>
      </section>
    </>
  );
}
