// Pet Bluetooth test: step 1 of putting the pet together.
//
// Bluetooth only. No display, no audio, no SD card. It speaks the exact protocol in
// docs/PET-PROTOCOL.md and pretends to play each story for 40 seconds, so you can
// check the link with nRF Connect and then with the web app's "Pair a pet" button.
//
// Text console: you can also just text the pet, from the Serial Monitor (115200 baud,
// line ending "Newline") or from a phone app that speaks "BLE UART" (the Nordic UART
// Service): Serial Bluetooth Terminal on Android, or Bluefruit Connect on Android and iPhone.
// Commands, one per line:
//   play <story-id> [offset]   pause   resume   stop
//   pat (or p)   dpat (or d)   empty (or m: toggle "SD card is empty")   status (or s)   help
//
// Library: NimBLE-Arduino 2.x (Arduino Library Manager, by h2zero).
// Board:   ESP32 Wrover Module (see HARDWARE.md section 2).

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <stdarg.h>

// ---------- Protocol (keep in sync with src/pet/protocol.ts) ----------
#define SERVICE_UUID     "f4040001-a91e-4923-a44e-340a15cd58e5"
#define PLAY_UUID        "f4040002-a91e-4923-a44e-340a15cd58e5"
#define TRANSPORT_UUID   "f4040003-a91e-4923-a44e-340a15cd58e5"
#define NOW_SHOWING_UUID "f4040004-a91e-4923-a44e-340a15cd58e5"
#define PLAYBACK_UUID    "f4040005-a91e-4923-a44e-340a15cd58e5"
#define HAPTIC_UUID      "f4040006-a91e-4923-a44e-340a15cd58e5"
#define INPUT_UUID       "f4040007-a91e-4923-a44e-340a15cd58e5"

// Nordic UART Service: the common standard for "text over Bluetooth LE". It's a debug
// console only; the web app uses the characteristics above.
#define UART_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // phone writes text here
#define UART_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // pet replies here

enum PlaybackState : uint8_t { STATE_IDLE = 0, STATE_PLAYING = 1, STATE_PAUSED = 2, STATE_MISSING_FILE = 3 };
enum TransportCmd : uint8_t { CMD_RESUME = 0, CMD_PAUSE = 1, CMD_STOP = 2, CMD_VOLUME = 3, CMD_OUTPUT = 4 };
enum InputEvent : uint8_t { INPUT_PAT = 1, INPUT_DOUBLE_PAT = 2 };

#define PET_NAME           "Jam Pet"
#define FAKE_STORY_SECONDS 40

// ---------- State ----------
NimBLECharacteristic* playbackChr = nullptr;
NimBLECharacteristic* inputChr = nullptr;
NimBLECharacteristic* uartTxChr = nullptr;

volatile bool connected = false;
PlaybackState state = STATE_IDLE;
uint16_t positionS = 0;
String storyId = "";
bool pretendCardEmpty = false;

// Bluetooth callbacks run on the Bluetooth task, so they only record what happened.
// loop() acts on it.
volatile bool playRequested = false;
volatile uint16_t requestedOffset = 0;
String requestedId = "";
volatile int transportRequested = -1;
String uartLine = "";
volatile bool uartLineReady = false;
String serialLine = "";

unsigned long lastTick = 0;

// Print to the Serial Monitor and, if a phone terminal is connected, text it back too.
void say(const char* fmt, ...) {
  char buf[160];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.print(buf);
  if (connected && uartTxChr) {
    uartTxChr->setValue((const uint8_t*)buf, strlen(buf));
    uartTxChr->notify();
  }
}

void notifyPlayback() {
  uint8_t buf[3] = { state, (uint8_t)(positionS & 0xff), (uint8_t)(positionS >> 8) };
  playbackChr->setValue(buf, sizeof(buf));
  if (connected) playbackChr->notify();
  say("-> playback state=%u position=%us\n", state, positionS);
}

void notifyInput(InputEvent event) {
  uint8_t buf[2] = { event, 0 };
  inputChr->setValue(buf, sizeof(buf));
  if (connected) inputChr->notify();
  say("-> input %s\n", event == INPUT_PAT ? "pat" : "double-pat");
}

// ---------- Bluetooth callbacks ----------
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    connected = true;
    Serial.printf("Connected: %s\n", info.getAddress().toString().c_str());
  }
  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& info, int reason) override {
    connected = false;
    Serial.printf("Disconnected (reason %d), advertising again\n", reason);
    NimBLEDevice::startAdvertising();
  }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo& info) override {
    Serial.printf("MTU is now %u\n", mtu);
  }
};

class PlayCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 3 || v.length() > 34) {
      Serial.printf("<- play: bad length %u\n", v.length());
      return;
    }
    const uint8_t* d = v.data();
    requestedOffset = d[0] | (d[1] << 8);
    requestedId = String((const char*)(d + 2), v.length() - 2);
    playRequested = true;
  }
};

class TransportCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 2) return;
    const uint8_t* d = v.data();
    if (d[0] == CMD_VOLUME) Serial.printf("<- transport volume %u\n", d[1]);
    else if (d[0] == CMD_OUTPUT) Serial.printf("<- transport output %s\n", d[1] ? "speaker" : "jack");
    else transportRequested = d[0];
  }
};

class NowShowingCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 1) return;
    String text = String((const char*)(v.data() + 1), v.length() - 1);
    int nl = text.indexOf('\n');
    String place = nl >= 0 ? text.substring(0, nl) : text;
    String title = nl >= 0 ? text.substring(nl + 1) : "";
    Serial.printf("<- now_showing icon=%u place=\"%s\" title=\"%s\"\n", v.data()[0], place.c_str(), title.c_str());
  }
};

class HapticCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() >= 1) Serial.printf("<- haptic pattern %u (bzzt)\n", v.data()[0]);
  }
};

class UartRxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    NimBLEAttValue v = chr->getValue();
    uartLine = String((const char*)v.data(), v.length());
    uartLineReady = true;
  }
};

ServerCallbacks serverCallbacks;
PlayCallbacks playCallbacks;
TransportCallbacks transportCallbacks;
NowShowingCallbacks nowShowingCallbacks;
HapticCallbacks hapticCallbacks;
UartRxCallbacks uartRxCallbacks;

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nJam pet Bluetooth test");

  NimBLEDevice::init(PET_NAME);
  NimBLEDevice::setMTU(185);  // room for now_showing (80 B) in one write

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

  NimBLEService* uart = server->createService(UART_SERVICE_UUID);
  uart->createCharacteristic(UART_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)
      ->setCallbacks(&uartRxCallbacks);
  uartTxChr = uart->createCharacteristic(UART_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  uart->start();

  uint8_t idle[3] = { STATE_IDLE, 0, 0 };
  playbackChr->setValue(idle, sizeof(idle));

  // The web app's device picker filters on the pet service UUID, so that's the one advertised.
  // Phone terminal apps find the pet by name and see the UART service once connected.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setName(PET_NAME);
  adv->enableScanResponse(true);
  adv->start();

  Serial.println("Advertising as \"" PET_NAME "\". Type help for commands.");
}

// ---------- Actions ----------
void handlePlay() {
  playRequested = false;
  storyId = requestedId;
  say("<- play \"%s\" from %us\n", storyId.c_str(), requestedOffset);
  if (pretendCardEmpty) {
    // The real pet sends this when /stories/<id>.wav doesn't exist. The app then plays it on the phone.
    state = STATE_MISSING_FILE;
    positionS = 0;
  } else {
    state = STATE_PLAYING;
    positionS = requestedOffset;
    lastTick = millis();
  }
  notifyPlayback();
}

void handleTransport(int cmd) {
  transportRequested = -1;
  if (cmd == CMD_PAUSE && state == STATE_PLAYING) {
    state = STATE_PAUSED;
    say("<- pause\n");
  } else if (cmd == CMD_RESUME && state == STATE_PAUSED) {
    state = STATE_PLAYING;
    lastTick = millis();
    say("<- resume\n");
  } else if (cmd == CMD_STOP) {
    state = STATE_IDLE;
    positionS = 0;
    say("<- stop\n");
  } else {
    return;
  }
  notifyPlayback();
}

// One text command, from the Serial Monitor or a phone terminal.
void runCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  int space = line.indexOf(' ');
  String cmd = space >= 0 ? line.substring(0, space) : line;
  String arg = space >= 0 ? line.substring(space + 1) : "";
  arg.trim();
  cmd.toLowerCase();

  if (cmd == "play") {
    // play <story-id> [offset]: the same thing the app's play characteristic does.
    int sp = arg.indexOf(' ');
    String id = sp >= 0 ? arg.substring(0, sp) : arg;
    uint16_t offset = sp >= 0 ? arg.substring(sp + 1).toInt() : 0;
    if (id.length() == 0 || id.length() > 32) {
      say("usage: play <story-id> [offset]\n");
      return;
    }
    requestedId = id;
    requestedOffset = offset;
    handlePlay();
  } else if (cmd == "pause") {
    handleTransport(CMD_PAUSE);
  } else if (cmd == "resume") {
    handleTransport(CMD_RESUME);
  } else if (cmd == "stop") {
    handleTransport(CMD_STOP);
  } else if (cmd == "pat" || cmd == "p") {
    notifyInput(INPUT_PAT);
  } else if (cmd == "dpat" || cmd == "d") {
    notifyInput(INPUT_DOUBLE_PAT);
  } else if (cmd == "empty" || cmd == "m") {
    pretendCardEmpty = !pretendCardEmpty;
    say("Pretend SD card is empty: %s\n", pretendCardEmpty ? "yes" : "no");
  } else if (cmd == "status" || cmd == "s") {
    say("connected=%d state=%u position=%us story=\"%s\"\n", connected, state, positionS, storyId.c_str());
  } else {
    say("commands: play <id> [offset], pause, resume, stop, pat, dpat, empty, status\n");
  }
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      runCommand(serialLine);
      serialLine = "";
    } else {
      serialLine += c;
    }
  }
}

// ---------- Loop ----------
void loop() {
  if (playRequested) handlePlay();
  if (transportRequested >= 0) handleTransport(transportRequested);
  handleSerial();
  if (uartLineReady) {
    uartLineReady = false;
    runCommand(uartLine);
  }

  // Pretend playback: one tick a second, then idle at the end so the app moves on.
  if (state == STATE_PLAYING && millis() - lastTick >= 1000) {
    lastTick += 1000;
    positionS++;
    if (positionS >= FAKE_STORY_SECONDS) state = STATE_IDLE;
    notifyPlayback();
  }

  delay(5);
}
