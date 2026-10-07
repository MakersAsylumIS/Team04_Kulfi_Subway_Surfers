# Jam — commute story web app ("Subway Surfers", Play it Forward residency)

> Project instructions for coding agents. Read this before changing anything.

## What this is

**Jam** is a location-triggered story web app for Mumbai commuters, built for the Play it Forward
residency (Kulfi Collective × Makers Asylum). As someone travels a train corridor, the
app notices places they're passing and plays a 40-second story about each one — what was
here before the road, what happened here, what everyone walks past daily.

There is also a companion hardware object ("the pet") — an ESP32-A1S Audio Kit with a
round display and a headphone jack — that pairs over Web Bluetooth. **The pet is an
accessory, not the product.** Most users will never have one, and on iOS nobody can.
The web app must be complete and good on its own.

Framing line, for tone: *we cross paths with thousands of people and hundreds of places
every day, and know almost nothing about any of them.*

## Companion hardware

Firmware and board findings live in **[HARDWARE.md](./HARDWARE.md)** — read it before
touching anything ESP32, Bluetooth-protocol, or audio-format related. It records what was
verified on our actual board versus what came from docs, which matters because this board
has several revisions that look identical and most online advice is about a different one.

## Architecture and native-app porting

**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** holds the module map, every contract
(Story, Fix/PositionSource, trigger rules, journey states), the scaling plan, and a
step-by-step guide for rebuilding this as a native app. **[docs/FEATURES.md](./docs/FEATURES.md)** is the feature list with status and open decisions. Keep it current when a contract,
module or decision changes.

## Stack

- **Vite + React + TypeScript**
- `vite-plugin-pwa` — service worker, offline caching, installable
- No backend. No SSR. No Next.js.
- Plain `<audio>` / `HTMLAudioElement` for playback
- `navigator.geolocation.watchPosition` for position
- `navigator.wakeLock` to keep the screen alive
- `navigator.bluetooth` (Web Bluetooth) for the pet
- Deploy static to Netlify / Vercel / GitHub Pages — any HTTPS static host

Do not add state management libraries, component kits, or a router without asking. This
is a small app and should stay small. `useState` and a couple of contexts are enough.

## Hard rules

1. **No backend.** `stories.json` and all audio files are bundled in `public/` or
   imported as assets. No fetch from a server, no database, no auth. Remote content is a
   later problem and the showcase does not care.
2. **HTTPS or localhost only.** Geolocation and Web Bluetooth require a secure context.
3. **Simulation mode is a first-class feature, not a test fixture.** It must be built
   early and kept working — it is how we develop indoors, and how the project is
   demonstrated in a room where no train exists.
4. **The trigger logic must not know where coordinates came from.** Real GPS and
   simulation feed the same interface. Swapping between them changes one line.
5. Mobile-first. This is used one-handed, on a moving train, by someone who is standing.

## The three web platform constraints that shape everything

### 1. Audio will not play without a user gesture

Browsers block programmatic audio until the user has interacted. **The "Start journey"
button is the unlock** — on that tap, play a short/silent buffer to prime the audio
element. After that, programmatic playback works for the rest of the session. Build this
in from the first commit; it is not a bug to fix later, it is the architecture.

### 2. The app only works while it is open and awake

There is no background geolocation on the web. `watchPosition` stops when the page is
backgrounded or the screen locks. There is no web geofencing API — the spec was written
and abandoned. Therefore:

- The app is a **travel mode you switch on**, like a music player. Say so in the UI; do
  not pretend otherwise.
- **Request `navigator.wakeLock` when a journey starts** and release it when it ends.
  Without this the screen sleeps, position updates stop, and the app silently does
  nothing for the rest of the trip. Re-acquire the lock on `visibilitychange`, because
  the lock is dropped when the tab is hidden.
- Keep the UI useful while the screen is on — this is a thing someone glances at.

### 3. Web Bluetooth does not exist on iOS

Not Safari, not Chrome for iOS, not any iOS browser — they are all WebKit underneath.
The pet pairs only from **Chrome on Android, or Chrome on desktop**. Feature-detect
`navigator.bluetooth` and hide the pairing UI entirely where it is absent. Never let a
user hit a dead end.

## Story triggering

- Each story has `lat`, `lng` and `radius_m`. On each position update, compute haversine
  distance to every unfired story and trigger the nearest one inside its radius.
- **Fire once per journey.** Keep a `Set` of fired ids, cleared when a journey starts.
- Positions arrive noisy. Require two consecutive fixes inside the radius before firing,
  or a single fix with `accuracy` better than the radius — otherwise a bad fix on a
  moving train triggers a story a kilometre early.
- Use `enableHighAccuracy: true` on the watch. Battery cost is acceptable because the
  journey is bounded.

## Data contract — stories.json

```json
{
  "id": "dadar-mill-01",
  "place": "Dadar",
  "title": "The mills that were here first",
  "lat": 19.0186,
  "lng": 72.8440,
  "radius_m": 350,
  "segment": "central-01",
  "text": "full body text",
  "audio": "dadar-mill-01.mp3",
  "image": "dadar-mill-01.jpg",
  "icon_id": 7,
  "duration_s": 41,
  "source": "https://...",
  "approved": true
}
```

`source` is required on anything factual. `icon_id` indexes a small image set preloaded
on the pet — never send images over Bluetooth. Use **MP3** for the web app's audio (much
smaller than WAV, universally supported); the pet plays WAV from its own SD card.

## Data contract — Web Bluetooth (browser is central, pet is peripheral)

| Characteristic | Direction | Size | Payload |
|---|---|---|---|
| `play` | write | 3–34 B | start offset + `story_id` as text — "play this file off your own SD" |
| `transport` | write | 2 B | play / pause / stop / volume, and output (jack or speaker) |
| `now_showing` | write | ~80 B | place, title, `icon_id` — what the round display draws |
| `playback` | notify | 3 B | state + position, to keep the app's UI in sync |
| `haptic` | write | 1 B | buzz pattern index |
| `input` | notify | 2 B | pat / double-pat / shake / hold-start / hold-end |
| `peer_seen` | notify | 8 B | story id picked up from another pet |

Exact UUIDs and byte layouts: **[docs/PET-PROTOCOL.md](./docs/PET-PROTOCOL.md)** (code: `src/pet/protocol.ts`).

**Audio never crosses the Bluetooth link** — the pet has the files on its own SD card, we
send an id. **Never send coordinates to the pet** — it makes no decision based on
position. Send the conclusion, not the input.

Web Bluetooth requires a user gesture to call `requestDevice()`, same as audio. Pairing
is an explicit button, never automatic on load.

## Design and tone

Quiet and specific, not playful-tech. The subject is a city people have stopped
noticing. Avoid gamification, streaks, points, badges, social feeds. There are
deliberately **no profiles, no follows, and no comments** — submissions are anonymous.
This is what keeps it from becoming a social platform.

Mobile-first, large touch targets, readable in sunlight on a moving train, works
one-handed.

## Working style

- Small steps. Each one ends with something that runs in a browser.
- Ask before adding a dependency or restructuring directories.
- Never spend a step on something that only works once something else is finished.
- When unsure whether something is in scope, ask — this project has a hard deadline and
  scope creep is the main risk.
