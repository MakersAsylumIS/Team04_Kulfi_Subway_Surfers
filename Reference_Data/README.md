# Reference data

Datasheets, libraries, specifications and guides we relied on. What we verified on our own board
(and where online advice was wrong for it) is in
[Code/pif-webapp/HARDWARE.md](../Code/pif-webapp/HARDWARE.md).

## Hardware

| What | Link | Notes |
|---|---|---|
| ESP32 datasheet (Espressif) | <https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf> | Strapping pins (GPIO 0, 2, 5, 12, 15), RTC pins for wake-up, ADC and touch pins |
| ESP32 Arduino core | <https://github.com/espressif/arduino-esp32> | Board package; we use 3.3.x |
| ESP32-A1S Audio Kit pin definitions | the `AudioKitEs8388V1` board in [arduino-audio-driver](https://github.com/pschatzmann/arduino-audio-driver) | Several revisions of this board exist with different pins; V1 is ours |

## Firmware libraries

| Library | Link | Used for |
|---|---|---|
| arduino-audio-tools | <https://github.com/pschatzmann/arduino-audio-tools> | Audio streams, WAV decoding |
| arduino-audio-driver | <https://github.com/pschatzmann/arduino-audio-driver> | The ES8388 codec, board pins, keys |
| NimBLE-Arduino | <https://github.com/h2zero/NimBLE-Arduino> | Bluetooth LE peripheral |
| Adafruit GFX | <https://github.com/adafruit/Adafruit-GFX-Library> | Drawing and the FreeSans fonts |
| Adafruit ST7735 and ST7789 | <https://github.com/adafruit/Adafruit-ST7735-Library> | The TFT |
| JPEGDEC | <https://github.com/bitbank2/JPEGDEC> | Decoding MJPEG video frames |
| U8g2 | <https://github.com/olikraus/u8g2> | The OLED test screen |

## Web platform

| Specification | Link | Why it matters here |
|---|---|---|
| Web Bluetooth | <https://webbluetoothcg.github.io/web-bluetooth/> | Pairing the pet; not on iOS, so the pet is optional |
| Web Serial | <https://wicg.github.io/serial/> | The pet screen lab and media dashboard (desktop Chrome/Edge) |
| Screen Wake Lock | <https://www.w3.org/TR/screen-wake-lock/> | Keeping the screen on during a journey |
| Geolocation | <https://www.w3.org/TR/geolocation/> | `watchPosition`; no background location on the web |
| Leaflet | <https://leafletjs.com> | The map |
| OpenStreetMap | <https://www.openstreetmap.org/copyright> | Map tiles and data (attribution required) |

## Tools

| Tool | Link | Used for |
|---|---|---|
| ffmpeg | <https://ffmpeg.org> | Converting audio (MP3 → WAV) and video (→ MJPEG) for the pet |
| nRF Connect (mobile) | Nordic Semiconductor, on the app stores | Testing the pet's Bluetooth service before the browser |
