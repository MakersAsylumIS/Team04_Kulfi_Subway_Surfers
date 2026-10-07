# Licences

This repository uses three licences, one for each kind of work, as set by the Play it Forward
residency (Kulfi Collective × Makers Asylum).

| What | Licence | Covers |
|---|---|---|
| **Software** | [MIT](#mit-licence) | Everything in `Code/`: the web app, the pet's firmware, the lab and media tools, the scripts |
| **Hardware** | [CERN-OHL-S-2.0](https://spdx.org/licenses/CERN-OHL-S-2.0.html) (strongly reciprocal) | `Electronics/` and `CAD/`: wiring, pin maps, circuit and mechanical designs |
| **Documentation and media** | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `Documentation/`, every `.md` file, `Photos_Videos/`, the pet's face artwork, the team's animation and story texts |

Third-party parts are **not** covered by these licences and keep their own: see
[Third-party notices](#third-party-notices) below.

---

## MIT licence

Copyright (c) 2026 Team Subway Surfers, Play it Forward Cohort 06 (Kulfi Collective × Makers Asylum)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## CERN Open Hardware Licence v2, strongly reciprocal

Hardware designs in this repository are licensed under the CERN-OHL-S v2. You may redistribute
and modify them under its terms; if you make and distribute products from modified designs,
you must make the modified source available under the same licence. Full text:
<https://ohwr.org/cern_ohl_s_v2.txt>. This hardware is provided without warranty.

## Creative Commons Attribution 4.0

Documentation and media are licensed under CC BY 4.0: share and adapt them for any purpose,
including commercially, as long as you give credit ("Jam by Team Subway Surfers, Play it Forward,
Kulfi Collective × Makers Asylum"), link to the licence, and say if you changed anything.
Full text: <https://creativecommons.org/licenses/by/4.0/legalcode>.

---

## Third-party notices

### Included in this repository

| What | Where | Source and licence |
|---|---|---|
| FreeSans / FreeSansBold bitmap fonts | `Code/pif-webapp/src/lab/gfxFonts.json` (converted by `scripts/convert-gfx-fonts.mjs`) | From the [Adafruit GFX Library](https://github.com/adafruit/Adafruit-GFX-Library) (BSD licence), converted from [GNU FreeFont](https://www.gnu.org/software/freefont/) (GPLv3 or later, with the font exception). Used so the lab draws text exactly as the pet does. |

### Used, not included (installed separately)

Web app (npm, see `package.json`): React (MIT), Leaflet (BSD-2-Clause), Vite (MIT), Tailwind
CSS (MIT), vite-plugin-pwa (MIT), oxlint (MIT), TypeScript (Apache-2.0).

Map tiles and data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
under the Open Database Licence; the attribution is shown on the map.

Pet firmware (Arduino libraries):

| Library | Licence (check the library for the current terms) |
|---|---|
| [arduino-audio-tools](https://github.com/pschatzmann/arduino-audio-tools), [arduino-audio-driver](https://github.com/pschatzmann/arduino-audio-driver) (Phil Schatzmann) | GPL-3.0 |
| [NimBLE-Arduino](https://github.com/h2zero/NimBLE-Arduino) | Apache-2.0 |
| [Adafruit GFX](https://github.com/adafruit/Adafruit-GFX-Library), [Adafruit ST7735 and ST7789](https://github.com/adafruit/Adafruit-ST7735-Library) | BSD / MIT |
| [JPEGDEC](https://github.com/bitbank2/JPEGDEC) (Larry Bank) | Apache-2.0 |
| [U8g2](https://github.com/olikraus/u8g2) (OLED test build only) | BSD-2-Clause |
| [ESP32 Arduino core](https://github.com/espressif/arduino-esp32) | LGPL-2.1 / Apache-2.0 |

Our firmware source is MIT. Note that a compiled firmware binary links the GPL-3.0 audio
libraries, so **distributing a built binary** carries GPL-3.0 obligations (offer the
corresponding source). Sharing the source, as this repository does, is unaffected.

### Left out of this repository

Some files the team used while building are **not** published, because we don't hold the
rights to share them or they are placeholders: the placeholder story recordings, a stock
illustration used to try a startup animation, and one test video. The code runs without them;
see `Code/pif-webapp/README.md`, "Not in the public repository".
