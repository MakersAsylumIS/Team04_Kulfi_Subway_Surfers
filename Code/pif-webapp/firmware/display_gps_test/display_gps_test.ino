// Pet display test: Bluetooth + the ST7789 screen.
//
// The pet shows whatever the app sends on now_showing (docs/PET-PROTOCOL.md): a place
// on the first line, a title on the second. The app's "Test the pet" panel has a
// "Show my location on the pet" switch that sends your phone's GPS coordinates this
// way, so this sketch proves phone → Bluetooth → display end to end.
// (Coordinates on the pet are for this test only: in the product the pet is told
// place names, never positions. See AGENTS.md.)
//
// It also does everything pet_ble_test does (fake 40 s playback, pat / double-pat from
// the Serial Monitor), so story playback from the app shows up on screen too.
//
// Wiring for the ESP32-A1S (docs/FEATURES.md section 7):
//   SCK 18, MOSI (SDI) 23, CS 5, DC 19, RESET 22, LED -> 3.3 V, VCC 3.3 V, GND.
//   Leave MISO and the touch / SD pins unconnected.
//   Not DC 21 as in the group's face sketch: on the A1S, 21 switches the speaker amp.
//
// Libraries: NimBLE-Arduino 2.x, "Adafruit ST7735 and ST7789 Library" (installs
//            Adafruit GFX too), all from the Arduino Library Manager.
// Board:     ESP32 Wrover Module.
// Serial:    115200 baud, line ending Newline. p = pat, d = double-pat, s = status.

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <NimBLEDevice.h>

// ---------- Display pins ----------
#define TFT_CS   5
#define TFT_DC   21
#define TFT_RST  22   // the onboard LED pin: fine for reset (the LED just blinks at boot).
                      // Or wire RESET to the board's EN pin and set this to -1.
#define TFT_MOSI 23
#define TFT_CLK  18

#define INK    0xFFFF
#define DIM    0x8410
#define ACCENT 0x079B  // the face colour from the group's sketch

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

// ---------- Protocol (keep in sync with src/pet/protocol.ts) ----------
#define SERVICE_UUID     "f4040001-a91e-4923-a44e-340a15cd58e5"
#define PLAY_UUID        "f4040002-a91e-4923-a44e-340a15cd58e5"
#define TRANSPORT_UUID   "f4040003-a91e-4923-a44e-340a15cd58e5"
#define NOW_SHOWING_UUID "f4040004-a91e-4923-a44e-340a15cd58e5"
#define PLAYBACK_UUID    "f4040005-a91e-4923-a44e-340a15cd58e5"
#define HAPTIC_UUID      "f4040006-a91e-4923-a44e-340a15cd58e5"
#define INPUT_UUID       "f4040007-a91e-4923-a44e-340a15cd58e5"

enum PlaybackState : uint8_t { STATE_IDLE = 0, STATE_PLAYING = 1, STATE_PAUSED = 2, STATE_MISSING_FILE = 3 };
enum TransportCmd : uint8_t { CMD_RESUME = 0, CMD_PAUSE = 1, CMD_STOP = 2 };
enum InputEvent : uint8_t { INPUT_PAT = 1, INPUT_DOUBLE_PAT = 2 };

#define PET_NAME           "Jam Pet"
#define FAKE_STORY_SECONDS 40

NimBLECharacteristic* playbackChr = nullptr;
NimBLECharacteristic* inputChr = nullptr;

volatile bool connected = false;
PlaybackState state = STATE_IDLE;
uint16_t positionS = 0;
unsigned long lastTick = 0;

// Written by Bluetooth callbacks, read by loop().
volatile bool playRequested = false;
volatile uint16_t requestedOffset = 0;
String requestedId = "";
volatile int transportRequested = -1;
String shownPlace = "";
String shownTitle = "";
volatile bool screenDirty = true;   // redraw the text area
volatile bool statusDirty = true;   // redraw the top and bottom bars
String serialLine = "";

// ---------- Drawing ----------
// Only the parts that changed are redrawn: full-screen redraws are slow and,
// once audio is added, cause clicks (HARDWARE.md section 10).

void drawStatusBar() {
  tft.fillRect(0, 0, 320, 30, 0x0000);
  tft.setTextSize(2);
  tft.setTextColor(ACCENT);
  tft.setCursor(10, 8);
  tft.print("Jam Pet");
  tft.setTextColor(connected ? INK : DIM);
  tft.setCursor(200, 8);
  tft.print(connected ? "connected" : "waiting...");
}

void drawProgressBar() {
  tft.fillRect(0, 214, 320, 26, 0x0000);
  if (state == STATE_PLAYING || state == STATE_PAUSED) {
    int w = (int)(300L * positionS / FAKE_STORY_SECONDS);
    tft.drawRect(10, 220, 300, 12, DIM);
    tft.fillRect(10, 220, w, 12, ACCENT);
  }
}

// Prints text wrapped at word boundaries inside a box; returns the y after the last line.
int printWrapped(const String& text, int x, int y, int width, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int charW = 6 * size, lineH = 8 * size + 4;
  int perLine = width / charW;
  int start = 0;
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

void drawText() {
  tft.fillRect(0, 34, 320, 178, 0x0000);
  if (shownPlace.length() == 0) {
    printWrapped("Waiting for the app.", 10, 100, 300, 2, DIM);
    return;
  }
  // Big if it fits on one line, otherwise smaller (coordinates are long).
  uint8_t size = shownPlace.length() * 18 <= 300 ? 3 : 2;
  int y = printWrapped(shownPlace, 10, 50, 300, size, INK);
  printWrapped(shownTitle, 10, y + 10, 300, 2, DIM);
}

// ---------- Bluetooth ----------
void notifyPlayback() {
  uint8_t buf[3] = { state, (uint8_t)(positionS & 0xff), (uint8_t)(positionS >> 8) };
  playbackChr->setValue(buf, sizeof(buf));
  if (connected) playbackChr->notify();
  statusDirty = true;
}

void notifyInput(InputEvent event) {
  uint8_t buf[2] = { event, 0 };
  inputChr->setValue(buf, sizeof(buf));
  if (connected) inputChr->notify();
  Serial.printf("-> input %s\n", event == INPUT_PAT ? "pat" : "double-pat");
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    connected = true;
    statusDirty = true;
    Serial.println("Connected");
  }
  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& info, int reason) override {
    connected = false;
    statusDirty = true;
    Serial.printf("Disconnected (reason %d), advertising again\n", reason);
    NimBLEDevice::startAdvertising();
  }
};

class PlayCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 3 || v.length() > 34) return;
    const uint8_t* d = v.data();
    requestedOffset = d[0] | (d[1] << 8);
    requestedId = String((const char*)(d + 2), v.length() - 2);
    playRequested = true;
  }
};

class TransportCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() >= 2 && v.data()[0] <= CMD_STOP) transportRequested = v.data()[0];
  }
};

class NowShowingCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 1) return;
    String text = String((const char*)(v.data() + 1), v.length() - 1);
    int nl = text.indexOf('\n');
    shownPlace = nl >= 0 ? text.substring(0, nl) : text;
    shownTitle = nl >= 0 ? text.substring(nl + 1) : "";
    screenDirty = true;
  }
};

class HapticCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    Serial.println("<- haptic (bzzt)");
  }
};

ServerCallbacks serverCallbacks;
PlayCallbacks playCallbacks;
TransportCallbacks transportCallbacks;
NowShowingCallbacks nowShowingCallbacks;
HapticCallbacks hapticCallbacks;

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nJam pet display test");

  SPI.begin(TFT_CLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 320);
  tft.setRotation(3);  // landscape, same as the group's face sketch
  tft.fillScreen(0x0000);

  NimBLEDevice::init(PET_NAME);
  NimBLEDevice::setMTU(185);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);

  NimBLEService* service = server->createService(SERVICE_UUID);
  service->createCharacteristic(PLAY_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(&playCallbacks);
  service->createCharacteristic(TRANSPORT_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(&transportCallbacks);
  service->createCharacteristic(NOW_SHOWING_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(&nowShowingCallbacks);
  service->createCharacteristic(HAPTIC_UUID, NIMBLE_PROPERTY::WRITE)->setCallbacks(&hapticCallbacks);
  playbackChr = service->createCharacteristic(PLAYBACK_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  inputChr = service->createCharacteristic(INPUT_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  service->start();
  uint8_t idle[3] = { STATE_IDLE, 0, 0 };
  playbackChr->setValue(idle, sizeof(idle));

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setName(PET_NAME);
  adv->enableScanResponse(true);
  adv->start();

  Serial.println("Advertising as \"" PET_NAME "\". Commands: p d s");
}

// ---------- Loop ----------
void handlePlay() {
  playRequested = false;
  Serial.printf("<- play \"%s\"\n", requestedId.c_str());
  state = STATE_PLAYING;
  positionS = requestedOffset;
  lastTick = millis();
  notifyPlayback();
}

void handleTransport(int cmd) {
  transportRequested = -1;
  if (cmd == CMD_PAUSE && state == STATE_PLAYING) state = STATE_PAUSED;
  else if (cmd == CMD_RESUME && state == STATE_PAUSED) { state = STATE_PLAYING; lastTick = millis(); }
  else if (cmd == CMD_STOP) { state = STATE_IDLE; positionS = 0; }
  else return;
  notifyPlayback();
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n' && c != '\r') { serialLine += c; continue; }
    serialLine.trim();
    if (serialLine == "p") notifyInput(INPUT_PAT);
    else if (serialLine == "d") notifyInput(INPUT_DOUBLE_PAT);
    else if (serialLine == "s") Serial.printf("connected=%d state=%u place=\"%s\"\n", connected, state, shownPlace.c_str());
    serialLine = "";
  }
}

void loop() {
  if (playRequested) handlePlay();
  if (transportRequested >= 0) handleTransport(transportRequested);
  handleSerial();

  if (state == STATE_PLAYING && millis() - lastTick >= 1000) {
    lastTick += 1000;
    positionS++;
    if (positionS >= FAKE_STORY_SECONDS) state = STATE_IDLE;
    notifyPlayback();
  }

  if (statusDirty) {
    statusDirty = false;
    drawStatusBar();
    drawProgressBar();
  }
  if (screenDirty) {
    screenDirty = false;
    drawText();
  }
  delay(5);
}
