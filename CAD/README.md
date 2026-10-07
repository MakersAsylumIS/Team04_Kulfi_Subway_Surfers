# CAD

Mechanical designs: the pet's enclosure.

## Built on

The enclosure is built on top of
**[ESP32 D1 Mini Snap-Together Case](https://www.printables.com/model/84791-esp32-d1-mini-snap-together-case)** by **[bkgoodman](https://www.printables.com/@bkgoodman_108348)** on Printables,
licensed **[Creative Commons Attribution-NonCommercial](https://creativecommons.org/licenses/by-nc/4.0/)** (CC BY-NC). We adapted its
snap-together design to fit the ESP32-A1S Audio Kit, the 2.4" screen and the speaker.

**Licence of the files in this folder: CC BY-NC**, because they're adapted from that model:
credit bkgoodman's original (and us for the changes), and don't use them commercially. This is
the one exception to the hardware licence (CERN-OHL-S-2.0), which covers `Electronics/`; see
[LICENSE.md](../LICENSE.md).

## The enclosure (work in progress)

A two-part shell: a base and a front.

| File | Part | Outline (as modelled, presumably mm) |
|---|---|---|
| [`base_v2.stl`](base_v2.stl) | Base (version 2) | 89.7 × 83.7 × 23.2 |
| [`front_v3.stl`](front_v3.stl) | Front (version 3) | 89.7 × 83.7 × 28.1 |

STL files are meshes for printing; GitHub previews them in the browser. The editable source
files (the CAD model they were exported from) should go here too, so others can change the
design: an STL alone is hard to modify.

## What it has to hold

| Part | Size / notes |
|---|---|
| ESP32-A1S Audio Kit v2.2 | the board, with access to USB, the SD slot, RST and the headphone jack |
| 2.4" TFT (240×320) | measure the module; held **upright** (portrait) |
| Speaker | 4 Ω 3 W, with a grille |
| Buttons | KEY1 (power) and KEY3 (story) on the board, or external ones across them; the volume button |
| Battery | 3.7 V 950 mAh Li-ion, plus a slide switch |

Pin and wiring details: [Electronics/README.md](../Electronics/README.md).
