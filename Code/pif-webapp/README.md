# Play it Forward: web app

Location-triggered commute stories for Mumbai. Read [AGENTS.md](./AGENTS.md) for the
decisions and rules, [docs/FEATURES.md](./docs/FEATURES.md) for what it does, [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for how it fits
together (and how to port it to a native app), and [HARDWARE.md](./HARDWARE.md) before
touching anything pet-related.

Stack: Vite + React + TypeScript, Tailwind CSS v4, `vite-plugin-pwa`. No backend.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the built app, with the service worker
```

## Testing on a phone

Phones only share location with HTTPS pages, so use the phone mode:

```sh
npm run dev:phone  # https://<laptop-ip>:5173 on the same Wi-Fi
```

The certificate is self-signed, so the phone warns once ("Not private"). Tap Advanced, then
Proceed. If the page doesn't load, allow Node.js through Windows Firewall on private networks.
Plain `npm run dev -- --host` works over HTTP for simulation, but not for real GPS.

## Audio

Put one MP3 per story in `public/audio/`, named exactly as the story's `audio` field. The
Start journey tap unlocks audio. If a file is missing or can't play, the story shows as text
for `duration_s` instead, and the card says "No audio file, text only".

## Layout

- `src/data/stories.json`: the story list (contract in AGENTS.md). The three entries are
  draft placeholders with `approved: false`; replace them with the team's stories.
- `public/audio/`: one MP3 per story, named as in each story's `audio` field.
- `src/position/`: the `PositionSource` interface, with `gps.ts` (real location) and
  `simulate.ts` + `routes.ts` (simulated rides) behind it. `src/journey/useJourney.ts` is
  the only place that chooses between them.
- `src/audio/player.ts`: the single audio element, the Start journey unlock, and the text-only fallback.
- `src/pet/`: the pet's Bluetooth protocol (see [docs/PET-PROTOCOL.md](./docs/PET-PROTOCOL.md)), real pairing, and a fake pet for testing without hardware.
- `firmware/`: the pet's ESP32 sketches, built up one step at a time (see firmware/README.md).
- `src/map/MapView.tsx`: the Leaflet map (OpenStreetMap tiles) on the journey screen.
- `src/trigger/trigger.ts`: haversine distance and the fire-once, two-fix trigger rule.
  No React, so it can be tested on its own.
