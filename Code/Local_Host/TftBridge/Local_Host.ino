/*
  320x240 colour display "bridge" firmware for the TFT Web Lab (localhost web page).

  Upload this once. Then open the web page (start.bat) in Chrome or Edge, click
  Connect, and control the display from the browser over USB. No recompiling,
  no WiFi.

  Serial protocol: one text command per line, 460800 baud.
    PING                         -> PONG
    INFO                         -> INFO <width> <height> <rotation> <inverted>
    ROT <0-3>                    rotation (0/2 portrait 240x320, 1/3 landscape 320x240)
    INVERT <0|1>                 invert all colors (this panel needs 1); remembered
    FILL <rrggbb>                fill the screen
    TESTPAT                      color bars + gradient + border
    TEXT <family> <size> <align> <fg> <bg> <margin> <text...>
                                 family 0-3, size 0 = largest that fits or 1-7,
                                 align l|c|r, colors rrggbb, \n = line break
                                 -> OK TEXT size=<px> lines=<n>
    IMG <x> <y> <w> <h>          -> READY, then w*h*2 bytes of RGB565 (big-endian),
                                 board answers K after every 4096 bytes, then OK IMG
    IMGR <w> <h> <bytes>         -> READY, then <bytes> bytes of run-length data for a
                                 picture starting at the top left: 4 bytes per run,
                                 pixel count then RGB565 color (both big-endian).
                                 K after every 4096 bytes, then OK IMG

  Wiring (same as the working ST7789 sketch):
    CS IO5, DC IO21, RST IO22, MOSI IO23, CLK IO18

  Board:     "ESP32 Dev Module"
  Libraries: Adafruit GFX, Adafruit ST7735 and ST7789
*/

#include <Arduino.h>
#include <SPI.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans18pt7b.h>
#include <Fonts/FreeSans24pt7b.h>
#include <Fonts/FreeSerifBold9pt7b.h>
#include <Fonts/FreeSerifBold12pt7b.h>
#include <Fonts/FreeSerifBold18pt7b.h>
#include <Fonts/FreeSerifBold24pt7b.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>
#include <Fonts/FreeMonoBold24pt7b.h>

#define BAUD 460800

// SPI PIN DEFINITIONS (Unchanged)
#define TFT_CS    5
#define TFT_DC    21
#define TFT_RST   22
#define TFT_MOSI  23
#define TFT_CLK   18

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

static Preferences prefs;

static int rotation = 3;
static bool inverted = true;    // remembered between power-ups

// Font families in 4 sizes, smallest to largest.
// The index of each family is the font number used by the web page.
static const GFXfont* const FAMILIES[][4] = {
  {&FreeSansBold9pt7b,  &FreeSansBold12pt7b,  &FreeSansBold18pt7b,  &FreeSansBold24pt7b},   // 0 Sans Bold
  {&FreeSans9pt7b,      &FreeSans12pt7b,      &FreeSans18pt7b,      &FreeSans24pt7b},       // 1 Sans
  {&FreeSerifBold9pt7b, &FreeSerifBold12pt7b, &FreeSerifBold18pt7b, &FreeSerifBold24pt7b},  // 2 Serif Bold
  {&FreeMonoBold9pt7b,  &FreeMonoBold12pt7b,  &FreeMonoBold18pt7b,  &FreeMonoBold24pt7b},   // 3 Mono Bold
};
static const int N_FAMILIES = sizeof(FAMILIES) / sizeof(FAMILIES[0]);

// Text sizes 1-7: the four fonts, then the largest font enlarged 2x, 3x, 4x
static const int N_SIZES = 7;
static const uint8_t SIZE_FONT[N_SIZES]  = {0, 1, 2, 3, 3, 3, 3};
static const uint8_t SIZE_SCALE[N_SIZES] = {1, 1, 1, 1, 2, 3, 4};

// ---------------------------------------------------------------------------
// Helpers

uint16_t hexColor(const String& s) {
  uint32_t v = strtoul(s.c_str(), nullptr, 16);
  return tft.color565((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
}

// Splits off the first space-separated token of `rest`
String nextToken(String& rest) {
  rest.trim();
  int sp = rest.indexOf(' ');
  String tok = sp < 0 ? rest : rest.substring(0, sp);
  rest = sp < 0 ? "" : rest.substring(sp + 1);
  return tok;
}

// Reads the next token as a number and clamps it. Don't put nextToken() inside
// constrain(): it's a macro and would read several tokens.
long argInt(String& rest, long lo, long hi) { long v = nextToken(rest).toInt(); return v < lo ? lo : v > hi ? hi : v; }

// The ST7789 driver starts with its "inversion" mode on, which is right for most
// of these panels. Panels that then look like a photo negative need it off.
void applyInvert() {
  tft.invertDisplay(!inverted);
}

void sendInfo() {
  Serial.printf("INFO %d %d %d %d\n", tft.width(), tft.height(), rotation, inverted ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Text: wrapped lines, centered vertically, in the largest size that fits

static const int MAX_LINES = 16;
static String lines[MAX_LINES];
static int nLines = 0;
static int lineH = 0;        // of the size chosen by pickSize()

void pickSize(int family, int s) {
  const GFXfont* font = FAMILIES[family][SIZE_FONT[s]];
  tft.setFont(font);
  tft.setTextSize(SIZE_SCALE[s]);
  lineH = pgm_read_byte(&font->yAdvance) * SIZE_SCALE[s];
}

int textWidth(const String& s) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(s, 0, 0, &x1, &y1, &w, &h);
  return w;
}

// Wraps the text (current font) into lines[]; "\n" forces a new line.
// Returns false if a word is wider than maxW or there are too many lines.
bool wrapText(const String& text, int maxW) {
  nLines = 0;
  bool ok = true;
  int start = 0;
  while (start <= (int)text.length() && nLines < MAX_LINES) {
    int nl = text.indexOf("\\n", start);
    String para = nl < 0 ? text.substring(start) : text.substring(start, nl);
    start = nl < 0 ? text.length() + 1 : nl + 2;

    String line = "";
    int i = 0, len = para.length();
    while (i < len) {
      while (i < len && para[i] == ' ') i++;
      int j = i;
      while (j < len && para[j] != ' ') j++;
      if (j == i) break;
      String word = para.substring(i, j);
      i = j;
      if (textWidth(word) > maxW) ok = false;
      String t = line.length() ? line + " " + word : word;
      if (!line.length() || textWidth(t) <= maxW) line = t;
      else {
        lines[nLines++] = line;
        line = word;
        if (nLines >= MAX_LINES) return false;
      }
    }
    lines[nLines++] = line;   // may be empty: a blank line
  }
  return ok && start > (int)text.length();
}

// Returns the line height in pixels of the size that was used
int drawText(int family, int size, char align, uint16_t fg, uint16_t bg, int margin, const String& text) {
  family = constrain(family, 0, N_FAMILIES - 1);
  int W = tft.width(), H = tft.height();
  int maxW = W - 2 * margin, maxH = H - 2 * margin;
  int16_t x1, y1;
  uint16_t w, h;
  int ascent = 0, block = 0;

  tft.setTextWrap(false);
  for (int s = size >= 1 ? size - 1 : N_SIZES - 1; s >= 0; s--) {
    pickSize(family, s);
    bool fits = wrapText(text, maxW);
    tft.getTextBounds("Ag", 0, 0, &x1, &y1, &w, &h);
    ascent = -y1;
    block = (nLines - 1) * lineH + h;
    if (size >= 1 || (fits && block <= maxH)) break;   // fixed size, or it fits
  }

  tft.fillScreen(bg);
  tft.setTextColor(fg);
  int y = (H - block) / 2 + ascent;
  for (int i = 0; i < nLines; i++) {
    tft.getTextBounds(lines[i], 0, 0, &x1, &y1, &w, &h);
    int x = align == 'c' ? (W - (int)w) / 2 : align == 'r' ? W - margin - (int)w : margin;
    tft.setCursor(x - x1, y + i * lineH);
    tft.print(lines[i]);
  }
  return lineH;
}

// ---------------------------------------------------------------------------
// Image upload

// Waits for serial data. Returns false after 3 seconds of silence.
bool waitForData(uint32_t& lastData) {
  if (Serial.available() > 0) { lastData = millis(); return true; }
  if (millis() - lastData > 3000) return false;
  delay(0);
  return true;
}

// Plain RGB565, big-endian, pushed row by row
void receiveImage(int x, int y, int w, int h) {
  if (w <= 0 || h <= 0 || w > 320 || h > 320) { Serial.println("ERR IMG size"); return; }
  static uint16_t row[320];
  const uint32_t total = (uint32_t)w * h * 2;
  const int rowBytes = w * 2;
  uint32_t got = 0, sinceAck = 0;
  int rowFill = 0;
  uint32_t lastData = millis();

  Serial.println("READY");
  tft.startWrite();
  tft.setAddrWindow(x, y, w, h);
  while (got < total) {
    if (!waitForData(lastData)) { tft.endWrite(); Serial.println("ERR IMG timeout"); return; }
    int avail = Serial.available();
    if (avail <= 0) continue;
    int want = min((int)(rowBytes - rowFill), avail);
    want = min(want, (int)(total - got));
    int n = Serial.readBytes((uint8_t*)row + rowFill, want);
    rowFill += n; got += n; sinceAck += n;
    if (rowFill == rowBytes) {
      tft.writePixels(row, w, true, true);   // last true: data is big-endian
      rowFill = 0;
    }
    if (sinceAck >= 4096 || got == total) { Serial.println("K"); sinceAck = 0; }
  }
  tft.endWrite();
  Serial.println("OK IMG");
}

// Run-length data: much faster for drawings with large areas of one color
void receiveImageRuns(int w, int h, uint32_t total) {
  if (w <= 0 || h <= 0 || w > tft.width() || h > tft.height() || total % 4) { Serial.println("ERR IMG size"); return; }
  uint32_t pixelsLeft = (uint32_t)w * h;
  uint32_t got = 0, sinceAck = 0;
  uint8_t run[4];
  int fill = 0;
  uint32_t lastData = millis();

  Serial.println("READY");
  tft.startWrite();
  tft.setAddrWindow(0, 0, w, h);
  while (got < total) {
    if (!waitForData(lastData)) { tft.endWrite(); Serial.println("ERR IMG timeout"); return; }
    while (Serial.available() > 0 && got < total) {
      run[fill++] = Serial.read();
      got++; sinceAck++;
      if (fill == 4) {
        fill = 0;
        uint32_t count = ((uint32_t)run[0] << 8) | run[1];
        uint16_t color = ((uint16_t)run[2] << 8) | run[3];
        if (count > pixelsLeft) count = pixelsLeft;
        if (count) tft.writeColor(color, count);
        pixelsLeft -= count;
      }
      if (sinceAck >= 4096 || got == total) { Serial.println("K"); sinceAck = 0; }
    }
  }
  tft.endWrite();
  Serial.println("OK IMG");
}

void testPattern() {
  int w = tft.width(), h = tft.height();
  const uint16_t bars[] = {ST77XX_WHITE, ST77XX_YELLOW, ST77XX_CYAN, ST77XX_GREEN, ST77XX_MAGENTA, ST77XX_RED, ST77XX_BLUE, ST77XX_BLACK};
  int bh = h * 2 / 3;
  for (int i = 0; i < 8; i++) tft.fillRect(i * w / 8, 0, w / 8 + 1, bh, bars[i]);
  for (int x = 0; x < w; x++) {
    uint8_t v = x * 255 / (w - 1);
    tft.drawFastVLine(x, bh, h - bh, tft.color565(v, v, v));
  }
  tft.drawRect(0, 0, w, h, ST77XX_RED);
}

// ---------------------------------------------------------------------------

void handleCommand(String line) {
  line.trim();
  if (!line.length()) return;
  String rest = line;
  String cmd = nextToken(rest);
  cmd.toUpperCase();

  if (cmd == "PING") Serial.println("PONG TftBridge");
  else if (cmd == "INFO") sendInfo();
  else if (cmd == "ROT") { rotation = nextToken(rest).toInt() & 3; tft.setRotation(rotation); sendInfo(); }
  else if (cmd == "INVERT") {
    inverted = nextToken(rest).toInt() != 0;
    applyInvert();
    prefs.putBool("inv", inverted);
    Serial.println("OK");
  }
  else if (cmd == "FILL") { tft.fillScreen(hexColor(nextToken(rest))); Serial.println("OK"); }
  else if (cmd == "TESTPAT") { testPattern(); Serial.println("OK"); }
  else if (cmd == "TEXT") {
    int family = nextToken(rest).toInt();
    int size = argInt(rest, 0, N_SIZES);
    String a = nextToken(rest);
    uint16_t fg = hexColor(nextToken(rest));
    uint16_t bg = hexColor(nextToken(rest));
    int margin = argInt(rest, 0, 100);
    int px = drawText(family, size, a.length() ? a[0] : 'c', fg, bg, margin, rest);
    Serial.printf("OK TEXT size=%d lines=%d\n", px, nLines);
  }
  else if (cmd == "IMG") {
    int x = nextToken(rest).toInt(), y = nextToken(rest).toInt();
    int w = nextToken(rest).toInt(), h = nextToken(rest).toInt();
    receiveImage(x, y, w, h);
  }
  else if (cmd == "IMGR") {
    int w = nextToken(rest).toInt(), h = nextToken(rest).toInt();
    receiveImageRuns(w, h, strtoul(nextToken(rest).c_str(), nullptr, 10));
  }
  else Serial.printf("ERR unknown command: %s\n", cmd.c_str());
}

void setup() {
  Serial.setRxBufferSize(16384);
  Serial.begin(BAUD);

  SPI.begin(TFT_CLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 320);
  tft.setRotation(rotation);

  prefs.begin("tftlab", false);
  inverted = prefs.getBool("inv", true);
  applyInvert();

  tft.fillScreen(ST77XX_BLACK);

  tft.setTextWrap(false);
  tft.setFont(&FreeSansBold18pt7b);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(20, 110);
  tft.print("TFT Web Lab");
  tft.setFont(&FreeSans9pt7b);
  tft.setTextColor(0xC618);   // light grey
  tft.setCursor(20, 145);
  tft.print("Waiting for the browser...");

  Serial.println("HELLO TftBridge");
}

void loop() {
  static String buf;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handleCommand(buf); buf = ""; }
    else if (c != '\r' && buf.length() < 1024) buf += c;
  }
  delay(2);
}
