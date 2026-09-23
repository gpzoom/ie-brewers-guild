import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { MemberType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Create a new member row" (task brief, roster actions). The created row
 * starts as status = 'draft' (create-member.server.ts, this plan's
 * Decision 8) -- the member gets invited next (Task 16) and publishes
 * their own profile from there.
 */
export function CreateMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [memberType, setMemberType] = useState<MemberType>("producer");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await createMemberRecord({
        data: {
          businessName,
          city,
          memberType,
          contactEmail: contactEmail || null,
        },
      });
      setOpen(false);
      setBusinessName("");
      setCity("");
      setContactEmail("");
      await router.invalidate();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create the member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">Create member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new member</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-member-business-name">Business name</Label>
            <Input
              id="new-member-business-name"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="new-member-city">City</Label>
            <Input
              id="new-member-city"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="new-member-type">Member type</Label>
            <Select value={memberType} onValueChange={(value) => setMemberType(value as MemberType)}>
              <SelectTrigger id="new-member-type" className="mt-1 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="allied">Allied Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="new-member-contact-email">Contact email (optional)</Label>
            <Input
              id="new-member-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="h-11">
              {submitting ? "Creating…" : "Create member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
