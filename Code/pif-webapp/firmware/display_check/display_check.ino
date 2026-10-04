// Display check: the smallest possible screen test. Fills the screen red, green,
// blue and white in turn, forever, and says so on the Serial Monitor (115200).
// If the colours cycle, the wiring and pins are right. Change the pins below to
// try a different wiring without touching anything else.

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

#define TFT_CS   5
#define TFT_DC   21   // try 21 to compare with the group's original wiring
#define TFT_RST  22
#define TFT_MOSI 23
#define TFT_CLK  18

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

const uint16_t COLOURS[] = { ST77XX_RED, ST77XX_GREEN, ST77XX_BLUE, ST77XX_WHITE };
const char* NAMES[] = { "red", "green", "blue", "white" };

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\nDisplay check: CS=%d DC=%d RST=%d MOSI=%d SCK=%d\n", TFT_CS, TFT_DC, TFT_RST, TFT_MOSI, TFT_CLK);

  SPI.begin(TFT_CLK, -1, TFT_MOSI, TFT_CS);
  tft.setSPISpeed(10000000);  // slow and safe (10 MHz) while we're checking wiring
  tft.init(240, 320);
  tft.setRotation(3);
  Serial.println("init done");
}

void loop() {
  for (int i = 0; i < 4; i++) {
    tft.fillScreen(COLOURS[i]);
    Serial.printf("screen should be %s\n", NAMES[i]);
    delay(1000);
  }
}
