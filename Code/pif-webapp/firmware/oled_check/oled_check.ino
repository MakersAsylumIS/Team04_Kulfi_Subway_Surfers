// OLED check: the smallest test for the 1.3" SH1106 128x64 OLED on I2C.
//
// Wiring: VCC 3.3 V, GND, SDA -> IO18, SCL -> IO23 (header pins; 32/33 aren't on the headers).
// First it scans the bus and prints what answers on the Serial Monitor (115200):
// expect 0x3C (the OLED). Then it shows a counter.
// Library: U8g2 (Arduino Library Manager). Board: ESP32 Wrover Module.

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

#define I2C_SDA 18
#define I2C_SCL 23

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

void scanI2C() {
  Serial.printf("Scanning I2C on SDA %d / SCL %d...\n", I2C_SDA, I2C_SCL);
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  found 0x%02X%s\n", addr,
                    addr == 0x10 ? "  (ES8388 codec)" : addr == 0x3C || addr == 0x3D ? "  (OLED)" : "");
      found++;
    }
  }
  if (!found) Serial.println("  nothing answered: check SDA/SCL wiring and power");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(I2C_SDA, I2C_SCL);
  scanI2C();

  oled.begin();
  oled.setFont(u8g2_font_6x10_tf);
}

void loop() {
  static uint32_t n = 0;
  oled.clearBuffer();
  oled.drawStr(0, 10, "PiF Pet OLED check");
  oled.drawHLine(0, 13, 128);
  oled.drawStr(0, 30, "If you can read this,");
  oled.drawStr(0, 42, "the OLED works.");
  char buf[24];
  snprintf(buf, sizeof(buf), "count %lu", (unsigned long)n++);
  oled.drawStr(0, 60, buf);
  oled.sendBuffer();
  delay(500);
}
