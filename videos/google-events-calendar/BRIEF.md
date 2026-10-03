---
workflow: general-video
flow: automation
storyboard: yes
message: "Make your Google calendar public with all event details, put #guild on the events you want shown, paste its link once, and your events appear on your profile and on the Guild homepage."
destination: website
aspect: 1920x1080
language: en
audience: "ISC Brewers Guild member profile admins (brewery and business owners, not technical)"
length: 90-120s
angle: how-to walkthrough
narration: yes
voice: 75be7648b2c849f6bcd73130dd133f79
---

## Intent

A short how-to for Guild members: connect a Google calendar as the source of the
events on their member profile and in the homepage "Coming up at our members"
carousel. Calm, friendly, plain words, one step at a time. It will sit behind a
"Watch how" link next to the calendar box in the Member Portal and in the member
guide. First of a series (Apple calendar, food calendar, photos, publishing).

## Assets

- Staging screenshots of the ISC Brewers Guild site (https://ie-brewers-guild-staging.boblelle77.workers.dev), captured during the build: the Events page with the calendar box, the #guild tag, Refresh now, the synced events list, the public profile's Upcoming events, and the homepage carousel. Example business on screen: Bob's Brewery (a test Producer profile).

## Customizations

- Narration in the owner's own HeyGen voice clone, "My Clone v2 (Fish)" (starfish voice_id above), billed to the owner's HeyGen plan allowance (OAuth sign-in).
- Captions on, for viewers watching without sound.
- Google Calendar steps shown as simplified, clearly labeled step cards drawn in the Guild style, not copies of Google's screens. The "See only free/busy" to "See all event details" change gets its own highlighted card: it is the most common mistake (it hid a test event on 28 September 2026).
- Look: the Guild site's own style (dark warm background, amber accent #E8913A, Bricolage Grotesque display type, Chivo body type).

## Notes

- The narration never names a member: say "your brewery", "your profile", "your events". The on-screen example may show Bob's Brewery.
- Write for the ear: short complete sentences and few commas. A comma after an opening word ("Welcome, ...") made the clone pause and broke the flow; end the sentence instead of inserting a pause.
- US English spelling in captions and on-screen text.
- Accurate to the site as built: the tag can go in the event's title or description; the calendar's public "Secret address"/"Public address in iCal format" is the link to paste; Refresh now updates straight away, but Google may take a few hours to update its public link; events in the next 14 days appear in the homepage carousel.
