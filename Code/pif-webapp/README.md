# Jam: web app and pet

**Jam** is location-triggered commute stories for Mumbai. As you travel, the app notices the places you
pass and plays a short story about each one: what was there before the road, what happened
there, what everyone walks past every day. A small companion object, **the pet** (an
ESP32-A1S Audio Kit with a colour screen and a speaker), can play the stories too, show where
you are, and react with a face.

> *We cross paths with thousands of people and hundreds of places every day, and know almost
> nothing about any of them.*

Built for the Play it Forward residency (Kulfi Collective × Makers Asylum), 2026.

## What's here

| Part | Where | What it is |
|---|---|---|
| Visitor app | `/` | Full-screen map: where you are, stories as pins, a sheet to start a journey and listen. Light and dark themes. |
| Test tool | `/debug` | Simulated rides, showcase setup ("Mark here"), the pet test panel and a simulated pet screen. |
| Pet screen lab | `/lab` | Design and test what the pet's 240×320 screen shows, live on the real screen over USB. |
| Pet media | `/media` | Videos and animations on the pet's SD card: convert, send, play, tune. |
| Pet firmware | `firmware/` | The ESP32 sketches, from first tests to the full story player. |
| Docs | `docs/`, `HARDWARE.md`, `firmware/` | How it works, every contract, the hardware findings, the wiring. |

Read, in this order: [docs/FEATURES.md](./docs/FEATURES.md) (what it does and why),
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (how it fits together, and how to port it to a
native app), [HARDWARE.md](./HARDWARE.md) and [firmware/README.md](./firmware/README.md) (the
pet), [firmware/WIRING.md](./firmware/WIRING.md) (every wire), and
[docs/PET-PROTOCOL.md](./docs/PET-PROTOCOL.md) (the Bluetooth bytes). [AGENTS.md](./AGENTS.md)
holds the project rules for coding agents.

Stack: Vite + React + TypeScript, Tailwind CSS v4, Leaflet with OpenStreetMap,
`vite-plugin-pwa`. **No backend**: stories and audio are bundled; everything runs in the
browser.

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm run dev        # http://localhost:5173  (also /debug, /lab, /media)
npm run build      # type-check + production build into dist/
npm run preview    # serve the built app, with the service worker
npm run lint       # oxlint
```

### On a phone

Phones only share location with HTTPS pages, so use the phone mode:

```sh
npm run dev:phone  # https://<laptop-ip>:5173 on the same Wi-Fi
```

The certificate is self-signed, so the phone warns once ("Not private"): tap Advanced, then
Proceed. If the page doesn't load, allow Node.js through the Windows Firewall on private
networks. Plain `npm run dev -- --host` works over HTTP for simulation, but not for real GPS.

### Hosting

Any static HTTPS host works (Netlify, Vercel, GitHub Pages). `public/_redirects` (Netlify) and
`vercel.json` send every path to `index.html`, so `/debug`, `/lab` and `/media` work.

## How a journey works

1. **Start journey** is a tap, on purpose: it unlocks audio (browsers block sound until the
   user taps), keeps the screen awake, and starts location.
2. Each location fix is checked against every story's place and radius. A story fires once per
   journey, needs two fixes inside its radius (or one accurate fix), and the nearest wins.
3. The story plays on the phone, or on the pet if one is paired; the map and the pet show the
   place.
4. The web can't track location in the background, so this is a **travel mode you switch on**,
   like a music player, and the screen stays on while it runs.

Simulation feeds the same trigger logic as real GPS, so everything can be developed and
demonstrated indoors. Details: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Stories and audio

- `src/data/stories.json` holds the stories (fields in [AGENTS.md](./AGENTS.md)). The entries
  in this repository are **placeholders**, marked `approved: false`.
- Put one MP3 per story in `public/audio/`, named as the story's `audio` field. **The audio
  files are not in the public repository**; without them a story shows as text for its length.
- For the pet, the same recordings go on its SD card as WAV:
  `ffmpeg -i in.mp3 -ac 1 -ar 22050 -c:a pcm_s16le stories/<id>.wav`.

## The pet

An Ai-Thinker ESP32-A1S Audio Kit v2.2 with a 2.4" ST7789 colour screen, a 4 Ω speaker, an
SD card and three buttons. It pairs with the app over Bluetooth LE (Chrome on Android or
desktop; iOS has no Web Bluetooth, so the pet is optional and the app is complete without it).

- Firmware, step by step: [firmware/README.md](./firmware/README.md). Main sketch:
  `firmware/pet_story_player/`.
- Every wire, the DIP switches and the buttons: [firmware/WIRING.md](./firmware/WIRING.md).
- What was verified on our board, and what bit us: [HARDWARE.md](./HARDWARE.md).
- In the Arduino IDE's Serial Monitor (921600 baud, Newline), type `help` for every command.

### Pet screen lab (`/lab`)

Chrome or Edge on a computer, pet on USB (Web Serial). Draft portrait designs for every pet
screen, drawn with the pet's own fonts; your own pictures and text as draggable layers; media
placement tests; live mirroring onto the real screen; and clips (frames plus sound) sent once
and played by the pet itself, with a timeline and sync controls.

### Pet media (`/media`)

Videos and animations for the pet, played from its SD card as **MJPEG + WAV** (the usual
format for ESP32 screens: full colour, small files, sound in sync). The page converts a video
or a set of pictures in the browser, sends it over USB (or downloads it for a card reader),
lists what's on the card, and plays it with live loop, speed, sync and volume. Without the
page: `node scripts/make-media.mjs <video> [name]` writes the same files with ffmpeg.

## Layout

| Path | What's in it |
|---|---|
| `src/data/` | Stories (`stories.json`), types, showcase places |
| `src/position/` | `PositionSource`: real GPS (`gps.ts`) and simulated rides (`simulate.ts`, `routes.ts`) |
| `src/trigger/trigger.ts` | Haversine distance and the fire-once, two-fix trigger rule (no React; testable alone) |
| `src/journey/` | The journey state machine and the screen wake lock |
| `src/audio/player.ts` | The one audio element, the unlock tap, the text-only fallback |
| `src/map/MapView.tsx` | The Leaflet map |
| `src/pet/` | The pet's Bluetooth protocol, pairing (with retry and reconnect), the fake pet and its screen |
| `src/product/` | The visitor app at `/` |
| `src/lab/` | The pet screen lab (`/lab`) and the media dashboard (`/media`) |
| `firmware/` | ESP32 sketches; `sd-card/` holds files to copy onto the pet's card |
| `scripts/` | Converters: faces → `faces.h`/`faces.json`, Adafruit fonts → `gfxFonts.json`, videos → MJPEG/WAV, a sprite sheet → frames |
| `assets/` | Source pictures (the pet's faces) |
| `docs/` | Features, architecture and porting guide, the pet's Bluetooth protocol |

## Not in the public repository

Left out because we don't hold the rights to share them, or they're placeholders:

- the placeholder story recordings (`public/audio/*.mp3`, `firmware/sd-card/stories/*.wav`);
- a stock crane sprite used to try a startup animation (`assets/pet-boot/crane-sheet.png`,
  `src/pet/crane.json`);
- one test video (`up-in-the-sky.mp4`).

The app builds and runs without them; the lab hides the options that need them
(`src/lab/optionalAssets.ts`).

## Licence

Software: MIT. Hardware: CERN-OHL-S-2.0. Documentation and media: CC BY 4.0. Third-party
parts keep their own licences. See `LICENSE.md` at the top of the team repository.
