# Pet firmware

Built up one piece at a time. Each sketch proves one thing before the next is added.
Board facts and pin rules: [HARDWARE.md](../HARDWARE.md). Wiring for the parts on hand:
[docs/FEATURES.md section 7](../docs/FEATURES.md). Bluetooth bytes:
[docs/PET-PROTOCOL.md](../docs/PET-PROTOCOL.md).

| Step | Sketch | Proves | Status |
|---|---|---|---|
| 1 | `pet_ble_test/` | Bluetooth protocol, with nRF Connect and the web app | **passed** on the board (2026-10-03) |
| 1b | `speaker_test/` | a tone through the speaker (amp on GPIO 21) | compiles; test on the board |
| 1c | `bt_speaker_test/` | the board as a normal Bluetooth speaker: play anything from a laptop or phone | written; needs the ESP32-A2DP library |
| 1d | `pet_display_test/` | ST7789 display + Bluetooth: shows what the app sends, including your phone's GPS | compiles |
| 1e | `display_check/`, `oled_check/` | smallest screen tests: TFT colour cycle; OLED I2C scan + text | compile |
| 2 | `pet_story_player/` | **Bluetooth + display + WAV from SD, together**: the app's Play plays a real story | compiles for both displays (2026-10-04); test on the board |
| 2b | + the group's face on the ST7789 | face animation alongside Bluetooth | |
| 3 | + touch switch and button | pat and double-pat reach the app | |
| 4 | + WAV from the SD card | real audio, on its own core | |
| 5 | Bluetooth while audio plays | no stutter (the riskiest step) | |

## Step 1: Bluetooth test

**Setup (once):** in the Arduino IDE, install **NimBLE-Arduino** (by h2zero, version 2.x)
from the Library Manager. Board: **ESP32 Wrover Module**. Checked to compile with
NimBLE-Arduino 2.5.1 and ESP32 core 3.3.12.

**Flash** `pet_ble_test/pet_ble_test.ino`, then open the Serial Monitor at **115200**. It
prints `Advertising as "PiF Pet"`.

**Test A, with nRF Connect on your phone:**
1. Scan, find **PiF Pet**, connect.
2. Open the service starting `f4040001`. On `f4040005` (playback), tap the triple-arrow
   to turn on notifications.
3. On `f4040002` (play), write this hex (offset 0, then `mahim-causeway-01`):
   `00006D6168696D2D63617573657761792D3031`
4. Serial shows `<- play "mahim-causeway-01"`, and playback notifications tick up once a
   second, then return to state 0 after 40 s.

**Test B, with the web app:** Web Bluetooth works in Chrome on a laptop too, and
`localhost` counts as secure.
1. `npm run dev` and open http://localhost:5173 in **Chrome**. Disconnect nRF Connect first,
   because the pet takes one connection at a time.
2. Tap **Pair a pet**, choose **PiF Pet**. The **Test the pet** panel appears: tap Play on any
   story to send it straight to the pet, no journey needed. Touches from the pet show up there.
3. Pick the walking route and start the journey. When Mahim fires, the story card says
   "Playing on your pet", Serial shows `now_showing`, `haptic` and `play`, and the card's
   timer follows the pet.
4. In the Serial Monitor, type `p` and press Enter: the story pauses (pat). `d` skips it
   (double-pat).
5. Type `m`, then let a story fire: the pet answers "missing file" and the phone plays it
   instead.

## Step 1b: Speaker test

Flash `speaker_test/speaker_test.ino` with the earphones **unplugged** (plugging them in can
switch the speaker amp off). You should hear a steady tone. Serial Monitor at 115200:
`+` / `-` volume, `s` speaker amp on/off, `n` next note. Checked to compile against
arduino-audio-tools and arduino-audio-driver as installed on this laptop.

If it's silent: check the speaker is on the speaker terminals (not the line-in socket),
try `s` twice, raise the volume, and check the earphones are out.

## Step 1c: Bluetooth speaker test

Makes the board an ordinary Bluetooth speaker called **PiF Pet Speaker**, to test the
speaker and audio path with any sound. This uses Classic Bluetooth audio (like earbuds), not
the app's Bluetooth LE protocol, so the app can't drive it.

1. Install **ESP32-A2DP** (github.com/pschatzmann/ESP32-A2DP): download the ZIP, extract into
   `Documents/Arduino/libraries`, rename the folder to drop `-main`.
2. Tools → Partition Scheme → **Huge APP (3MB No OTA/1MB SPIFFS)**. Classic Bluetooth audio
   is too big for the default partition.
3. Upload `bt_speaker_test/bt_speaker_test.ino`, unplug the earphones.
4. On the laptop: Bluetooth settings → add device → **PiF Pet Speaker**. Pick it as the sound
   output and play anything. Serial Monitor: `+` / `-` volume, `s` speaker amp on/off.

## Step 1d: Display + Bluetooth (phone GPS on the screen)

**Wiring:** SCK 18, MOSI/SDI 23, CS 5, DC 21 for now, RESET 22, LED → 3.3 V, VCC 3.3 V, GND.
**Tested 2026-10-04:** DC on 19 leaves the screen black (onboard KEY3 sits on 19); DC on 21
works. 21 also switches the speaker amp, so before audio is added, move DC to **GPIO 4**
(wire and `#define TFT_DC 4`).

**Libraries:** install **Adafruit ST7735 and ST7789 Library** from the Library Manager (it
asks to install Adafruit GFX too: say yes). NimBLE-Arduino as before.

1. Flash `pet_display_test/pet_display_test.ino`. The screen shows "PiF Pet · waiting...".
2. Open the web app in Chrome (laptop: http://localhost:5173; phone: `npm run dev:phone`), tap
   **Pair a pet** → **PiF Pet**. The screen says "connected".
3. In **Test the pet**, switch on **Show my location on the pet**. Allow location. Your
   coordinates and accuracy appear on the screen, updating about once a second.
4. Tap Play on a story: the place and title replace the coordinates, with a progress bar.

Checked to compile with NimBLE-Arduino 2.5.1, Adafruit ST7735 and ST7789 Library, ESP32 core 3.3.12.

## Step 2: Story player (Bluetooth + display + SD audio)

`pet_story_player/pet_story_player.ino` plays `/stories/<story id>.wav` from the SD card when
the app sends a story, shows place, title and a progress bar, and reports playback to the
app. Missing file → the app plays it on the phone.

**Pick the display** at the top of the sketch: `#define PET_SCREEN_OLED 0` for the ST7789 TFT
(primary), `1` for the 1.3" SH1106 OLED (test). All display code is in `pet_screen.h`.

- **TFT wiring:** SCK 18, SDI 23, CS 5, **DC 4** (move it off 21: 21 is the speaker amp
  switch), RESET 22, LED + VCC 3.3 V, GND.
- **OLED wiring:** SDA 33, SCL 32 (shared with the codec, no extra pins), VCC 3.3 V, GND.
  Run `oled_check/` first: its I2C scan should list 0x10 (codec) and 0x3C (OLED).
- **SD card:** FAT32, DIP switches DATA3 and CMD ON, files in `/stories/` named like the
  MP3s but `.wav` (e.g. `/stories/mahim-causeway-01.wav`), 16-bit PCM. Mono 22050 Hz is
  plenty for speech and keeps files small.
- **Partition Scheme:** Huge APP. **Libraries:** NimBLE-Arduino, arduino-audio-tools,
  arduino-audio-driver, plus Adafruit ST7789 (TFT) or U8g2 (OLED).

**Test without the app:** Serial Monitor (Newline): `ls` lists the card, `play mahim-causeway-01`
plays it, `pause` / `resume` / `stop`, `vol 0.9`.

**Test with the app:** pair, then tap Play in **Test the pet**: the story plays on the pet's
speaker and the app shows "on the pet". Turn on **Show my location on the pet** to see GPS on
the screen at the same time.
