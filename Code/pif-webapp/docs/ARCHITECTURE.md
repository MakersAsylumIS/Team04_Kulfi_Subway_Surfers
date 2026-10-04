# Architecture, contracts and porting guide

> For people and coding agents. Read [AGENTS.md](../AGENTS.md) first for the rules and tone,
> and [HARDWARE.md](../HARDWARE.md) before touching anything pet-related. This file says
> **how the app is built, what every piece promises, and how to rebuild it as a native
> app** without re-deciding anything.

Last updated: 2026-10-03, after build step 6 (pet, app side).

---

## 1. What the product does, in one paragraph

When you are near a place that has a story, you hear its story. That's the whole product.
**It is place-based, not transport-based.** It doesn't matter whether you got there by
train, bus or on foot, and no logic knows about lines, stations or vehicles. A journey is a
mode you switch on, like a music player. While it is on, the app watches your position,
fires each nearby story once, and shows where you are. The pet (ESP32 hardware) is an
optional accessory that plays the same story from its own SD card when the app tells it to.

The long-term aim is a **global network of places**. Every decision below should survive
going from 3 stories in Mumbai to millions worldwide. Section 7 covers what changes at scale.

---

## 2. Module map

Everything platform-specific sits at the edges. The core (trigger rules, data contracts,
journey state machine) is plain TypeScript with no browser or React dependency, so a
React Native app can import it unchanged.

```
src/
  data/
    types.ts        Story type (the stories.json contract)           PORTABLE
    stories.json    bundled stories (placeholder content today)      PORTABLE (data)
    stories.ts      loader: today a static import                    REPLACE at scale (section 7)
  trigger/
    trigger.ts      haversine, fire rule, nearest story, placeAt()   PORTABLE, pure, no React
  position/
    types.ts        Fix + PositionSource interface                   PORTABLE
    simulate.ts     SimulatedSource: moves along a route on a timer   PORTABLE (setInterval only)
    routes.ts       demo paths (walk + two train lines)              PORTABLE (data)
    gps.ts          GpsSource: navigator.geolocation.watchPosition   WEB ONLY, rewrite per platform
  journey/
    useJourney.ts   journey state machine as a React hook            PORTABLE logic, React-bound
  audio/
    player.ts       one HTMLAudioElement, unlock(), text-only fallback WEB ONLY, rewrite per platform
  pet/
    protocol.ts     UUIDs, byte encoders/decoders (docs/PET-PROTOCOL.md) PORTABLE, pure
    link.ts         PetLink: bytes on characteristics                PORTABLE interface
    petOutput.ts    plays stories on the pet, phone fallback         PORTABLE
    fakePet.ts      in-browser pet speaking the same bytes           PORTABLE
    webBluetooth.ts real pairing via navigator.bluetooth             WEB ONLY, rewrite per platform
    usePet.ts       connection state for the screens                 React
    FakePetPanel.tsx the fake pet's dial and Pat buttons             WEB ONLY
  map/
    MapView.tsx     Leaflet + OpenStreetMap: you, your path, stories WEB ONLY, rewrite per platform
  App.tsx           Start and Journey screens (Tailwind, DOM)        WEB ONLY, rewrite per platform
```

Not built yet (see the build steps in section 9): `history/`.

---

## 3. Contracts

These are the interfaces every implementation (web, native, pet) must keep. Change them
only on purpose and update this file when you do.

### 3.1 Story (`src/data/types.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable, unique, used everywhere (trigger set, pet file name, history). Never reuse. |
| `place` | string | Human name shown as "You are at …". |
| `title` | string | Story title. |
| `lat`, `lng` | number | WGS84 degrees. |
| `radius_m` | number | Trigger circle in metres. Today 350 to 450. |
| `segment` | string, optional | Grouping only (e.g. a corridor). **Triggering never reads it.** |
| `text` | string | Full story text. Shown while playing. |
| `audio` | string | MP3 file name under `public/audio/` (web). The pet plays a WAV with the same id from its SD card. |
| `image` | string, optional | |
| `icon_id` | number | Index into the small icon set preloaded on the pet. Never send images over Bluetooth. |
| `duration_s` | number | Story length. Text-only playback uses it as the timer. |
| `source` | URL | Required for anything factual. |
| `approved` | boolean | Drafts are `false`. |

### 3.2 Fix and PositionSource (`src/position/types.ts`)

```ts
interface Fix { lat: number; lng: number; accuracy: number /* m */; timestamp: number /* ms */ }
interface PositionSource {
  start(onFix: (fix: Fix) => void, onError?: (error: Error) => void): void
  stop(): void
}
```

**Rule:** nothing downstream may know where a fix came from. Real GPS, simulation, a
recorded trace, or a native background service all feed `onFix`. Only one place chooses
the source: `start()` in `useJourney.ts`.

### 3.3 Trigger rules (`src/trigger/trigger.ts`)

On every fix:

1. For each story **not yet fired this journey**, compute haversine distance.
2. A story is *inside* if `distance <= radius_m`.
3. An inside story is *confirmed* if **either** the previous fix was also inside it, **or**
   this fix's `accuracy < radius_m`. This stops one bad fix on a moving train or between
   tall buildings from firing a story a kilometre early.
4. Fire the **nearest** confirmed story. Add it to the fired set. Others can fire on later fixes.
5. The fired set is cleared only when a new journey starts. Each story fires once per journey.

`placeAt(fix, stories, extraPlaces)` answers "where am I?" for the line at the top of the
screen. It returns the story place whose circle contains the fix ("You are at"), otherwise
the closest story place or extra named place within 1.5 km ("You are near"), otherwise
nothing ("between places"). It never names where you are *going*.

These functions are pure. They're the first thing to unit-test and the last thing to rewrite.

### 3.3b The map (`src/map/MapView.tsx`)

- "You are at / near …" from `placeAt` sits **on top of the map**. It shows where you
  are, never where you are going.
- **Stories reveal as you travel:** a story's circle appears once any fix this journey has
  been within **2 km** of it (`REVEAL_M` in `useJourney.ts`). Unheard stories are dashed
  grey, heard ones solid dark, the playing one amber. The revealed set resets per journey.
- **Your path** is drawn from fixes with accuracy of 100 m or better, skipping points closer
  than 25 m apart, so noisy fixes don't zigzag the line.
- The map follows you. Panning by hand stops following until you tap **Recenter**.
- Base map: OpenStreetMap tiles, needs a connection. Your position and the stories work
  without one. Tiles aren't cached offline yet (step 5).

### 3.4 Journey state machine (`src/journey/useJourney.ts`)

```
idle --Start journey--> listening --story fires--> playing --story ends / Skip--> listening
  ^                                                                                   |
  +-------------------------------- Stop journey ----------------------------------+
```

- **Queue of one:** if a story fires while another is playing, it waits. When the current
  story ends, the waiting one plays only if the last fix is still inside its radius.
  Otherwise it is dropped. It stays in the fired set, so it won't fire again this journey.
- Starting a journey resets the fired set, the heard list and all position state.
- **Audio:** `StoryPlayer` plays `public/audio/<story.audio>` on one `HTMLAudioElement`.
  `unlock()` runs inside the Start journey tap (plays 0.1 s of generated silence), which
  browsers require before any programmatic audio. If the file is missing or fails, the
  same player runs a silent `duration_s` timer instead, so the journey never stalls and
  the card shows "No audio file, text only". Pause and Resume work in both modes. Lock
  screen controls show the title and place through the Media Session API.

### 3.5 Pet over Bluetooth LE

The phone is the central and the pet is the peripheral. The table in AGENTS.md is the
contract (`play`, `transport`, `now_showing`, `playback`, `haptic`, `input`, `peer_seen`).
Two rules hold on every platform:

- **Audio never crosses the link.** Send a story id; the pet plays its own file.
- **Coordinates never cross the link.** The phone decides; the pet is told the conclusion.

Because of this, a native app reuses the exact same GATT table and firmware. Only the
client library changes.

**Exact bytes:** [PET-PROTOCOL.md](./PET-PROTOCOL.md). The story id goes over the link as
text, and the pet plays `/stories/<id>.wav`.

**How the app uses it:**
- `StoryOutput` is where a story's sound comes out. `StoryPlayer` is the phone,
  `PetOutput` is the pet. The journey asks for `output()`: the pet when one is connected,
  otherwise the phone. Nothing else in the journey changes.
- When a pet is connected the phone stays silent. It takes over only if the pet reports a
  missing file (from the start), a write fails (from the start), or the pet disconnects
  mid-story (from the pet's last reported position).
- On the pet, a pat pauses or resumes and a double-pat skips. The pet buzzes when a story starts.
- `PetOutput` ignores idle reports until the pet has confirmed the new story is playing,
  so a late "idle" from the previous story can't end the new one.
- Pairing is a button, never automatic. It's hidden where `navigator.bluetooth` is missing
  (iOS). The fake pet is offered in simulation mode only.

---

## 4. Simulation

Simulation is a first-class feature (AGENTS.md rule 3), not a test fixture.

- `routes.ts` holds paths as named points: a walk from Bandra station over the causeway to
  Mahim, the Western line Churchgate to Bandra, and the Central line CSMT to Sion.
  Coordinates are approximate (about 100 m), which is fine against 350 m+ radii.
- `SimulatedSource` moves along a route at a **pace in metres per second**: Walk 1.4,
  Bus 7, Train 11, Fast 60. Pace can change mid-journey.
- **Noisy GPS** adds 20 to 60 m jitter, and about 1 in 20 fixes jumps 600 to 1200 m away
  with an honest 800 m accuracy. This exercises rule 3.3.3.
- The route's named points also feed `placeAt` as extra places, so the top line can say
  "near S.V. Road" between stories during a demo.

To add a route, append to `routes.ts`. To test a city you have never visited, add a route
there plus a few stories. Nothing else changes.

---

## 5. Web platform constraints (why the web app looks the way it does)

| Constraint | Consequence in the web app |
|---|---|
| Audio needs a user gesture | The Start journey tap unlocks audio (step 3). |
| No background location on the web, no geofencing API | The journey only runs with the page open and the screen on. Wake lock in step 4. The UI says so. |
| Web Bluetooth doesn't exist on iOS | The pairing UI is hidden where `navigator.bluetooth` is missing. |
| Geolocation needs a secure context | Phones need HTTPS. `npm run dev:phone` serves self-signed HTTPS on the local network (`@vitejs/plugin-basic-ssl`, only in that mode). A Vercel deploy gives a proper HTTPS link. |

**All four go away or change in a native app.** This is the main reason to build one (section 6).

---

## 6. Porting to a native app

### 6.1 Recommended path: React Native with Expo

The core is TypeScript and React already, so React Native reuses the most:

| Piece | Reuse | Native replacement |
|---|---|---|
| `data/types.ts`, `stories.json` | as is | none |
| `trigger/trigger.ts` | as is | none |
| `position/types.ts`, `simulate.ts`, `routes.ts` | as is | none |
| `journey/useJourney.ts` | as is (hooks work in RN) | only the source import changes |
| `position/gps.ts` | rewrite | `expo-location` `watchPositionAsync` in the foreground, plus `startLocationUpdatesAsync` / `TaskManager` for background |
| `App.tsx` (DOM + Tailwind) | rewrite | RN views (NativeWind keeps the Tailwind class names) |
| Audio (step 3) | rewrite | `expo-audio`, with the audio session set to play in the background and duck other audio |
| Pet BLE (`pet/`) | keep protocol, link interface, `PetOutput` and the fake pet; rewrite `webBluetooth.ts` only | `react-native-ble-plx`. Same GATT table, same firmware. Works on iOS. |
| Map (`map/MapView.tsx`) | rewrite, keep the behaviour in 3.3b | `react-native-maps` (or MapLibre for offline tiles) |
| History (IndexedDB) | rewrite | SQLite (`expo-sqlite`) |

Fully native Swift or Kotlin also works. Port `trigger.ts` line for line (it is about 100
lines of arithmetic) and keep the same contracts. A shared test file of fixes and expected
fires (section 8) keeps the ports in agreement.

### 6.2 What a native app can do that the web can't, and how to use it

- **Background location.** The journey keeps working with the phone in a pocket and the
  screen off. Feed background updates into the same `PositionSource` → `evaluateFix` path.
- **OS geofencing,** so no journey switch is needed at all. Region monitoring wakes the app
  when you enter a circle. The OS limits how many regions you can watch at once: **20 on
  iOS, 100 per app on Android.** So register only the nearest N stories, and re-register
  when you move a few km (use iOS significant-location-change or a coarse background
  update). On a region-entry event, still run `evaluateFix` with a fresh fix before
  playing. The OS's entry events are coarse, and rule 3.3.3 still applies.
- **Notifications.** When the app is backgrounded and a story fires, post a notification
  ("You are at Mahim, The road a widow paid for") and play audio if the user has allowed
  it. Product decision still open: auto-play in the background, or tap to play.
- **Bluetooth on iOS.** The pet works for everyone, and can stay connected in the background
  with the `bluetooth-central` background mode.

### 6.3 Things to keep identical across web and native

- The `Story` contract and story ids, so content, the pet's SD card and history all line up.
- The trigger rules in 3.3, including fire-once-per-journey.
- The pet GATT table and the "ids, not audio or coordinates" rule.
- Tone: no profiles, follows, comments, streaks, points or badges (AGENTS.md).

### 6.4 Agent checklist for a native port

1. Scaffold Expo with TypeScript. Copy `src/data`, `src/trigger`, `src/position/{types,simulate,routes}.ts` and `src/journey` unchanged.
2. Write `position/gps.native.ts` implementing `PositionSource` with `expo-location`. Switch the import in `useJourney.ts`.
3. Run the section 8 fixture tests against the copied trigger code. They must pass unchanged.
4. Rebuild the Start and Journey screens. Keep the simulation controls (route, pace, Noisy GPS) and the "Simulated" badge.
5. Add audio with background playback. Then add background location. Then geofencing (6.2).
6. Port the pet client to `react-native-ble-plx` against the same GATT table.

---

## 7. Scaling to a global network

Today every story is bundled in the app (AGENTS.md hard rule 1). That is right for the
showcase and wrong past a few thousand places. The planned change still needs no server
logic:

- **Tile the stories.** Split them into files by map tile (e.g. geohash precision 5, about
  5 km cells): `stories/tiles/tdr1v.json`. Host them as static files on any CDN.
- **Load around the user.** On each fix, make sure the user's tile and its 8 neighbours are
  loaded. Cache them for offline use. Pre-download a region ("Download this area") the way
  step 5 plans for a line.
- **Only `data/stories.ts` changes.** The trigger takes "the stories currently loaded".
  Make the loader async (`storiesNear(lat, lng)`) and the rest of the app is untouched.
- **Ids must be globally unique** once many people write stories. Prefix them with a region
  or use random ids. Never reuse an id: the pet's SD card and listening history key on it.
- **Pet content at scale.** The pet can't hold every story. It plays from SD what it has. A
  future `list` characteristic or version byte lets the app check which ids the card has,
  and fall back to phone audio for the rest (open item in the build plan).
- **Base map at scale.** OpenStreetMap's own tile server is for light use only. With real
  traffic, switch to a tile provider (MapTiler, Stadia, Carto) or self-hosted vector tiles
  (Protomaps, a single file on a CDN that also works offline). Same OSM data, one URL change.
- **Overlapping stories.** In dense places, several circles will overlap. The rule (nearest
  confirmed wins, the rest fire later) already handles this. Revisit the queue-of-one if
  dense areas drop too many stories.

---

## 8. Testing

There is no test runner yet (adding one is a dependency decision). Until then:

- **Trigger rules:** Node 22.18+ or 23.6+ runs TypeScript files directly (`node file.ts`). The source uses `.ts` import
  extensions so this works. A fixture to keep:
  - one fix inside a 350 m radius with 800 m accuracy → nothing fires
  - a second such fix → fires
  - a third fix → nothing (already fired)
  - one fix inside with 20 m accuracy on a fresh journey → fires
  - Western route at 1 % steps → `lower-parel-mills-01`, then `mahim-causeway-01`
  - Central route → `csmt-terminus-01`, then `lower-parel-mills-01` (Currey Road is about 350 m from it)
- **In the browser:** pick a route, pick a pace, Start journey, and watch stories fire.
  Turn on Noisy GPS to check the two-fix rule.

---

## 9. Build steps and status

| # | Step | Status |
|---|---|---|
| 1 | Scaffold: Vite + React + TS + Tailwind + PWA, three placeholder stories | done |
| 2 | Simulation and trigger logic; stories fire as text | done |
| 2b | Place-based wording, pace instead of train speed, walking route, "You are at" line | done |
| 3 | Start journey unlocks audio; stories play (placeholder MP3s for now) | done |
| 3b | Map (Leaflet + OpenStreetMap) with "You are at" on top and stories revealed within 2 km | done |
| 4 | Real GPS; tested on a phone over `npm run dev:phone` | done: GPS works, and the screen stays on during a journey (`journey/wakeLock.ts`) |
| 5 | Offline caching and "Download this line/area" | deferred: not needed for now (Aarya) |
| 6 | Fake pet, then the real pet over Web Bluetooth | app side done; firmware step 1 (`firmware/pet_ble_test`, Bluetooth only) compiles, see firmware/README.md |
| 7 | Heard screen; history | |

## 10. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10-03 | Vite + React + TS PWA, not Next.js | Everything runs in the browser and there's no server, so Next's strengths go unused. |
| 2026-10-03 | Phone does all location logic; pet gets ids only | Works for every user, keeps firmware simple, keeps BLE payloads tiny. |
| 2026-10-03 | Place-based triggering, not transport-based | Aarya: "If I'm near Bandra, regardless of any transport, I must get to know about that place." |
| 2026-10-03 | Design for a global network; keep bundled stories for the showcase | Tiles (section 7) are the planned path and need no backend. |
| 2026-10-03 | Top of the journey screen shows where you *are*, not where you're going | Aarya's request for the map view. |
| 2026-10-03 | Pet `play` carries the story id as text, not a 6-byte number | WAV files on the card are named like the MP3s, so there's no numbering to keep in sync. Ids are capped at 32 bytes. |
| 2026-10-03 | Pet display is a 2.4" ST7789 TFT on SPI (18/23/5/19); its resistive touch is not used | Parts on hand. Input is the capacitive touch switch (GPIO 34) and a button (GPIO 39). See FEATURES.md section 7. |
| 2026-10-03 | Offline step deferred | Aarya: no real use for it right now. |
| 2026-10-03 | Leaflet + OpenStreetMap for the map, not Google Maps | Free with no API key, allows offline caching, roads and rail are well mapped in Mumbai. Google is better for shop names, which the stories don't need. |
