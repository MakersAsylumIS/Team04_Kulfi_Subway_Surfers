# Troubleshooting

Every problem we hit, by symptom. Find the row that matches what you see; the fix is on the
right. How we found each one: [engineering log](ENGINEERING-LOG.md). Board details:
[HARDWARE.md](../Code/pif-webapp/HARDWARE.md). Wiring: [Electronics](../Electronics/README.md).

First, the two things that solve the most:

1. **Open the Serial Monitor at 921600 baud, line ending Newline, press RST**, and read what the
   pet says. Type `help` for the commands, `ls` for the SD card, `s` for status.
2. **Change one thing at a time.**

---

## Connecting the board to the computer

| Symptom | Cause | Fix |
|---|---|---|
| Board lights up, **no COM port ever appears** | Charge-only USB cable | A cable that has synced a phone. Test: plug/unplug with Device Manager open; if nothing flickers, there's no data link |
| Device under *Other devices*, **Code 28** | CP210x driver missing | Silicon Labs CP210x VCP driver, or Windows Update → Optional updates → Driver updates |
| "Ports (COM & LPT)" missing from Device Manager | Windows hides it when no serial device exists | Same as the first row: it's the cable or the driver |
| `Could not open COM4, the port is busy` / `Access is denied` | Something else holds the port: the Serial Monitor, the lab, the media page | Close the other one (the X on the Serial Monitor tab, not just switching away) |

## Uploading

| Symptom | Cause | Fix |
|---|---|---|
| `Timed out waiting for packet header` | GPIO 0 is the codec clock *and* the boot pin, so auto-reset is unreliable | Hold **BOOT**, start the upload, release when "Connecting…" turns into writing; or upload at 115200 |
| Sketch too big | Default partition | Partition Scheme **Huge APP** |
| `JPEGDEC.h: No such file` | Library missing | Library Manager → JPEGDEC by Larry Bank |
| Arduino IDE shows odd errors or won't compile after a crash | Its background helper process died | Close and reopen the IDE |

## Starting up

| Symptom | Cause | Fix |
|---|---|---|
| Boot log ends at `entry 0x400805b4`, then silence | PSRAM on with the **ESP32 Dev Module** profile | Board **ESP32 Wrover Module** |
| A line of garbage before "PiF pet story player" | The chip's own startup text is at 115200; the sketch talks at 921600 | Normal; ignore it |
| `gpio_pullup_en … input-only pad has no internal PU` | The audio driver tries a pull-up on pins 36/39 | Harmless |
| Board won't start with the volume button fitted | GPIO 12 was high at power-on (it sets the flash voltage) | Button between MTDI and **3.3 V**, not ground; don't hold it while powering on |
| Serial printed once, then nothing | The sketch only prints in `setup()` and the monitor attached late | Press RST with the monitor open |

## Sound

| Symptom | Cause | Fix |
|---|---|---|
| Log looks healthy (`StreamCopy 1024 -> 1024`), **total silence** | Wrong board variant **and/or** no volume set | `AudioKitEs8388V1` (not V2) **and** `setVolume()` after `begin()`: both |
| Silence from the speaker, earphones work | Something in the jack mutes the speaker; or the amp was switched off | Unplug the jack; type `+` (re-enables the amp) |
| Speaker quiet | Volume 0.7 is about −10 dB | `vol 0.9` |
| Speaker distorts | 1.0 is +4.5 dB | `vol 0.9` (0 dB) |
| `Not a WAV file` | An MP3 renamed to `.wav` | Convert: `ffmpeg -i in.mp3 -ac 1 -ar 22050 -c:a pcm_s16le out.wav` |
| WAV plays for one bar, or shows "0 s" | 24-bit or 32-bit float, or extra chunks from an audio editor | Convert with the command above (16-bit PCM) |
| `No file /stories/<id>.wav -> missing file` | File not on the card, wrong name, or a stale mount after reseating the card | Check with `ls`; the name must equal the story id; press RST after swapping cards |

## Screen

| Symptom | Cause | Fix |
|---|---|---|
| Screen stays black | Wiring, or DC on GPIO 19 (wired to KEY3) | Check against [WIRING.md](../Code/pif-webapp/firmware/WIRING.md); DC on 22 |
| Screen goes white | One corrupted command | Type `screen`; the firmware also re-initialises it per story |
| Colours look like a negative (black is white, cyan is red) | Colour inversion setting | Flip `invertDisplay()` in `pet_screen.h` |
| Picture sideways or upside down | Rotation | `media rotate 0`–`3` for videos; `rotation=` in the video's `.cfg` |
| OLED test screen black | Second I2C bus mode compiled out on ESP32 | Use our `pet_screen.h` (custom driver); OLED on 18/23 |

## SD card

| Symptom | Cause | Fix |
|---|---|---|
| `SD card FAILED to mount` / `No SD card answered at any speed` | No card, not pushed in, wrong DIP switches | Push until it clicks; DIP **1 OFF, 2 ON, 3 ON, 4 OFF, 5 OFF**; FAT32 |
| Mounts, but folders "missing" | Reads garbled: something else on the card's lines (display wires once) | Nothing else on GPIO 13, 14, 15; the firmware also steps its speed down |

## Bluetooth (app ↔ pet)

| Symptom | Cause | Fix |
|---|---|---|
| No pairing button in the app | iPhone, or a browser without Web Bluetooth | Chrome on Android or a computer |
| `GATT Server is disconnected. Cannot retrieve services` | The link dropped just after connecting | Built in now: pairing retries and reconnects by itself; reload the app if it persists |
| Story plays on the phone instead of the pet | The pet doesn't have that WAV | Copy `<id>.wav` into `stories/` on the card |

## The lab (`/lab`) and media page (`/media`)

| Symptom | Cause | Fix |
|---|---|---|
| "That port is busy" | Serial Monitor (or another tab) open | Close it |
| "Nothing at all came from that port" | A Bluetooth serial port was picked | Pick the board's USB port (the one the Arduino IDE uses; CP210x / CH340) |
| "Only unreadable bytes came from the pet" | The board is stuck after the restart | Unplug the USB, plug it back in, connect again; press RST when asked |
| "The pet is talking but didn't answer" / `Unknown command` | Old firmware on the pet | Upload the latest `pet_story_player` |
| "The pet stopped answering" on the media page | Old firmware (no `media` commands), or no SD card | Upload the latest; insert the card |
| Live mirror paints top to bottom, slowly | USB serial is ~90 KB/s; a full colour frame is 150 KB | Use **Clip: play on the pet** or `/media` for anything that moves |
| Clip or video is choppy | Played slower than it was made, or frames too large to keep up | Match fps to the video ("Real speed"); read the "On the pet" / `MEDIASTAT` line: if frames are skipped, lower fps or width |
| Sound and picture out of step | Codec buffer delay | Sound sync / `media offset <ms>`; check with `media play sync-test` |
| "Too big" for a clip or video | PSRAM holds about 3.5 MB | Shorter, narrower, fewer frames per second, or lower quality |
| "No sound found in …" | The video has no audio track | Use **Sound from another file** |
