# Decisions

Every significant decision, why we made it, and what it cost, including the ones we reversed.
The story behind the big ones is in the [engineering log](ENGINEERING-LOG.md#decisions-including-the-ones-we-reversed);
the dated technical log is in [ARCHITECTURE.md](../Code/pif-webapp/docs/ARCHITECTURE.md#10-decisions-log).

**Status:** ✅ held · 🔄 reversed (the later decision is the one in force) · 🗑️ tried and dropped

## Product

| | Decision | Why |
|---|---|---|
| ✅ | **Place-based, not transport-based.** A story is about a place and plays when you're there, however you travel. | The user is on their thousandth trip; nobody wants a tour. |
| ✅ | **Quiet and specific.** No points, streaks, badges, profiles, follows, comments or feeds. | The subject is a city people have stopped noticing; gamification would make it about the app. Connection on the commute is gated, not absent. |
| ✅ | **A travel mode you switch on**, like a music player. | The web can't notice places in the background. We say so in the UI instead of pretending. |
| ✅ | **The pet is an accessory, not the product.** | Most people won't have one, and iPhones can't pair with it. The app must be complete on its own. |
| ✅ | **Simulation is a first-class feature.** | Develop indoors; demonstrate in a room with no train. The trigger logic can't tell simulated from real. |
| ✅ | **Showcase by marking real spots** ("Mark here", 10–40 m radii), walked as a real GPS journey. | A demo that's the real thing, just compressed. |
| ✅ | **`source` is required on anything factual.** | Stories about real places need to be checkable. |
| ✅ | **Mobile-first, one-handed, readable in sunlight on a moving train.** | That's where it's used. |

## App

| | Decision | Why | Cost / trade-off |
|---|---|---|---|
| 🔄 | **Native app (Expo, Android first)** → **web app (PWA)** | The only phone was an iPhone and the only laptop a Windows Surface: the most expensive pairing for native ($99/year Apple Developer Program plus cloud builds before any code). | No background location; the product became a travel mode. A native port is documented for later ([ARCHITECTURE.md §6](../Code/pif-webapp/docs/ARCHITECTURE.md#6-porting-to-a-native-app)). |
| ✅ | **No backend**: stories and audio bundled with the app. | Nothing to run or pay for; works on any static HTTPS host. | Adding stories means a new build. Scaling plan (tiles, no server) in ARCHITECTURE.md §7. |
| ✅ | **Vite + React + TypeScript**, not Next.js. | Everything runs in the browser; Next's server strengths go unused. | |
| ✅ | **Leaflet + OpenStreetMap**, not Google Maps. | Free, no API key, offline-cacheable, good rail and road data for Mumbai. | Fewer shop names, which the stories don't need. |
| ✅ | **Two-fix trigger rule, once per journey, nearest wins.** | One bad fix on a moving train would fire a story a kilometre early. | A story starts a few seconds later. |
| ✅ | **Start journey is the audio unlock and takes a wake lock.** | Browsers block sound until a tap; a sleeping screen stops location. | |

## Pet and link

| | Decision | Why | Cost / trade-off |
|---|---|---|---|
| 🔄 | **Audio on the phone, pet as display and buzzer** → **the pet plays audio from its own SD card** | The A1S Audio Kit exists for its codec, jack and SD slot; in the first version the pet added nothing during playback. | Rewrote part of the Bluetooth contract and the parts list. |
| ✅ | **Bluetooth LE, not Wi-Fi** | Power (~10–15 mA vs 80–120 mA), UX (bonds once, reconnects silently), capability (only BLE does proximity, so pet-to-pet). | Wi-Fi keeps one job: bulk sync on the charger (not built). |
| ✅ | **What crosses the link:** story id, title, icon index, playback state, input. **Never:** coordinates, audio, runtime images. | Send the conclusion, not the input; privacy; everything fits in under 100 bytes. | Images must be preloaded on the pet. |
| ✅ | **`play` carries the story id as text** | WAV files are named like the MP3s: nothing to keep in sync. | Ids capped at 32 bytes. |
| ✅ | **Pet-to-pet = 4 bytes in the advertising packet** | No connection, pairing or handshake; the content is already on both sides. | Stubbed until a second pet exists. |
| 🔄 | **Round GC9A01 display** → **rectangular 2.4" ST7789 TFT** | Parts on hand; the group's face code already drove it. | The radial progress ring became a bar. |
| 🔄 | **Display shares the SD card's bus** (to free pins) → **display on its own SPI bus** | Sharing made the SD card fail to mount or read. | Two onboard keys lost (KEY4, KEY5). |
| ✅ | **Three buttons, one job each:** KEY1 power/sleep, KEY3 story, MTDI volume | Only KEY1's pin can wake the chip; no free analogue pin for a volume knob. | Volume is tap-up / hold-down. |
| ✅ | **The pet's screen will be held upright** (portrait) | How the object is meant to be held. | Its own screens are still landscape until the lab designs are ported. |
| 🗑️ | **Startup animation** (a crane in flight) | Tried, then removed. | Two seconds of every boot; the sprite wasn't ours to publish. |

## Tools and media

| | Decision | Why |
|---|---|---|
| ✅ | **Pet tools inside the web app (`/lab`, `/media`), over USB (Web Serial)** | Design on the real screen without reflashing; Bluetooth is far too slow for pictures. |
| 🔄 | **Stream frames live** → **clips into PSRAM** → **MJPEG + WAV on the SD card** | USB at ~90 KB/s can't carry video; MJPEG is full colour, small, and the usual ESP32 format; the sound is the clock. |
| ✅ | **Draw lab text with the pet's own fonts** | Designs match the firmware pixel for pixel. |
| ✅ | **The USB link runs at 921600 baud** (the lab can try faster and falls back) | Whole screens in a reasonable time. |

## Parts

| | Decision | Why |
|---|---|---|
| 🗑️ | **NEO-6M GPS on the pet** | The phone's assisted GPS works where a bare module in a carriage doesn't; ~45 mA and days of debugging for a worse fix. |
| 🗑️ | **PN532 NFC for pet-to-pet** | BLE does it already; shaky peer-mode support, a large board, ~100 mA polling. |
| ✅ | **A power path** (charger, boost, protection) | A 3.7 V cell can't run a 5 V-input devkit; nothing would have booted. |
| ✅ | **MOSFET and flyback diode for a vibration motor** | A coin motor's 60–100 mA kills a GPIO. (No motor fitted yet.) |
| ✅ | **Spares of every active part** | Nothing could be bought locally in Goa; one dead ESP32 ends the week. |

## Publishing

| | Decision | Why |
|---|---|---|
| ✅ | **MIT (software), CERN-OHL-S-2.0 (hardware), CC BY 4.0 (docs and media)** | The residency's licences. |
| ✅ | **Leave out what isn't ours**: placeholder recordings, a stock sprite, one test video | Open licences only cover what we made or have rights to. The app runs without them. |
