// The pet's screen, for either display:
//   - ST7789 2.4" colour TFT on SPI (the primary display), or
//   - SH1106 1.3" 128x64 OLED on I2C (the test display),
// chosen by PET_SCREEN_OLED at the top of pet_story_player.ino. The sketch only calls
// screenBegin() and screenDraw(); everything display-specific lives here.

#pragma once
#include <Arduino.h>

struct ScreenModel {
  bool connected;
  String place;
  String title;
  uint8_t state;      // PlaybackState from the protocol
  uint16_t positionS;
  uint32_t durationS;
};

// Which parts changed, so the TFT can redraw only those (big redraws cause audio clicks).
enum ScreenPart : uint8_t { PART_STATUS = 1, PART_TEXT = 2, PART_PROGRESS = 4 };

#if PET_SCREEN_OLED
// ======================= SH1106 OLED (I2C, test display) =======================
// Wiring: VCC 3.3 V, GND, SDA -> IO18, SCL -> IO23. The codec's own I2C pins (32/33) aren't
// on this board's headers, so the OLED gets the ESP32's second I2C bus on two header pins
// the TFT would otherwise use. Library: U8g2.
#define OLED_SDA 18
#define OLED_SCL 23
#include <Wire.h>
#include <U8g2lib.h>

// 2ND_HW_I2C = Wire1, leaving Wire (pins 33/32) to the codec.
U8G2_SH1106_128X64_NONAME_F_2ND_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

void screenBegin() {
  // Called after the audio board starts, which sets 18/23 up as onboard-key inputs;
  // starting Wire1 here takes them over as I2C.
  Wire1.begin(OLED_SDA, OLED_SCL);
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

#else
// ======================= ST7789 TFT (SPI, primary display) =======================
// Wiring: SCK 18, SDI/MOSI 23, CS 5, DC 4, RESET 22, LED 3.3 V, VCC 3.3 V, GND.
// DC moved from 21 (the speaker amp switch); 19 doesn't work (onboard KEY3).
// Library: Adafruit ST7735 and ST7789 Library (+ Adafruit GFX).
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

#define TFT_CS   5
#define TFT_DC   4
#define TFT_RST  22
#define TFT_MOSI 23
#define TFT_CLK  18
#define INK    0xFFFF
#define DIM    0x8410
#define ACCENT 0x079B

// The SD card owns the default SPI bus (set up by the audio board driver), so the
// display gets the ESP32's other SPI peripheral.
SPIClass displaySPI(HSPI);
Adafruit_ST7789 tft = Adafruit_ST7789(&displaySPI, TFT_CS, TFT_DC, TFT_RST);

void screenBegin() {
  displaySPI.begin(TFT_CLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 320);
  tft.setRotation(3);
  tft.fillScreen(0x0000);
}

static int tftWrapped(const String& text, int x, int y, int width, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int charW = 6 * size, lineH = 8 * size + 4, perLine = width / charW, start = 0;
  while (start < (int)text.length() && y < 210) {
    int end = min((int)text.length(), start + perLine);
    if (end < (int)text.length()) {
      int space = text.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    tft.setCursor(x, y);
    tft.print(text.substring(start, end));
    y += lineH;
    start = end;
    while (start < (int)text.length() && text[start] == ' ') start++;
  }
  return y;
}

void screenDraw(const ScreenModel& m, uint8_t parts) {
  if (parts & PART_STATUS) {
    tft.fillRect(0, 0, 320, 30, 0x0000);
    tft.setTextSize(2);
    tft.setTextColor(ACCENT);
    tft.setCursor(10, 8);
    tft.print("PiF Pet");
    tft.setTextColor(m.connected ? INK : DIM);
    tft.setCursor(200, 8);
    tft.print(m.connected ? "connected" : "waiting...");
  }
  if (parts & PART_TEXT) {
    tft.fillRect(0, 34, 320, 178, 0x0000);
    if (m.place.length() == 0) {
      tftWrapped("Waiting for the app.", 10, 100, 300, 2, DIM);
    } else {
      uint8_t size = m.place.length() * 18 <= 300 ? 3 : 2;
      int y = tftWrapped(m.place, 10, 50, 300, size, INK);
      tftWrapped(m.title, 10, y + 10, 300, 2, DIM);
    }
  }
  if (parts & PART_PROGRESS) {
    tft.fillRect(0, 214, 320, 26, 0x0000);
    if (m.state == 1 || m.state == 2) {
      int w = m.durationS ? (int)(300L * m.positionS / m.durationS) : 0;
      tft.drawRect(10, 220, 300, 12, DIM);
      tft.fillRect(10, 220, min(w, 300), 12, m.state == 2 ? DIM : ACCENT);
    } else if (m.state == 3) {
      tft.setTextSize(1);
      tft.setTextColor(DIM);
      tft.setCursor(10, 222);
      tft.print("not on the SD card - playing on the phone");
    }
  }
}
#endif
