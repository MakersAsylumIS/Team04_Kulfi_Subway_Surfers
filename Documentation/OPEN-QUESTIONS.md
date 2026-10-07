# Open questions

What's still undecided or untested, with the context needed to decide it. Updated 7 October 2026.
Resolved items are struck through in the [engineering log](ENGINEERING-LOG.md#still-unresolved).

## Product

### Replay rules

A regular passes the same place twice a day, every day. Today a story fires once **per journey**,
so the same commuter hears the same story every morning, and the app becomes something they
switch off in week two.

- What decays? (Once ever; once a week; quieter each time.)
- Does a place eventually go quiet, or hand over to a different story about it?
- Related, in [FEATURES.md §2](../Code/pif-webapp/docs/FEATURES.md#2-the-unlock-model-decide):
  the proposed model is **hear** only where you are, **reveal** the map along where you've been,
  and **collect** what you've heard to replay anywhere. Nothing is remembered between journeys yet.

### Direction

Should a story fire regardless of which way you're travelling, or only one way? Direction comes
free from consecutive fixes, and would make the experience feel considerably smarter (a story
that reads as "coming up" vs "behind you").

### Rejection feedback

Submissions are meant to be anonymous, with no profiles: so there's nobody to notify when one is
rejected. Does a submission return a claim code, or simply vanish? (Submissions aren't built yet.)

### The icon set

The pet shows an `icon_id` per story, preloaded on the pet. How many icons, and who draws them?

### A second pet

Pet-to-pet (4 bytes in a Bluetooth advertisement: "I passed this story") is designed and stubbed.
Whether a second pet gets built decides whether it's a working feature or a described concept.

## Content

- [ ] The real stories: text, recordings and sources, for the showcase places
- [ ] Approval: every story in the repository is a placeholder (`approved: false`)
- [ ] Spoken place names: the plan is a short recorded "You're at …" clip prepended to each story's
      audio (ffmpeg), not text-to-speech on the device

## Hardware

- [ ] **Battery and runtime**: a 3.7 V 950 mAh cell is on hand; wire it with a slide switch on +,
      then time it
- [ ] **Video on the board**: MJPEG + WAV from the SD card is built and converts correctly; to be
      run on the pet, with sync checked using `sync-test`
- [ ] **Colour inversion**: our firmware has it off, the TFT Web Lab says on; check by eye
- [ ] **Portrait screens**: drafted in the lab (`/lab`); pick the designs, port them to `pet_screen.h`
- [ ] **Onboard microphones**: untested (some units ship with a capacitor fault); not needed so far
- [ ] **A vibration motor** for arrivals (needs a MOSFET and flyback diode; no free pin today
      without giving something up)
- [ ] **An enclosure** (CAD): upright screen, speaker grille, buttons, battery, access to USB and SD

## Showcase

- [ ] Choose the spots (50 m or more apart, near windows or outdoors), mark them with "Mark here",
      rehearse with the simulated walk
- [ ] An Android phone or laptop for pairing the pet (no Web Bluetooth on iPhone)
- [ ] Host the app on HTTPS, or run `npm run dev:phone` on a laptop on the same Wi-Fi
- [ ] Earphones for listeners; the speaker for the pet's sounds
