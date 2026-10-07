# Pet wiring: what goes where

ESP32-A1S Audio Kit v2.2 running `pet_story_player`. Last checked on the board: 2026-10-06.

## Display: 2.4" ST7789 TFT (240x320)

| Display pin | Board pin | GPIO | Notes |
|---|---|---|---|
| VCC | 3.3 V | | |
| GND | GND | | |
| LED | 3.3 V | | backlight, always on |
| SCK | IO18 | 18 | own SPI bus (HSPI) |
| SDI / MOSI | IO23 | 23 | |
| CS | IO5 | 5 | |
| DC | IO22 | 22 | also the onboard LED, which flickers: harmless |
| RESET | EN / RST | | resets with the board |
| SDO / MISO | not connected | | |

Full colour (16-bit). `pet_screen.h` sets colour inversion **off** (`tft.invertDisplay(false)`); the team's TFT Web Lab notes say this panel needs it **on**. If colours look like a negative (black shows white, cyan shows red), flip that line.

Keep the display off GPIO 13, 14 and 15 (MTCK, MTMS, MTDO). Those are the SD card's lines. Sharing them made the card unreadable (2026-10-05).

## Buttons

| Button | Where | GPIO | Wiring | Job |
|---|---|---|---|---|
| KEY1 | onboard | 36 | external button optional, across KEY1's legs | **power**: hold 2 s to sleep, press to wake |
| KEY3 | onboard | 19 | external button optional, across KEY3's legs | **story**: tap pause/play, double-tap skip, hold replay |
| MTDI | JTAG header | 12 | button between **MTDI and 3.3 V** (not GND); splice onto the display's 3.3 V | **volume**: tap up, hold down |

Don't hold MTDI while powering on or pressing RST: GPIO 12 must be LOW at startup or the board won't boot.

## Audio

| Part | Where | Notes |
|---|---|---|
| Speaker (4 Ω, 3 W) | **ROUT** + and − | polarity doesn't change the sound |
| Earphones | headphone jack | the board mutes the speaker while anything is plugged in |

Amplifier switch-on is GPIO 21, driven by the firmware. Keep 21 free.

## SD card

| Setting | Value |
|---|---|
| Slot | onboard |
| Format | FAT32 |
| Files | `/stories/<story id>.wav` (16-bit PCM, mono, 22050 Hz); `/media/<name>.mjpeg` + `.wav` + `.cfg` (videos) |
| DIP switches | **1 OFF, 2 ON, 3 ON, 4 OFF, 5 OFF** |

What the DIP switches do:

| Switch | Connects | Setting |
|---|---|---|
| 1 | GPIO 13 ↔ KEY2 | off: keeps the key off the card's CS line |
| 2 | GPIO 13 ↔ SD DATA3 (CS) | on: needed for the card |
| 3 | GPIO 15 ↔ SD CMD | on: needed for the card |
| 4 | GPIO 13 ↔ JTAG MTCK | off |
| 5 | GPIO 15 ↔ JTAG MTDO | off |

## Power

| Part | Where | Notes |
|---|---|---|
| USB | micro-USB on the board | power, plus the Serial Monitor (**921600** baud, Newline; type `help`) |
| Battery: 3.7 V 950 mAh Li-ion | the board's battery connector | **not wired yet**: put a slide switch on its + wire for a real off |

## Don't use these

| Pin | Why |
|---|---|
| KEY2 (GPIO 13) | SD card CS |
| KEY4 (23), KEY5 (18) | display data and clock |
| KEY6 (5) | display CS |
| 0, 25, 26, 27, 35 | I2S audio to the codec |
| 32, 33 | codec control (I2C); not on the headers anyway |
| 2, 14, 15 | SD card data, clock, command |
| 21 | speaker amplifier switch-on |
| 39 | headphone detect |
| RX0 / TX0 (3 / 1) | USB serial; RX0 is the only pin left, but using it stops Serial commands |

The codec and SD pin numbers come from the audio driver's pin file for this board (`AudioKitEs8388V1`). Everything else in this file was tested on the board.

## Alternative: the OLED test screen (instead of the TFT)

1.3" SH1106 128x64 I2C OLED: SDA → IO18, SCL → IO23, VCC → 3.3 V, GND. Set `#define PET_SCREEN_OLED 1` in the sketch. Unplug the TFT first, because it uses the same pins.
