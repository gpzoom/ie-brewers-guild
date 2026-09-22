import { useState } from "react";
import { updateMemberBasics } from "@/lib/members/member-basics.server";
import { isFieldVisibleForMemberType, LOCATION_FIELD_LABEL } from "@/lib/members/type-fields";
import { listIanaTimezones } from "@/lib/timezone/timezones";
import type { MemberRow, MemberType } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEZONES = listIanaTimezones();

/**
 * Every field here autosaves via its own small patch (onBlur for text
 * fields, onValueChange for the radio/select), never a whole-form submit --
 * that's what keeps a member-type switch from ever clobbering a hidden
 * field's stored value (this plan's Decision 6 and Global Constraint 2).
 */
export function BasicsForm({ member }: { member: MemberRow }) {
  const [local, setLocal] = useState(member);

  function save(patch: Parameters<typeof updateMemberBasics>[0]["data"]["patch"]) {
    setLocal((prev) => ({ ...prev, ...patch }));
    void updateMemberBasics({ data: { memberId: member.id, patch } });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Label htmlFor="business_name">Business name</Label>
        <Input
          id="business_name"
          defaultValue={local.business_name}
          className="mt-1 h-11"
          onBlur={(e) => save({ business_name: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Textarea
          id="tagline"
          defaultValue={local.tagline ?? ""}
          maxLength={70}
          className="mt-1"
          onBlur={(e) => save({ tagline: e.target.value || null })}
        />
        <p className="mt-1 text-xs text-muted-foreground">Up to 70 characters — the one place you speak in your own words.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Member type</legend>
        <RadioGroup
          defaultValue={local.member_type}
          className="mt-2 flex flex-col gap-2"
          onValueChange={(value) => save({ member_type: value as MemberType })}
        >
          {(["producer", "mobile", "allied"] as MemberType[]).map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2 rounded-md border border-border p-3">
              <RadioGroupItem value={type} id={`member_type_${type}`} />
              <span className="capitalize">{type}</span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" defaultValue={local.city} className="mt-1 h-11" onBlur={(e) => save({ city: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" defaultValue={local.state} className="mt-1 h-11" onBlur={(e) => save({ state: e.target.value })} />
        </div>
      </div>

      {isFieldVisibleForMemberType(local.member_type, "street_address") && (
        <div>
          <Label htmlFor="street_address">{LOCATION_FIELD_LABEL[local.member_type]}</Label>
          <Input
            id="street_address"
            defaultValue={local.street_address ?? ""}
            className="mt-1 h-11"
            onBlur={(e) => save({ street_address: e.target.value || null })}
          />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "service_area") && (
        <div>
          <Label htmlFor="service_area">Service area</Label>
          <Input
            id="service_area"
            defaultValue={local.service_area ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. Inland Empire and Coachella Valley"
            onBlur={(e) => save({ service_area: e.target.value || null })}
          />
        </div>
      )}

      {isFieldVisibleForMemberType(local.member_type, "lead_time") && (
        <div>
          <Label htmlFor="lead_time">Typical lead time</Label>
          <Input
            id="lead_time"
            defaultValue={local.lead_time ?? ""}
            className="mt-1 h-11"
            placeholder="e.g. 2–3 business days"
            onBlur={(e) => save({ lead_time: e.target.value || null })}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="member_since_year">Member since</Label>
          <Input
            id="member_since_year"
            type="number"
            defaultValue={local.member_since_year ?? ""}
            className="mt-1 h-11"
            onBlur={(e) => save({ member_since_year: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Select defaultValue={local.timezone} onValueChange={(value) => save({ timezone: value })}>
            <SelectTrigger id="timezone" className="mt-1 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
