// Key check: press each of the board's six keys (KEY1 to KEY6) and see it on the Serial
// Monitor (115200). Nothing else is started (no display, no SD card), so every key pin
// can be read safely, even the ones the display and SD card use in the main sketch.
//
// Key pins come from the arduino-audio-driver V1 pin file for this board (all six
// confirmed on ours, 2026-10-05):
//   KEY1 = 36, KEY2 = 13, KEY3 = 19, KEY4 = 23, KEY5 = 18, KEY6 = 5
// A key reads LOW while pressed (the board pulls each pin up).
//
// Also MTDI (GPIO 12, on the JTAG header) as a possible extra button. It is wired the other
// way round, button between MTDI and 3.3 V, because GPIO 12 must be LOW when the board
// starts (HIGH there and the board will not boot). So it reads LOW at rest, HIGH while
// pressed. Don't hold it while powering on or pressing RST.
//
// Board: ESP32 Wrover Module. You can leave the display wired; it just won't be used.

#include <Arduino.h>

struct Key {
  const char* name;
  int pin;
  bool activeHigh;  // true for MTDI: button to 3.3 V, pulled down
  bool pressed;
  uint32_t changedAt;
};

Key keys[] = {
  { "KEY1", 36, false, false, 0 },
  { "KEY2", 13, false, false, 0 },
  { "KEY3", 19, false, false, 0 },
  { "KEY4", 23, false, false, 0 },
  { "KEY5", 18, false, false, 0 },
  { "KEY6", 5, false, false, 0 },
  { "MTDI", 12, true, false, 0 },
};
const uint32_t DEBOUNCE_MS = 30;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nKey check: press KEY1 to KEY6 and the MTDI button, one at a time.");
  for (Key& k : keys) {
    if (k.activeHigh) pinMode(k.pin, INPUT_PULLDOWN);
    // 36 is input-only with no built-in pull-up; the board's own resistor pulls it up.
    else pinMode(k.pin, k.pin >= 34 ? INPUT : INPUT_PULLUP);
  }
  delay(50);
  for (Key& k : keys) {
    int v = digitalRead(k.pin);
    bool ok = k.activeHigh ? !v : v;
    Serial.printf("  %s (GPIO %d) reads %s at rest%s\n", k.name, k.pin, v ? "HIGH" : "LOW",
                  ok ? "" : "  <- wrong: something is driving or shorting this pin");
  }
  Serial.println("Waiting for presses...");
}

void loop() {
  uint32_t now = millis();
  for (Key& k : keys) {
    bool down = digitalRead(k.pin) == (k.activeHigh ? HIGH : LOW);
    if (down != k.pressed && now - k.changedAt > DEBOUNCE_MS) {
      k.pressed = down;
      k.changedAt = now;
      Serial.printf("%s (GPIO %d) %s\n", k.name, k.pin, down ? "pressed" : "released");
    }
  }
  delay(5);
}
