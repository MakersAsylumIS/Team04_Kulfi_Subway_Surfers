// Pet story player: Bluetooth + display + real audio from the SD card.
//
// The app sends a story id (docs/PET-PROTOCOL.md); the pet plays /stories/<id>.wav from
// its SD card through the speaker (or earphones), shows the place and title on the
// screen with a progress bar, and reports playback back to the app. If the file isn't on
// the card it says "missing file" and the app plays the story on the phone instead.
// The app's "Show my location on the pet" switch also still works: coordinates appear
// as the place line. (Test only; in the product the pet gets place names, never positions.)
//
// ---------- Display: pick one ----------
// 0 = ST7789 2.4" colour TFT on SPI (primary): SCK 18, SDI 23, CS 5, DC 4 (moved from 21!),
//     RESET 22, LED + VCC 3.3 V. 21 is the speaker amp switch; 19 doesn't work (KEY3).
// 1 = SH1106 1.3" 128x64 OLED on I2C (test): SDA 33, SCL 32, VCC 3.3 V, GND.
#ifndef PET_SCREEN_OLED
#define PET_SCREEN_OLED 1
#endif
//
// ---------- Other wiring (ESP32-A1S, docs/FEATURES.md section 7) ----------
//   Speaker: the board's speaker terminals. Earphones: the headphone jack.
//   SD card: the board's slot, DIP switches DATA3 and CMD ON.
//            Files: /stories/<story id>.wav, 16-bit PCM WAV (mono 22050 Hz is plenty for speech).
//
// Libraries: NimBLE-Arduino 2.x, arduino-audio-tools and arduino-audio-driver
//            (HARDWARE.md section 5), plus for the TFT "Adafruit ST7735 and ST7789
//            Library" (+ Adafruit GFX), or for the OLED "U8g2".
// Board:     ESP32 Wrover Module, Partition Scheme "Huge APP (3MB No OTA/1MB SPIFFS)".
// Serial:    115200, line ending Newline. Commands:
//              play <id>   stop   pause   resume   ls (list /stories)   vol <0.0-1.0>
//              p (pat)   d (double-pat)   s (status)

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <NimBLEDevice.h>
#include "AudioTools.h"
#include "AudioTools/AudioLibs/AudioBoardStream.h"

#include "pet_screen.h"

// ---------- Audio ----------
AudioBoardStream kit(AudioKitEs8388V1);  // V1, not V2: V2 is silent on our board
EncodedAudioStream decoder(&kit, new WAVDecoder());
StreamCopy copier;
File audioFile;
float volume = 0.9;  // 0.9 = 0 dB on this codec: loudest without clipping

// ---------- Protocol (keep in sync with src/pet/protocol.ts) ----------
#define SERVICE_UUID     "f4040001-a91e-4923-a44e-340a15cd58e5"
#define PLAY_UUID        "f4040002-a91e-4923-a44e-340a15cd58e5"
#define TRANSPORT_UUID   "f4040003-a91e-4923-a44e-340a15cd58e5"
#define NOW_SHOWING_UUID "f4040004-a91e-4923-a44e-340a15cd58e5"
#define PLAYBACK_UUID    "f4040005-a91e-4923-a44e-340a15cd58e5"
#define HAPTIC_UUID      "f4040006-a91e-4923-a44e-340a15cd58e5"
#define INPUT_UUID       "f4040007-a91e-4923-a44e-340a15cd58e5"

enum PlaybackState : uint8_t { STATE_IDLE = 0, STATE_PLAYING = 1, STATE_PAUSED = 2, STATE_MISSING_FILE = 3 };
enum TransportCmd : uint8_t { CMD_RESUME = 0, CMD_PAUSE = 1, CMD_STOP = 2, CMD_VOLUME = 3 };
enum InputEvent : uint8_t { INPUT_PAT = 1, INPUT_DOUBLE_PAT = 2 };

#define PET_NAME "PiF Pet"

NimBLECharacteristic* playbackChr = nullptr;
NimBLECharacteristic* inputChr = nullptr;
volatile bool connected = false;

// ---------- Shared state ----------
// Bluetooth callbacks and the Serial Monitor only post requests; the audio task owns the
// SD card and the codec; loop() owns the display. That keeps SD reads and screen drawing
// from stepping on each other and from starving the audio.
SemaphoreHandle_t requestLock;
String requestedId = "";          // guarded by requestLock
volatile bool playRequested = false;
volatile int transportRequested = -1;

volatile PlaybackState state = STATE_IDLE;
volatile uint32_t bytesPlayed = 0;
volatile uint32_t byteRate = 0;   // bytes per second of the current file
volatile uint32_t durationS = 0;
volatile bool playbackChanged = true;  // notify the app + redraw the progress bar

String shownPlace = "";
String shownTitle = "";
volatile bool textDirty = true;
volatile bool statusDirty = true;
String serialLine = "";

uint16_t positionS() { return byteRate ? bytesPlayed / byteRate : 0; }

// ---------- Audio task ----------
uint32_t readU32(File& f, uint32_t offset) {
  uint8_t b[4] = { 0 };
  f.seek(offset);
  f.read(b, 4);
  return b[0] | (b[1] << 8) | (b[2] << 16) | ((uint32_t)b[3] << 24);
}

void startStory(const String& id) {
  if (audioFile) audioFile.close();
  String path = "/stories/" + id + ".wav";
  audioFile = SD.open(path);
  if (!audioFile) {
    Serial.printf("No file %s -> missing file, the app will play it on the phone\n", path.c_str());
    state = STATE_MISSING_FILE;
    bytesPlayed = 0;
    playbackChanged = true;
    return;
  }
  // WAV header: byte rate at offset 28. Used for the position and the progress bar.
  byteRate = readU32(audioFile, 28);
  durationS = byteRate ? (audioFile.size() - 44) / byteRate : 0;
  audioFile.seek(0);
  decoder.begin();
  copier.begin(decoder, audioFile);
  bytesPlayed = 0;
  state = STATE_PLAYING;
  playbackChanged = true;
  Serial.printf("Playing %s (%u s)\n", path.c_str(), durationS);
}

void stopStory() {
  if (audioFile) audioFile.close();
  state = STATE_IDLE;
  bytesPlayed = 0;
  playbackChanged = true;
}

void audioTask(void*) {
  uint32_t lastSecond = 0;
  for (;;) {
    if (playRequested) {
      xSemaphoreTake(requestLock, portMAX_DELAY);
      String id = requestedId;
      playRequested = false;
      xSemaphoreGive(requestLock);
      startStory(id);
      lastSecond = 0;
    }
    int cmd = transportRequested;
    if (cmd >= 0) {
      transportRequested = -1;
      if (cmd == CMD_PAUSE && state == STATE_PLAYING) { state = STATE_PAUSED; playbackChanged = true; }
      else if (cmd == CMD_RESUME && state == STATE_PAUSED) { state = STATE_PLAYING; playbackChanged = true; }
      else if (cmd == CMD_STOP) stopStory();
    }

    if (state == STATE_PLAYING) {
      size_t n = copier.copy();
      bytesPlayed += n;
      if (n == 0 && audioFile.available() == 0) {
        Serial.println("Story finished");
        stopStory();  // idle tells the app to move on
      } else if (positionS() != lastSecond) {
        lastSecond = positionS();
        playbackChanged = true;  // about once a second
      }
    } else {
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }
}

// ---------- Bluetooth ----------
void notifyPlayback() {
  uint16_t pos = positionS();
  uint8_t buf[3] = { (uint8_t)state, (uint8_t)(pos & 0xff), (uint8_t)(pos >> 8) };
  playbackChr->setValue(buf, sizeof(buf));
  if (connected) playbackChr->notify();
}

void notifyInput(InputEvent event) {
  uint8_t buf[2] = { event, 0 };
  inputChr->setValue(buf, sizeof(buf));
  if (connected) inputChr->notify();
  Serial.printf("-> input %s\n", event == INPUT_PAT ? "pat" : "double-pat");
}

void requestPlay(const String& id) {
  xSemaphoreTake(requestLock, portMAX_DELAY);
  requestedId = id;
  playRequested = true;
  xSemaphoreGive(requestLock);
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override {
    connected = true;
    statusDirty = true;
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    connected = false;
    statusDirty = true;
    NimBLEDevice::startAdvertising();
  }
};

class PlayCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo&) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 3 || v.length() > 34) return;
    requestPlay(String((const char*)(v.data() + 2), v.length() - 2));  // offset ignored for now
  }
};

class TransportCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo&) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 2) return;
    if (v.data()[0] == CMD_VOLUME) {
      volume = v.data()[1] / 100.0f;
      kit.setVolume(volume);
    } else if (v.data()[0] <= CMD_STOP) {
      transportRequested = v.data()[0];
    }
  }
};

class NowShowingCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo&) override {
    NimBLEAttValue v = chr->getValue();
    if (v.length() < 1) return;
    String text = String((const char*)(v.data() + 1), v.length() - 1);
    int nl = text.indexOf('\n');
    shownPlace = nl >= 0 ? text.substring(0, nl) : text;
    shownTitle = nl >= 0 ? text.substring(nl + 1) : "";
    textDirty = true;
  }
};

class HapticCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic*, NimBLEConnInfo&) override {}
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
  Serial.println("\nPiF pet story player");
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);
  requestLock = xSemaphoreCreateMutex();

  // 1. Audio board first: it sets up all of the board's pins (including putting the
  //    onboard-key pins 18, 23, 5 into input mode) and the SD card's SPI bus.
  auto cfg = kit.defaultConfig(TX_MODE);
  cfg.sd_active = true;
  kit.begin(cfg);
  kit.setVolume(volume);
  kit.setSpeakerActive(true);

  if (SD.begin(PIN_AUDIO_KIT_SD_CARD_CS)) {
    Serial.println("SD card mounted");
  } else {
    Serial.println("SD card FAILED to mount: check the card, and DIP switches DATA3 and CMD = ON");
  }

  // 2. Display after the audio board, so its pins end up as display pins (TFT), or so
  //    the codec's I2C bus is already running (OLED).
  screenBegin();

  // 3. Bluetooth.
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
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setName(PET_NAME);
  adv->enableScanResponse(true);
  adv->start();

  // 4. Audio on its own task, above loop()'s priority, so screen drawing can't starve it.
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, nullptr, 3, nullptr, 1);

  Serial.println("Ready. Commands: play <id>, stop, pause, resume, ls, vol <x>, p, d, s");
}

// ---------- Loop: Serial commands + display + notifications ----------
void listStories() {
  File dir = SD.open("/stories");
  if (!dir) {
    Serial.println("No /stories folder on the card");
    return;
  }
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    Serial.printf("  %s  (%u KB)\n", f.name(), (unsigned)(f.size() / 1024));
    f.close();
  }
  dir.close();
}

void runCommand(String line) {
  line.trim();
  if (line.startsWith("play ")) requestPlay(line.substring(5));
  else if (line == "stop") transportRequested = CMD_STOP;
  else if (line == "pause") transportRequested = CMD_PAUSE;
  else if (line == "resume") transportRequested = CMD_RESUME;
  else if (line == "ls") listStories();
  else if (line.startsWith("vol ")) {
    volume = constrain(line.substring(4).toFloat(), 0.0f, 1.0f);
    kit.setVolume(volume);
    Serial.printf("Volume %.1f\n", volume);
  } else if (line == "p") notifyInput(INPUT_PAT);
  else if (line == "d") notifyInput(INPUT_DOUBLE_PAT);
  else if (line == "s") Serial.printf("connected=%d state=%u position=%us / %us\n", connected, state, positionS(), durationS);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length()) runCommand(serialLine);
      serialLine = "";
    } else {
      serialLine += c;
    }
  }

  uint8_t parts = 0;
  if (playbackChanged) {
    playbackChanged = false;
    notifyPlayback();
    parts |= PART_PROGRESS;
  }
  if (statusDirty) {
    statusDirty = false;
    parts |= PART_STATUS;
  }
  if (textDirty) {
    textDirty = false;
    parts |= PART_TEXT;
  }
  if (parts) {
    ScreenModel m = { connected, shownPlace, shownTitle, (uint8_t)state, positionS(), durationS };
    screenDraw(m, parts);
  }
  delay(10);
}
