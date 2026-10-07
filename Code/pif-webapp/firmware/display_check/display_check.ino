// Display check: the smallest possible screen test. Fills the screen red, green, blue and
// white in turn, then draws a line of text, forever, and says so on the Serial Monitor
// (115200). If the colours cycle, the wiring is right.
//
// Wiring (the display's own SPI bus, separate from the SD card's):
//   SCK  -> IO18
//   SDI  -> IO23
//   CS   -> IO5
//   DC   -> IO22
//   RESET-> the board's EN / RST pin
//   VCC, LED -> 3.3 V      GND -> GND
// Change the pins below to try a different wiring without touching anything else.

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

#define TFT_SCK  18
#define TFT_MOSI 23
#define TFT_CS   5
#define TFT_DC   22
#define TFT_RST  -1  // RESET on the board's EN pin: the screen resets with the board

Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

const uint16_t COLOURS[] = { ST77XX_RED, ST77XX_GREEN, ST77XX_BLUE, ST77XX_WHITE };
const char* NAMES[] = { "red", "green", "blue", "white" };

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\nDisplay check: SCK=%d MOSI=%d CS=%d DC=%d RST=%d\n", TFT_SCK, TFT_MOSI, TFT_CS, TFT_DC, TFT_RST);

  SPI.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  tft.setSPISpeed(10000000);  // slow and safe (10 MHz) while checking wiring
  tft.init(240, 320);
  // The library switches colour inversion on; our panel doesn't need it. If the colours
  // below come out as cyan, magenta, yellow, black instead, change this to true.
  tft.invertDisplay(false);
  tft.setRotation(3);
  Serial.println("init done");
}

void loop() {
  for (int i = 0; i < 4; i++) {
    tft.fillScreen(COLOURS[i]);
    Serial.printf("screen should be %s\n", NAMES[i]);
    delay(1000);
  }
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextColor(0x079B);
  tft.setTextSize(3);
  tft.setCursor(20, 100);
  tft.print("Display OK");
  Serial.println("screen should say Display OK");
  delay(1500);
}
