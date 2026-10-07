# Platform constraints

What browsers, phones and the hardware allow, and how each limit shaped the design. These
shaped the architecture more than any design choice did. First-hand account:
[engineering log](ENGINEERING-LOG.md#platform-constraints-we-discovered).

## At a glance

| Capability | Android Chrome | Desktop Chrome / Edge | iPhone (any browser) | Used for |
|---|---|---|---|---|
| Location while the page is open | ✅ | ✅ | ✅ | the journey |
| Location in the background / screen off | ❌ | ❌ | ❌ | (not possible on the web) |
| Geofencing (wake on entering an area) | ❌ | ❌ | ❌ | (spec abandoned) |
| Screen Wake Lock | ✅ | ✅ | ✅ (recent iOS) | keeping the journey alive |
| Audio after a tap | ✅ | ✅ | ✅ | stories |
| **Web Bluetooth** | ✅ | ✅ | ❌ | pairing the pet |
| **Web Serial** (USB) | ❌ | ✅ | ❌ | the pet screen lab and media dashboard |
| Installable (PWA) | ✅ | ✅ | ✅ (Add to Home Screen) | the app |

Check current support before relying on a row: browser support changes, and this table is
from October 2026.

---

## The web

### It can't notice places for you

`watchPosition` stops when the page is in the background or the screen locks. The W3C
Geofencing API was specified and abandoned; it never shipped. Service workers wake for push,
fetch and sync, none of which are location events. Web Push is server-initiated, so a
location-aware version would need position streamed to a server all the time, which also
fails in a tunnel.

**So:** the app is a **travel mode you switch on**, and it says so.

### The screen must stay on

`navigator.wakeLock` keeps the screen awake. Without it the phone sleeps, location stops, and
the app silently does nothing for the rest of the journey. The browser drops the lock when the
tab is hidden, so it's re-taken on `visibilitychange`. (It looks like dead code. It isn't.)

### Sound needs a tap first

Browsers block audio until the user interacts. **Start journey** is that tap: it primes the
audio element, after which stories can start on their own for the rest of the session.

### Secure pages only

Location, Web Bluetooth and Web Serial only work on HTTPS (or `localhost`). For phone testing
on a laptop, the dev server runs HTTPS with a self-signed certificate (`npm run dev:phone`).

### No Web Bluetooth on iOS

Every iOS browser is WebKit underneath, and WebKit has no Web Bluetooth. **So:** the pet pairs
from Chrome on Android or a computer; the pairing UI is hidden where `navigator.bluetooth` is
missing (never show a dead end); and the app is complete without the pet.

### Web Serial is desktop-only

The pet tools (`/lab`, `/media`) talk to the pet over its USB cable with Web Serial: Chrome or
Edge on a computer. That's fine: they're team tools, not part of the product.

## Location in practice

- **GPS on a moving train is noisy.** One bad fix can fire a story a kilometre early. Rule:
  **two consecutive fixes inside the radius, or one fix whose accuracy is better than the
  radius**.
- **Phone GPS indoors is coarse**: often 10–50 m. Showcase spots need to be 50 m or more apart,
  ideally outdoors or near windows; "Mark here" averages 8 seconds of fixes.
- **The phone beats a GPS module.** Assisted GPS (cell and Wi-Fi) works inside a carriage where
  a bare GNSS module barely fixes. That's why the pet has no GPS: the phone decides.

## If we go native later

Recorded while we still planned a native app, for whoever revisits it:

- **Geofences aren't instant.** Both platforms trade latency for battery; a crossing can take
  tens of seconds to report, and a train at 60 km/h covers a kilometre a minute. Use **coarse
  geofences (800 m–1.5 km) to wake the app, then continuous high-accuracy location to place the
  person.** Geofence to wake, GPS to aim.
- **Region limits:** about 100 on Android, **20 on iOS**. Register the nearest N places and
  re-register as the person moves.
- **Opposite behaviour:** Android does **not** restart a terminated app on a geofence event; iOS
  does. On Android, use `startLocationUpdatesAsync` with a foreground service.
- **Expo can do it** (`expo-location` geofencing, `react-native-ble-plx` with its config plugin),
  but only in a **development build**, never Expo Go, which has no BLE.
- **iOS on a real device needs the paid Apple Developer Program** for signing, even with cloud
  builds. This is what pushed us to the web.

The porting guide, module by module: [ARCHITECTURE.md §6](../Code/pif-webapp/docs/ARCHITECTURE.md#6-porting-to-a-native-app).

## The hardware

| Limit | Consequence |
|---|---|
| Bluetooth LE moves tens of bytes per message | Audio, coordinates and images never cross it: ids and states only |
| USB serial moves about 90 KB/s (921600 baud) | Live screen mirroring is fine for stills, not video; video lives on the SD card |
| 4 MB flash, ~3 MB for the app (Huge APP partition) | No large media in the firmware; it goes on the SD card |
| 4 MB PSRAM | A video loads into memory (up to ~3.5 MB) so the card is free to stream its sound |
| Few free pins | Three buttons in total, no knob, no capacitive touch; display on its own bus |
| GPIO 0 is the codec clock and the boot pin | Uploads sometimes need the BOOT key held |
| GPIO 12 sets the flash voltage at boot | A button there goes to 3.3 V, never ground |
| Only GPIO 36 (of the free pins) can wake from deep sleep | KEY1 is the power key |
| A carriage runs 80–90 dB | Speech goes to earphones; the speaker is for sounds that only need noticing |
