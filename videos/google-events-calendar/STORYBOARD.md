---
format: 1920x1080
duration: 126s
message: "Make your Google calendar public with all event details, put #guild on the events you want shown, paste its link once, and your events appear on your profile and on the Guild homepage."
arc: Promise → Three steps → Make an events calendar (new · public · all details · copy link) → Tag → Paste & refresh → Profile → Homepage → Keep it going
audience: ISC Brewers Guild member profile admins (not technical)
mode: collaborative
music: none (voice only, unless the owner asks for a quiet bed)
---

## Changes from v1

- Owner, 28 September 2026: "tell/show them that they need to add a new calendar that is dedicated to events and then proceed from there." New frame 3 (a calendar just for events), with the privacy reason: anyone with a public calendar's link sees everything on it, tagged or not. Step 1 becomes "Make an events calendar". Frames after it renumber (old 3–10 → 4–11); frame 4 and frame 7 narration adjusted to follow on. Length ~2:07.

## Locked

- Owner approved sheet v2 on 28 September 2026 ("looks good - go!"): all 11 layouts, their on-screen wording and narration as drawn in storyboard.html v2.

## Frame 1 — Your events on the Guild homepage

- type: hook
- scene: A calendar page from the homepage carousel tears away to reveal the headline "Your events. On the Guild homepage."
- duration: 8s
- transition_in: cut
- status: animated
- src: compositions/frames/01-promise.html
- blueprint: kinetic-type-beats (Adapt) + titlecard-reveal
- voiceover: "Your events can show up on the Guild homepage. And it happens on its own. Here's how to set it up with Google Calendar."

Open on the payoff the member cares about: their events in front of everyone who visits the Guild site. The tearing page is the carousel's own move.

## Frame 2 — Three steps

- type: benefit_highlight
- scene: Three numbered step cards assemble in a row: 1 Make an events calendar · 2 Tag your events · 3 Paste one link.
- duration: 8s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-three-steps.html
- blueprint: grid-card-assemble (Reproduce)
- voiceover: "It takes three steps. Make an events calendar. Tag your events. Then paste one link."

Lands the whole message by beat 2 (value before evidence); the rest of the video walks these three cards.

## Frame 3 — A calendar just for events

- type: feature_showcase
- scene: A simplified, labeled drawing of Google Calendar's sidebar: the + next to "Other calendars" → "Create new calendar" → the name "Bob's Brewery Events" typed in → "Create calendar". A small note: "Anyone with the link sees everything on a public calendar."
- duration: 18s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-new-calendar.html
- blueprint: cursor-ui-demo (Adapt: reconstructed, simplified UI; "simplified" label)
- voiceover: "Start with a new calendar just for your events. Anyone with its link can see everything on it. So keep it separate from your own calendar. In Google Calendar press the plus next to Other calendars. Choose Create new calendar. Name it and press Create calendar."

Why a separate calendar: the #guild tag decides what the Guild site shows, not what Google shares. A public everyday calendar would show staff meetings and private bookings to anyone with the link. Step 1 of 3 badge starts here.

## Frame 4 — Make the calendar public

- type: feature_showcase
- scene: A simplified, labeled drawing of Google Calendar's settings: the calendar's name → Settings and sharing → Access permissions for events → "Make available to public" ticked. A cursor walks the path.
- duration: 13s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-make-public.html
- blueprint: cursor-ui-demo (Adapt: reconstructed, simplified UI; "Google Calendar settings, simplified" label)
- voiceover: "Now point at the new calendar's name and open Settings and sharing. Under Access permissions for events tick Make available to public."

Step 1 of 3 badge stays in the corner through frames 3 to 6.

## Frame 5 — See all event details

- type: feature_showcase
- scene: Side by side: left, what visitors get with "See only free/busy" (an event that just says "Busy"); right, "See all event details" (the full event with its title, time and description). The right card wins with an amber check.
- duration: 13s
- transition_in: cut
- status: animated
- src: compositions/frames/05-all-details.html
- blueprint: comparison-split (Reproduce)
- voiceover: "Right next to it is a menu. Change See only free busy to See all event details. This one matters. Without it Google hides your event names and nothing comes through."

The single most common mistake, given its own frame.

## Frame 6 — Copy the iCal link

- type: feature_showcase
- scene: Simplified settings drawing scrolled to "Integrate calendar"; the "Public address in iCal format" field highlights and a Copy button presses.
- duration: 9s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-copy-link.html
- blueprint: cursor-ui-demo (Adapt)
- voiceover: "Now scroll down to Integrate calendar. Copy the Public address in iCal format."

## Frame 7 — Tag your events

- type: feature_showcase
- scene: A simplified event editor; "#guild" types into the description. A second, untagged event stays gray with a small "stays private" label.
- duration: 11s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-tag-events.html
- blueprint: typewriter-reveal (Adapt) + cursor-ui-demo
- voiceover: "Step two. Add your events to this calendar. Type #guild in each event's title or description. Only tagged events come through."

Step 2 of 3 badge.

## Frame 8 — Paste the link and refresh

- type: feature_showcase
- scene: The Member Portal's Events page, rebuilt from the real screen (artboard M, CalendarConnectionPanel): "Add calendar" → the link pastes into "ICS subscription URL" → "#guild" goes in "Sync tag" → the card reads "calendar.google.com · importing events tagged #guild" → the cursor presses "Refresh now" → "Last synced just now · the site checks it automatically".
- duration: 15s
- transition_in: crossfade
- status: animated
- src: compositions/frames/08-paste-refresh.html
- blueprint: cursor-ui-demo (Reproduce)
- voiceover: "Step three. Sign in to the Member Portal and open Events. Press Add calendar. Paste your link and type the same tag. Then press Refresh now."

Step 3 of 3 badge. On-screen example business: Bob's Brewery.

## Frame 9 — On your profile

- type: benefit_highlight
- scene: Real screenshot of the public profile's Upcoming events (Bob's Brewery), held in a floating browser window; the events list slides into focus.
- duration: 9s
- transition_in: crossfade
- status: animated
- src: compositions/frames/09-profile.html
- blueprint: device-surface-showcase (Adapt: static tour)
- voiceover: "Your events show up on your profile right away. With the time and the place and your description."

## Frame 10 — On the Guild homepage

- type: benefit_highlight
- scene: Real screenshot of the homepage "Coming up at our members" carousel; a calendar page with the brewery's logo and color tears off to the next member's page.
- duration: 11s
- transition_in: crossfade
- status: animated
- src: compositions/frames/10-homepage.html
- blueprint: device-surface-showcase (Adapt) + the carousel's own tear move
- voiceover: "Events in the next two weeks also appear on the Guild homepage. Each one gets its own calendar page with your logo and your color."

The payoff promised in frame 1, now shown for real.

## Frame 11 — Keep it going

- type: cta
- scene: Calm end card: "Add events to that calendar. The site keeps up." with a small note "Google can take a few hours to update" and "Need help? Press Help in the Member Portal."
- duration: 12s
- transition_in: crossfade
- status: animated
- src: compositions/frames/11-keep-going.html
- blueprint: titlecard-reveal (Reproduce)
- voiceover: "From now on just add events to that calendar. The site checks for changes on its own. Google can take a few hours to update so give it a little time. Need help? Press Help in the Member Portal."
