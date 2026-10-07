// The pet's screen, for either display:
//   - ST7789 2.4" colour TFT on SPI (the primary display), or
//   - SH1106 1.3" 128x64 OLED on I2C (the test display),
// chosen by PET_SCREEN_OLED at the top of pet_story_player.ino. The sketch only calls
// screenBegin(), screenDraw() and screenSleep(); everything display-specific lives here.
// The TFT shows the pet's face (faces.h, generated from the PNGs) with a caption under it;
// the OLED is a text-only test display.

#pragma once
#include <Arduino.h>
#include "faces.h"

struct ScreenModel {
  bool connected;
  String place;
  String title;
  uint8_t state;      // PlaybackState from the protocol
  uint16_t positionS;
  uint32_t durationS;
  const uint8_t* face;  // current face frame (faces.h), or nullptr
};

// Which parts changed, so the TFT can redraw only those (big redraws cause audio clicks).
enum ScreenPart : uint8_t { PART_STATUS = 1, PART_TEXT = 2, PART_PROGRESS = 4, PART_FACE = 8 };
#define PART_ALL (PART_STATUS | PART_TEXT | PART_PROGRESS | PART_FACE)

#if PET_SCREEN_OLED
// ======================= SH1106 OLED (I2C, test display) =======================
// Wiring: VCC 3.3 V, GND, SDA -> IO18, SCL -> IO23. The codec's own I2C pins (32/33) aren't
// on this board's headers, so the OLED gets the ESP32's second I2C bus on two header pins
// the TFT would otherwise use. Library: U8g2.
#define OLED_SDA 18
#define OLED_SCL 23
#include <Wire.h>
#include <U8g2lib.h>

// U8g2's own "2ND_HW_I2C" mode is compiled out on ESP32 (it checks WIRE_INTERFACES_COUNT,
// which the ESP32 core doesn't define), so this small byte driver sends to Wire1 itself,
// leaving Wire (pins 33/32) to the codec.
static uint8_t oledByteWire1(u8x8_t* u8x8, uint8_t msg, uint8_t argInt, void* argPtr) {
  switch (msg) {
    case U8X8_MSG_BYTE_INIT:
    case U8X8_MSG_BYTE_SET_DC:
      break;  // Wire1 is started in screenBegin()
    case U8X8_MSG_BYTE_START_TRANSFER:
      Wire1.beginTransmission(u8x8_GetI2CAddress(u8x8) >> 1);
      break;
    case U8X8_MSG_BYTE_SEND:
      Wire1.write((const uint8_t*)argPtr, argInt);
      break;
    case U8X8_MSG_BYTE_END_TRANSFER:
      Wire1.endTransmission();
      break;
    default:
      return 0;
  }
  return 1;
}

class OledOnWire1 : public U8G2 {
 public:
  OledOnWire1() {
    u8g2_Setup_sh1106_i2c_128x64_noname_f(&u8g2, U8G2_R0, oledByteWire1, u8x8_gpio_and_delay_arduino);
  }
};

OledOnWire1 oled;

void screenBegin() {
  // Called after the audio board starts, which sets 18/23 up as onboard-key inputs;
  // starting Wire1 here takes them over as I2C.
  Wire1.begin(OLED_SDA, OLED_SCL, 400000);
  oled.begin();
  oled.setFont(u8g2_font_6x10_tf);
}

// Prints text wrapped at spaces, up to maxLines lines of 21 characters; returns next y.
static int oledWrapped(const String& text, int y, int maxLines, int lineH) {
  int start = 0, lines = 0;
  const int perLine = 21;
  while (start < (int)text.length() && lines < maxLines) {
    int end = min((int)text.length(), start + perLine);
    if (end < (int)text.length()) {
      int space = text.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    oled.drawStr(0, y, text.substring(start, end).c_str());
    y += lineH;
    lines++;
    start = end;
    while (start < (int)text.length() && text[start] == ' ') start++;
  }
  return y;
}

void screenDraw(const ScreenModel& m, uint8_t) {
  // 128x64 is small enough to redraw whole: about 1 KB over I2C.
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 9, "PiF Pet");
  oled.drawStr(m.connected ? 74 : 68, 9, m.connected ? "connected" : "waiting..");
  oled.drawHLine(0, 12, 128);
  if (m.place.length() == 0) {
    oled.drawStr(0, 36, "Waiting for the app.");
  } else {
    int y = oledWrapped(m.place, 25, 2, 11);
    oledWrapped(m.title, y + 1, 2, 10);
  }
  if (m.state == 1 || m.state == 2) {  // playing or paused
    int w = m.durationS ? (int)(126L * m.positionS / m.durationS) : 0;
    oled.drawFrame(0, 57, 128, 7);
    oled.drawBox(1, 58, min(w, 126), 5);
  } else if (m.state == 3) {
    oled.drawStr(0, 63, "not on SD: phone plays");
  }
  oled.sendBuffer();
}

void screenSleep(bool sleep) { oled.setPowerSave(sleep ? 1 : 0); }
void screenRedrawAll() {}
bool screenLabFrame() {  // the lab needs the colour TFT
  Serial.println("LABERR the lab needs the TFT build");
  return false;
}
void screenLabEnd() {}

#else
// ======================= ST7789 TFT (SPI, primary display) =======================
// Wiring: SCK 18, SDI/MOSI 23, CS 5, DC 22, RESET -> 3.3 V, LED 3.3 V, VCC 3.3 V, GND.
// The header only offers 21, 22, 19, 23, 18 (+ IO0, TX, RX): 21 is the speaker amp switch and
// 19 doesn't work (onboard KEY3), so DC takes 22 (the onboard LED pin; it just flickers) and
// RESET is tied high, with the library resetting the screen in software instead.
// Library: Adafruit ST7735 and ST7789 Library (+ Adafruit GFX).
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>

// The display has its own SPI bus: clock 18, data 23, CS 5, DC 22. RESET goes to the
// board's EN/RST pin, so the screen resets with the board. (It shared the SD card's bus on
// MTMS/MTDO for a day, 2026-10-05: the extra wiring on the card's lines made the card
// unreadable, so it's back on its own pins. 18 and 23 were onboard KEY5 and KEY4.)
#define TFT_SCK  18
#define TFT_MOSI 23
#define TFT_CS   5
#define TFT_DC   22
#define TFT_RST  -1
#define INK    0xFFFF
#define DIM    0x8410
#define ACCENT 0x079B

// HSPI here, because the SD card already uses the default SPI object (on 14, 2, 15).
SPIClass tftSpi(HSPI);
Adafruit_ST7789 tft = Adafruit_ST7789(&tftSpi, TFT_CS, TFT_DC, TFT_RST);

void screenBegin() {
  tftSpi.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  // 20 MHz instead of the library's faster default: jumper wires pick up noise, and one
  // corrupted command can blank the screen (it goes white).
  tft.setSPISpeed(20000000);
  tft.init(240, 320);
  // The library switches colour inversion on (most ST7789 panels need it); ours doesn't,
  // and with it on, black shows white and cyan shows red.
  tft.invertDisplay(false);
  tft.setRotation(3);
  tft.fillScreen(0x0000);
}

// Two screens, landscape 320x240:
//
//   Pet (between stories): the face, 198x155 at the top, and under it two centred lines,
//   the place (white) and a status or the title (grey). Mood comes from the sketch.
//
//   Story (while a story plays or is paused): no face. "NOW PLAYING" in cyan, the place
//   large, the title under it, then a progress bar with elapsed and total time.
//
// A cyan dot in the top-right corner shows the phone is connected.
#define FACE_X ((320 - FACE_W) / 2)
#define FACE_Y 4
#define TRACK  0x2104  // the empty part of the progress bar

static void drawFace(const uint8_t* frame) {
  // Rows of run lengths: dark, lit, dark, lit … (see faces.h)
  // Drawn in slices of 16 rows: the bus is shared with the SD card, and letting go between
  // slices lets the audio task keep reading the story so it doesn't click.
  const uint8_t* p = frame;
  tft.startWrite();
  for (int y = 0; y < FACE_H; y++) {
    if (y && y % 16 == 0) {
      tft.endWrite();
      tft.startWrite();
    }
    int x = 0;
    bool lit = false;
    while (x < FACE_W) {
      uint8_t len = pgm_read_byte(p++);
      if (len) tft.writeFastHLine(FACE_X + x, FACE_Y + y, len, lit ? ACCENT : 0x0000);
      x += len;
      lit = !lit;
    }
  }
  tft.endWrite();
}

static int textWidth(const String& t) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(t, 0, 0, &x1, &y1, &w, &h);
  return w;
}

// Cuts a line to fit a width, ending in "..." when it had to be cut.
static String fitLine(String t, int maxW) {
  if (textWidth(t) <= maxW) return t;
  while (t.length() > 1 && textWidth(t + "...") > maxW) t.remove(t.length() - 1);
  return t + "...";
}

static void centred(const GFXfont* font, const String& t, int baseline, uint16_t color) {
  tft.setFont(font);
  tft.setTextColor(color);
  String line = fitLine(t, 300);
  tft.setCursor((320 - textWidth(line)) / 2, baseline);
  tft.print(line);
}

// Word-wraps text into at most maxLines lines from (x, baseline); returns the next baseline.
static int wrapped(const GFXfont* font, const String& text, int x, int baseline, int maxW, int lineH,
                   int maxLines, uint16_t color) {
  tft.setFont(font);
  tft.setTextColor(color);
  int start = 0, lines = 0;
  while (start < (int)text.length() && lines < maxLines) {
    // Take as many words as fit.
    int end = start, best = -1;
    while (end <= (int)text.length()) {
      int next = text.indexOf(' ', end);
      if (next < 0) next = text.length();
      if (textWidth(text.substring(start, next)) > maxW) break;
      best = next;
      if (next >= (int)text.length()) break;
      end = next + 1;
    }
    if (best < 0) best = text.indexOf(' ', start) < 0 ? text.length() : text.indexOf(' ', start);
    String line = text.substring(start, best);
    bool last = lines == maxLines - 1 && best < (int)text.length();
    tft.setCursor(x, baseline);
    tft.print(last ? fitLine(line + " " + text.substring(best + 1), maxW) : fitLine(line, maxW));
    baseline += lineH;
    lines++;
    start = best + 1;
  }
  return baseline;
}

static String clock(uint32_t s) {
  char buf[8];
  snprintf(buf, sizeof(buf), "%u:%02u", (unsigned)(s / 60), (unsigned)(s % 60));
  return String(buf);
}

static int lastStory = -1;  // -1: next draw clears the screen and draws everything

void screenRedrawAll() { lastStory = -1; }

void screenDraw(const ScreenModel& m, uint8_t parts) {
  bool story = m.state == 1 || m.state == 2;  // playing or paused
  if ((int)story != lastStory) {
    lastStory = story;
    tft.fillScreen(0x0000);
    parts = PART_ALL;
  }

  if (parts & PART_STATUS) tft.fillCircle(308, 10, 4, m.connected ? ACCENT : DIM);

  if (story) {
    if (parts & (PART_TEXT | PART_PROGRESS)) {
      tft.fillRect(0, 4, 296, 22, 0x0000);
      tft.setFont(&FreeSansBold9pt7b);
      tft.setTextColor(m.state == 2 ? DIM : ACCENT);
      tft.setCursor(20, 22);
      tft.print(m.state == 2 ? "PAUSED" : "NOW PLAYING");
    }
    if (parts & PART_TEXT) {
      tft.fillRect(0, 30, 320, 160, 0x0000);
      int next = wrapped(&FreeSansBold18pt7b, m.place, 20, 66, 280, 34, 2, INK);
      wrapped(&FreeSans12pt7b, m.title, 20, next + 4, 280, 24, 3, DIM);
    }
    if (parts & PART_PROGRESS) {
      int w = m.durationS ? (int)(280L * m.positionS / m.durationS) : 0;
      tft.fillRect(20, 196, 280, 6, TRACK);
      tft.fillRect(20, 196, min(w, 280), 6, m.state == 2 ? DIM : ACCENT);
      tft.fillRect(0, 208, 320, 32, 0x0000);
      tft.setFont(&FreeSans9pt7b);
      tft.setTextColor(DIM);
      tft.setCursor(20, 226);
      tft.print(clock(m.positionS));
      String total = clock(m.durationS);
      tft.setCursor(300 - textWidth(total), 226);
      tft.print(total);
    }
  } else {
    if (parts & PART_FACE) {
      if (m.face) drawFace(m.face);
      else tft.fillRect(FACE_X, FACE_Y, FACE_W, FACE_H, 0x0000);
    }
    if (parts & (PART_TEXT | PART_PROGRESS)) {
      tft.fillRect(0, FACE_Y + FACE_H + 2, 320, 240 - (FACE_Y + FACE_H + 2), 0x0000);
      if (m.place.length() == 0) {
        centred(&FreeSans12pt7b, m.connected ? "Connected" : "Waiting for your phone", 196, DIM);
      } else {
        centred(&FreeSansBold12pt7b, m.place, 190, INK);
        String line2 = m.state == 3 ? String("Not on the SD card: the phone plays it") : m.title;
        if (line2.length()) centred(&FreeSans9pt7b, line2, 216, DIM);
      }
    }
  }
  tft.setFont(nullptr);
}

// ---------- Lab mode: the pet screen lab (/lab) draws on this screen over USB ----------
// The lab sends a frame as "PIFL" and a binary body; the sketch sees the "PIFL" and calls
// screenLabFrame() to read the rest. All numbers little-endian:
//   u8 rotation (0-3), u8 flags (bit 0: clear the screen first), u16 span count, then per span:
//   u16 x, u16 y, u16 width, u8 mode (0 raw, 1 run-length), u16 byte count, the bytes.
//   raw: width colours as u16 RGB565.  run-length: (u8 count, u16 colour) pairs.
// Spans are pieces of rows that changed since the last frame, so small changes are quick.
// The pet answers "LABOK" after each frame and the lab waits for it before sending the next,
// so the serial buffer never overflows.
#define LAB_MAX_W 320

static bool readExact(uint8_t* buf, size_t n) { return Serial.readBytes(buf, n) == n; }
static uint16_t u16le(const uint8_t* b) { return b[0] | (b[1] << 8); }

bool screenLabFrame() {
  static uint8_t buf[LAB_MAX_W * 3];
  static uint16_t line[LAB_MAX_W];
  Serial.setTimeout(1000);
  uint8_t head[4];
  if (!readExact(head, 4)) { Serial.println("LABERR header"); return false; }
  if (tft.getRotation() != (head[0] & 3)) {
    tft.setRotation(head[0] & 3);
    tft.fillScreen(0x0000);
  }
  if (head[1] & 1) tft.fillScreen(0x0000);
  uint16_t spans = u16le(head + 2);
  for (uint16_t i = 0; i < spans; i++) {
    uint8_t sh[9];
    if (!readExact(sh, 9)) { Serial.println("LABERR span"); return false; }
    uint16_t x = u16le(sh), y = u16le(sh + 2), w = u16le(sh + 4), len = u16le(sh + 7);
    uint8_t mode = sh[6];
    if (w == 0 || w > LAB_MAX_W || len > sizeof(buf) || !readExact(buf, len)) {
      Serial.println("LABERR data");
      return false;
    }
    if (mode == 0) {
      for (uint16_t k = 0; k < w && k * 2 + 1 < len; k++) line[k] = u16le(buf + k * 2);
    } else {
      uint16_t k = 0;
      for (uint16_t j = 0; j + 2 < len && k < w; j += 3)
        for (uint8_t c = 0; c < buf[j] && k < w; c++) line[k++] = u16le(buf + j + 1);
    }
    tft.startWrite();
    tft.setAddrWindow(x, y, w, 1);
    tft.writePixels(line, w);
    tft.endWrite();
  }
  Serial.println("LABOK");
  return true;
}

// Back to the pet's own screens.
void screenLabEnd() {
  tft.setRotation(3);
  tft.fillScreen(0x0000);
  lastStory = -1;
}

// Screen off (after long idle) and back on. The backlight is wired straight to 3.3 V, so
// "off" is the panel's own sleep mode plus a black screen.
void screenSleep(bool sleep) {
  if (sleep) {
    tft.fillScreen(0x0000);
    tft.enableSleep(true);
  } else {
    tft.enableSleep(false);
  }
}
#endif
