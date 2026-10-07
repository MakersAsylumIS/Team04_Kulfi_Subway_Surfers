# Engineering log

What we hit, what caused it, and what fixed it — written down while it was still fresh.

This is deliberately an honest record rather than a tidy narrative. It includes the
decisions we reversed and the days we lost, because those are the parts that are useful
to someone else and the parts that vanish from a README.

**Project:** a location-triggered story app for Mumbai commuters, plus a companion
hardware object ("the pet"), built for the Play it Forward residency
(Kulfi Collective × Makers Asylum, Sept–Oct 2026).

**Team:** Gayatri Sapre, Avantika Rikhye, Aarya Rokade. Mentor: Kushal.

The same material, organised by topic: [RESEARCH.md](RESEARCH.md) (fieldwork and design
process), [DECISIONS.md](DECISIONS.md) (every decision, including the reversals),
[PLATFORM-CONSTRAINTS.md](PLATFORM-CONSTRAINTS.md) (what the web and phones allow),
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) (symptom → cause → fix, all in one table) and
[OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

---

## Contents

- [Phases](#phases)
- [Research findings](#research-findings)
- [Decisions, including the ones we reversed](#decisions-including-the-ones-we-reversed)
- [Hardware: symptom → cause → fix](#hardware-symptom--cause--fix)
- [Build week: what the board taught us next](#build-week-what-the-board-taught-us-next)
- [Platform constraints we discovered](#platform-constraints-we-discovered)
- [Parts list: what changed and why](#parts-list-what-changed-and-why)
- [Dead ends](#dead-ends)
- [If you're starting something like this](#if-youre-starting-something-like-this)
- [Still unresolved](#still-unresolved)

---

## Phases

| | |
|---|---|
| Pre-study | 18–31 Aug — remote modules |
| Mumbai residency | September — fieldwork, problem statement, concept |
| Goa build week | 1–7 Oct — Makers Asylum, funded |
| Showcase | mid-October |

---

## Research findings

### Fieldwork: interviews validated, they didn't reveal

We did one long multi-modal journey (Lower Parel → Ghatkopar → CSMT → Nariman Point →
CSMT metro → Aarey JVLR → IIM Powai → Lower Parel) and nine conversations. The
conversations largely confirmed what we'd already observed and surfaced nothing new.

The diagnosis wasn't *not enough interviews*, it was **the wrong question format**. The
Day 1 script asked "what do you notice? what do you ignore?" — and nobody can report what
they ignore, because if they could report it they wouldn't be ignoring it. Asking a
regular commuter for opinions about their commute returns the answer they've already
rehearsed a hundred times.

What would have worked better:

- **Ask people to teach, not describe.** "I need to get from Ghatkopar to Nariman Point
  at 9am tomorrow — walk me through exactly what you'd do." You cannot ask someone what
  they know; you can make them perform it.
- **Count instead of asking.** Earphones in vs sound actually playing. Sleepers. Eyes up
  vs eyes down.
- **Probe instead of interview.** Put a cheap fake thing into the world and watch
  behaviour, which disagrees with opinion far more often than people expect.

### The genre has a graveyard

Location-based audio storytelling has been built many times. [Detour](https://medium.com/detour-dot-com/detour-the-next-chapter-6f1aa2d97a14)
— founded by the Groupon founder, well funded, beautifully produced — was absorbed by
Bose in 2018 and shut down as a consumer product. [VoiceMap](https://voicemap.me/)
survived by becoming a tourism platform and already has community authoring.
[Echoes](https://echoes.xyz/) gives anyone a geolocated tour builder for free.

The useful observation: **every product in this genre is built for someone's first visit.
Our user is on their thousandth.** That inverts the entire design assumption — a commuter
who has passed Dadar four thousand times does not want a tour guide. It's also probably
why the graveyard is so full: the tourism framing doesn't transfer to daily travel.

### The strongest material came from contradictions in our own notes

Three people rode the same city and came back disagreeing. "No social connection" sat
next to "everyone was helpful when I was lost." Both were true, which meant connection
isn't absent — it's *gated*, and the entry condition is a legible need. Kids loved the
same carriage adults called boring, which meant boredom isn't a property of the journey
but of repetition.

Those contradictions were worth more than any single observation.

---

## Decisions, including the ones we reversed

### Reversed: audio location

**First decision:** audio lives on the phone, pet is a display and a buzzer.
**Reversed to:** the pet plays audio from its own SD card.

What changed: we bought an ESP32-A1S Audio Kit, whose entire reason for existing is its
audio codec, headphone jack and SD slot. The original architecture made that hardware
pointless. More importantly, in the first version the pet contributed *nothing* during
playback — same audio, same earphones, so the object was decoration. Having it play means
it earns its place.

What this cost: it invalidated part of the BLE contract and the parts list, both of which
had to be rewritten.

### Reversed: native app → web app

**First decision:** native app (Expo), Android first, because the web cannot do
background geolocation.
**Reversed to:** web app.

The technical argument for native never went away — the web genuinely cannot wake an app
when you pass a place. What changed was the hardware reality: the only phone available
was an iPhone and the only laptop was a Windows Surface, which is the single most
expensive combination for native development ($99/year Apple Developer Program plus cloud
builds, before writing a line of code).

The web app can be built and tested today on the hardware we actually have. That's a
real trade, honestly made, and it changes the product: it becomes a **travel mode you
switch on**, like a music player, rather than something that taps you on the shoulder.

### Held: BLE over WiFi

Decided on power, UX and capability, in that order:

- **Power** — ESP32 on WiFi draws roughly 80–120mA continuously; BLE is ~10–15mA active
  and microamps idle. On a 1000mAh cell that's hours versus days.
- **UX** — BLE bonds once and reconnects silently. WiFi has no good answer: either the
  phone tethers (user must enable it, drains battery) or the ESP32 becomes an access
  point (phone loses its own internet).
- **Capability** — only BLE does ambient proximity discovery. The pet-to-pet feature
  only exists because BLE exists.

WiFi retains exactly one job: bulk sync and firmware updates while parked on the charger.

### Held: what crosses the link, and what must not

**Crosses:** a story id, a title, an icon index, playback state, input events. Everything
fits in under 100 bytes per event, which is why the bandwidth argument for WiFi never
mattered.

**Never crosses:**
- **Coordinates.** The pet makes no decision based on position. Send the conclusion, not
  the input. Shipping raw location to a peripheral is pointless work and a privacy
  liability.
- **Audio.** The files are already on the pet's SD card.
- **Images at runtime.** A 240×240 frame takes ~6 seconds over BLE. Preload an icon set,
  send a one-byte index.

The nicest consequence: **pet-to-pet carries four bytes in the advertising packet** — a
service UUID and the last story id. No connection, no pairing, no handshake. The content
was already on both sides. Two strangers exchange less than a word.

---

## Hardware: symptom → cause → fix

The ESP32-A1S Audio Kit cost us roughly a day, almost all of it on four problems with
misleading symptoms.

| Symptom | Cause | Fix |
|---|---|---|
| Board powers up (green LED), **no COM port ever appears** | Charge-only USB cable — power pins wired, no data pins | A cable that has actually synced a phone. Test: plug/unplug with Device Manager open; if the tree doesn't flicker there's no data link |
| Device shows under *Other devices*, **Code 28** | CP210x driver not installed | Silicon Labs CP210x VCP driver, or Windows Update → Optional updates → Driver updates |
| `Could not open COM4, the port is busy` | Serial Monitor still holding the port | Close the monitor (the X on the tab, not just switching away) |
| Upload succeeds, **boot log ends at `entry 0x400805b4`, then silence** | PSRAM enabled on the *ESP32 Dev Module* profile hangs before `setup()` | Use **ESP32 Wrover Module**, which knows where PSRAM lives on this module class. Dev Module + PSRAM *disabled* also works, for bring-up |
| Serial prints once then nothing | Sketch only printed in `setup()`; the monitor attaches after upload and misses it | Print in `loop()` during bring-up, or press RST with the monitor already open |
| Audio pipeline logs `StreamCopy 1024 -> 1024 -> 1024` happily, **total silence** | Two separate causes, identical symptoms — see below | Both fixes below, together |
| `Timed out waiting for packet header` on upload | GPIO0 is the codec master clock *and* the boot strap pin, so auto-reset is unreliable here | Hold BOOT, start upload, release when "Connecting…" becomes writing. Dropping to 115200 also helps |

### The silence problem, in detail

This was the expensive one, because the log looks perfect.

**Cause 1: wrong board variant.** The library's bundled example
`streams-generator-audiokit` defaults to `AudioKitEs8388V2`. Our board needs
**`AudioKitEs8388V1`**. The variants differ in I2S pin assignment, so with the wrong one
samples stream into unconnected GPIOs while `StreamCopy` reports success.

**Cause 2: the example never calls `setVolume()`.** The ES8388 comes up attenuated.
Without an explicit `out.setVolume(0.5)` after `begin()`, you get a healthy log and
nothing audible.

Either one alone produces silence. **Both fixes are required.**

```cpp
AudioBoardStream out(AudioKitEs8388V1);   // not V2
// ...
out.begin(config);
out.setVolume(0.5);                        // the example omits this entirely
```

### The board revision lottery

There are at least four boards sold as "ESP32 Audio Kit." Some carry an **AC101** codec
(end-of-life, I2C `0x1A`), newer ones an **ES8388** (`0x10` or `0x11`), and there are
multiple ES8388 revisions with different pin maps. Two of the best references online
disagree on whether word-select is GPIO25 or GPIO26 — neither is wrong, they describe
different boards.

**The first thing to do with one of these is an I2C scan.** Ours answered `0x10` on
SDA 33 / SCL 32, and nothing on the swapped order. Everything downstream follows from
that one line.

### Pin conflicts worth knowing

- **GPIO0** is the codec master clock *and* the boot strap pin. Permanently unavailable,
  and the reason uploads are sometimes awkward.
- **GPIO13** is shared between the SD card and KEY2. You get one.
- **Capacitive touch is unavailable** — ESP32 touch pins are 0, 2, 4, 12, 13, 14, 15, 27,
  32, 33, and this board has claimed all of the ones it breaks out. *(Confirmed in build
  week.)*
- The IMU can share the codec's I2C bus — different address, no extra pins.

Full details in [HARDWARE.md](../Code/pif-webapp/HARDWARE.md).

---

## Build week: what the board taught us next

Added during the Goa build week (1–7 Oct), as each part was brought up one at a time:
Bluetooth, then speaker, display, SD card, keys, then all of them together.

### Parts that weren't what the label said

- **The display.** We'd planned a round GC9A01; the parts on hand were a rectangular 2.4"
  240×320 TFT whose product page says **ILI9341**. It only works with the **ST7789**
  driver (which is what the group's existing face code used). Trust working code over the
  listing.
- **Colour inversion.** Many ST7789 panels need inversion on, and the library turns it on.
  Our firmware turns it off; the team's TFT Web Lab says this panel needs it on. Symptom of
  the wrong setting: colours like a negative (black shows white, cyan shows red). One line
  to flip, but check by eye.

### Display

| Symptom | Cause | Fix |
|---|---|---|
| Screen stays black with DC on GPIO 19 | GPIO 19 is wired to the onboard KEY3 circuit | DC on another pin (21 worked; 22 in the end) |
| Screen goes white at random | One corrupted SPI command (long jumper wires, fast clock) | 20 MHz SPI, re-initialise the screen per story, and a `screen` command to recover |
| OLED test screen stays black | U8g2's second-I2C mode is compiled out on the ESP32 | A small custom driver for the second I2C bus; and GPIO 32/33 aren't on this board's headers |
| Face redraws make the audio click | Big redraws hog the shared bus | Draw the face in 16-row slices; redraw only what changed |

### SD card and buttons: the bus-sharing experiment

We wanted more buttons, and the board has no free pins. The idea: move the display onto
the SD card's SPI bus (MTMS/MTDO on the JTAG header) and free two pins for an I2C GPIO
expander.

**It failed, instructively.** The SD card stopped mounting, then mounted at a lower speed
but couldn't read its own folders. The display's jumper wires hanging off the card's clock
and command lines were enough to garble it. Holding the display deselected and slowing the
card down didn't save it. We moved the display back to its own pins.

Along the way:

- **The DIP switches** (S1 on the schematic) connect GPIO 13 and 15 to the SD card, KEY2 and
  the JTAG header. Working set: **1 OFF, 2 ON, 3 ON, 4 OFF, 5 OFF**.
- **"No /stories folder"** with a card full of stories meant reads were failing, not that the
  folder was missing; and a card reseated without a reset leaves a stale mount. The firmware
  now remounts once on failure and steps the card's speed down until it reads.
- **No expander after all:** the module on hand was a PCA9685, which is output-only.
- **Keys:** a key-check sketch confirmed all six onboard keys, but only KEY1 (GPIO 36) and
  KEY3 (19) are free once the display and SD card are wired.
- **A third button on GPIO 12 (MTDI)** works, with a catch: GPIO 12 sets the flash voltage at
  boot, so it must read LOW then. The button goes to **3.3 V** with an internal pull-down,
  not to ground.
- **No volume knob:** none of the broken-out pins can read an analogue voltage. Volume became
  a button (tap up, hold down).
- **Sleep:** only KEY1's pin (36) can wake the chip from deep sleep, so KEY1 became power.

### Audio

| Symptom | Cause | Fix |
|---|---|---|
| Speaker quiet at volume 0.7, distorted at 1.0 | 0.7 is about −10 dB on this codec; 1.0 is +4.5 dB | **0.9 = 0 dB** |
| Bluetooth speaker test sketch too big to upload | A2DP is large | Partition Scheme **Huge APP** |
| A WAV from FL Studio played for one bar, or showed "0 s" | 24-bit audio, plus extra "JUNK" chunks before the data | A WAV parser that walks the chunks and rejects non-16-bit; convert with ffmpeg (`-ac 1 -ar 22050 -c:a pcm_s16le`) |
| No sound from the speaker though playback runs | A key hold had switched the speaker amp off, or earphones in the jack | Re-enable the amp on every volume change; the jack mutes the speaker by design |

**Resolved: Bluetooth while audio plays.** The integration risk we flagged turned out
fine: the pet advertises, takes commands and sends playback updates while streaming a WAV
from the SD card, with audio on its own core.

### The link to the phone

- **"GATT Server is disconnected"** came up often right after pairing (especially on
  Windows). Pairing now retries, and an unexpected drop reconnects by itself and
  re-subscribes, before the app ever reports a disconnect.

### Pet tools over USB, and why video went onto the SD card

To design the pet's screens we built a lab page that draws on the real screen over USB
(Web Serial). Findings:

- **Chrome's port list includes Bluetooth serial ports** left over from earlier tests. They
  open fine and never answer. Pick the board's own USB port (CP210x / CH340).
- **Opening the port can leave the board stuck in reset**, depending on the USB chip and
  driver. The lab now tries, in order: ask without restarting; restart the Arduino way;
  the other line setting; then asks for a press of RST.
- **Streaming video over USB can't look like video.** At 921600 baud the link moves about
  90 KB/s; a full 240×320 colour frame is 150 KB, so a busy frame takes 0.5–1.7 s and paints
  top to bottom. A faster baud only halves that.
- **So the frames have to live on the pet.** First as clips sent once into PSRAM, then
  as **MJPEG + WAV on the SD card**, the usual format for ESP32 screens: full colour, small
  files (a 5-second clip is about 80–150 KB), decoded by the JPEGDEC library, with the sound
  as the clock so frames that fall behind are skipped and picture and sound stay together.

### Rights

Before publishing we checked what we were entitled to share. Placeholder story recordings,
a stock sprite used to try a startup animation, and one test video were left out of the
public repository. Worth doing before, not after, a first push: anything pushed stays in
the history.

---

## Platform constraints we discovered

These shaped the architecture more than any design decision did.

### The web cannot notice places for you

`watchPosition` stops when the page is backgrounded or the screen locks. The W3C
Geofencing API was specified and then abandoned — it never shipped. Service workers wake
for push, fetch and sync, none of which are location events. Web Push is server-initiated,
so making it location-aware would mean streaming position to a server continuously, which
fails in a tunnel anyway.

**Consequence:** the web version is a travel mode you switch on. We say so in the UI
rather than pretending otherwise.

### Web Bluetooth does not exist on iOS

Not Safari, not Chrome for iOS, not any iOS browser — they're all WebKit underneath. The
pet pairs only from **Chrome on Android or Chrome on desktop**.

**Consequence:** the pet demo runs from a laptop or an Android phone, and the pairing UI
is feature-detected and hidden where `navigator.bluetooth` is absent. Never show a user a
dead end.

### Audio will not play without a user gesture

Browsers block programmatic playback until the user has interacted. This isn't a bug to
work around later — it's architecture. **The "Start journey" button is the audio unlock.**
Prime the audio element on that tap and programmatic playback works for the rest of the
session.

### Screen Wake Lock is load-bearing

`navigator.wakeLock` keeps the screen on. Without it the phone sleeps, `watchPosition`
stops, and the app silently does nothing for the rest of the journey. The lock is also
dropped when the tab hides, so it must be re-acquired on `visibilitychange`.

It looks like dead code to anyone reading the source. It isn't.

### Geofence triggers are not instant (relevant if anyone revisits native)

Both mobile platforms trade latency for battery; a crossing can take tens of seconds to
fire. **A train at 60km/h covers a kilometre a minute**, so a tight geofence is often
exited before it reports.

The design that works: **coarse geofences (800m–1.5km) to wake the app, then continuous
high-accuracy location to actually place the person.** Geofence to wake, GPS to aim.

Other native findings, recorded in case we return to it:

- Region limits: ~100 on Android, **20 on iOS**. You cannot monitor every place — register
  the nearest N and re-register as the user moves.
- **Android does not restart a terminated app on a geofence event. iOS does.** The
  platforms are opposite here. Android's reliable pattern is
  `startLocationUpdatesAsync` with a foreground service.
- Expo can do all of this (`expo-location` has native geofencing, `react-native-ble-plx`
  has an official config plugin) — but **requires a development build, never Expo Go**,
  which doesn't contain BLE.
- An iOS development build on a physical device **requires a paid Apple Developer
  Program membership** for signing, even with EAS cloud builds. This is what pushed us to
  the web.

### GPS on a moving train is noisy

A single bad fix will fire a story a kilometre early. Require two consecutive fixes
inside the radius, or one fix whose accuracy is tighter than the radius, before
triggering.

### Phone GPS indoors is coarse

For a showcase in a building, phone GPS is often only good to 10–50 m. Story spots need to
be 50 m or more apart, ideally outdoors or near windows; the "Mark here" tool averages 8
seconds of fixes to place each one.

---

## Parts list: what changed and why

The original BOM was 27 lines. Two things came out, several went in, and buying the
A1S Audio Kit removed a handful more.

**Removed — NEO-6M GPS.** The pet is tethered to the phone, and the phone's assisted GPS
(cell plus wifi trilateration) works exactly where a bare GNSS module fails. A NEO-6M
under a printed shell, clipped to a bag, inside a metal carriage, barely fixes at all and
gets nothing underground. It would have cost ~45mA continuous and several days of
debugging to produce a worse position than the phone already has.

**Removed — PN532 NFC.** Pet-to-pet runs on BLE, which the ESP32 already has.
PN532-to-PN532 peer mode has shaky library support, the breakout is ~43×40mm, and it
draws ~100mA polling.

**Added — a power path.** This was missing entirely and nothing would have booted. A
3.7V LiPo cannot run a WROOM-32 devkit: the onboard AMS1117 needs ~5V in. One IP5306
module provides USB-C charging, 5V boost and cell protection together.

**Added — a MOSFET and flyback diode** for the vibration motor. Coin motors pull
60–100mA; driving one from a GPIO kills the pin.

**Added — brass heat-set inserts, silicone wire, JST connectors, and a second unit of
every active part.** The residency sheet warns in red not to count on buying anything
locally in Goa, and one dead ESP32 mid-week ends the project.

**Made redundant by the A1S kit** — the MAX98357A amplifier, the INMP441 microphone, the
MicroSD module, the tactile buttons, and probably the power module. The kit has all of
them on board.

**What the pet is built from now** (October): the A1S Audio Kit, the 2.4" ST7789 TFT, a
4 Ω 3 W speaker, an SD card, one extra tactile button, and a 3.7 V 950 mAh Li-ion cell
not yet wired. See [BOM.csv](../BOM.csv).

---

## Dead ends

**Designing before the fieldwork was interpreted.** Our first idea document was a list of
*formal preferences* — "portable, wearable, clip, Gameboy-sized, auditory" — written
before any tension had been named. Nothing in it traced back to a single observation. We
rebuilt from the observations instead.

**Framing the commute as a problem to fix.** The initial problem areas were security,
speed, productivity and fun. Three of those are optimisation frames that the brief
explicitly rejects ("we don't want you to redesign Mumbai's commute"), and the fourth is
a tone rather than a territory. Reframing from *deficits to fix* to *territories to
reveal* is what unstuck the concept.

**Chasing validation.** After nine conversations that only confirmed what we'd seen, we
kept planning more interviews. Switching from discovery to falsification — naming the
assumptions that would change the project if wrong, then testing those — would have been
a better use of the same hours.

**The speaker, partly.** A Mumbai carriage runs 80–90dB and a small driver loses that
fight for intelligibility. The speaker survived in the design but with a narrower job:
**the headphone jack carries speech, the speaker carries everything that isn't words** —
chirps, acknowledgements, the peer encounter. Those work at low volume precisely because
they don't need to be understood, only noticed.

**Sharing the SD card's bus with the display** (build week): it freed two pins on paper
and cost the SD card in practice. See above.

**Streaming frames over USB as video** (build week): fine for still screens, never fast
enough for motion. Storing on the pet was the answer.

**A startup animation** (build week): built, tried, and taken out: two seconds of every
boot, and the sprite wasn't ours to publish.

---

## If you're starting something like this

1. **Identify your exact board before trusting any pinout.** On the A1S family this is a
   single I2C scan and it saves a day.
2. **Change one variable at a time.** Most of our lost hours came from changing a board
   profile and a library constant together, then not knowing which broke it.
3. **Build the simulation mode before the real thing.** It's how you develop indoors, and
   it's how you demo in a room where no train exists. Design it so the trigger logic
   can't tell simulated coordinates from real ones.
4. **Make each day end with something that runs end to end.** Never spend a day on
   something that only works once something else is finished.
5. **Write down the working configuration the moment it works.** `AudioKitEs8388V1` plus
   `setVolume()` is the kind of pairing you rediscover painfully a week later.
6. **Keep a graveyard.** The parked ideas, with the reason written next to each, turned
   out to be the clearest evidence that the final direction was chosen rather than
   stumbled into.
7. **Bring up one part at a time, with a tiny sketch for each** (Bluetooth, speaker,
   display, keys). When everything was combined, every failure pointed at one new thing.
8. **Make the device tell you what's wrong.** A `help` command, readable status lines and
   specific error messages ("needs 16-bit PCM WAV", "no SD card answered") saved more time
   than any debugger.
9. **Check the rights to every asset before the first public push.**

---

## Still unresolved

Updated 7 October. Struck-through items were resolved in build week.

**Hardware**

- [x] ~~SD card mounting, and the DIP switch positions that make it work~~ — 1 OFF, 2 ON, 3 ON, 4 OFF, 5 OFF
- [x] ~~WAV playback from SD without dropouts~~ — 16-bit PCM, mono 22050 Hz
- [x] ~~BLE advertising and GATT while audio is playing~~ — works
- [x] ~~Which GPIOs are physically broken out for the display~~ — SCK 18, MOSI 23, CS 5, DC 22, RST to EN
- [x] ~~Whether any pin survives for capacitive touch~~ — none does
- [ ] Onboard mics (some units ship with a capacitor fault) — not needed so far
- [ ] Battery operation and runtime
- [ ] Video (MJPEG + WAV) on the real board, and its sync
- [ ] Colour inversion on or off for our panel

**Product**

- [ ] **Replay rules.** A regular passes the same place twice a day, every day. If the
      same story fires every time, the app becomes something they switch off in week two.
      What decays, and does a place eventually go quiet?
- [ ] **Rejection feedback.** With no profiles there is nobody to notify. Does a
      submission return a claim code, or simply vanish?
- [ ] **Direction.** Should a story fire regardless of travel direction, or only one way?
      Direction is free from consecutive fixes and makes the experience feel considerably
      smarter.
- [ ] **The icon set** — how many, and who draws them.
- [ ] Whether a second pet gets built, which decides whether the peer exchange is a
      working feature or a described concept.

More detail on each: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
