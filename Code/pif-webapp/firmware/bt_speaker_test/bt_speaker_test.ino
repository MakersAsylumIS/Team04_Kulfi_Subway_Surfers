// Bluetooth speaker test: the board shows up as an ordinary Bluetooth speaker
// ("Jam Pet Speaker"). Pair it from a laptop or phone, play anything, and it comes
// out of the board's speaker (or the headphone jack, if earphones are plugged in).
//
// This is a test of the speaker and the audio path, using normal (Classic) Bluetooth
// audio, the same thing earbuds use. It is NOT how stories reach the pet in the app:
// the app talks Bluetooth LE and the pet plays its own files (docs/PET-PROTOCOL.md).
//
// Based on the library's bundled example basic-a2dp-audiokit, with the two things
// HARDWARE.md section 4 says this board needs (V1 + setVolume) and the speaker amp on.
//
// Libraries: arduino-audio-tools, arduino-audio-driver (HARDWARE.md section 5), and
//            ESP32-A2DP by Phil Schatzmann. Not in the Library Manager: download the ZIP
//            from github.com/pschatzmann/ESP32-A2DP, extract it into Arduino/libraries,
//            and rename the folder to drop "-main", same as the other two.
// Board:     ESP32 Wrover Module, Partition Scheme "Huge APP (3MB No OTA/1MB SPIFFS)".
// Serial:    115200 baud. + / - = volume, s = speaker amp on/off.

#include "AudioTools.h"
#include "AudioTools/Communication/A2DPStream.h"
#include "AudioTools/AudioLibs/AudioBoardStream.h"

#define SPEAKER_NAME "Jam Pet Speaker"

BluetoothA2DPSink a2dp_sink;
AudioBoardStream kit(AudioKitEs8388V1);  // V1, not V2: V2 is silent on our board

float volume = 0.7;
bool speakerOn = true;

// Bluetooth audio arrives here as 16-bit stereo samples; pass them straight to the codec.
void read_data_stream(const uint8_t* data, uint32_t length) {
  kit.write(data, length);
}

void on_connection_state(esp_a2d_connection_state_t state, void*) {
  Serial.printf("Bluetooth: %s\n", a2dp_sink.to_str(state));
}

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  auto cfg = kit.defaultConfig(TX_MODE);
  cfg.sd_active = false;    // free the SD pins; not needed here
  cfg.sample_rate = 44100;  // what phones and laptops send over Bluetooth audio
  cfg.channels = 2;
  cfg.bits_per_sample = 16;
  kit.begin(cfg);
  kit.setVolume(volume);           // mandatory: the codec starts attenuated
  kit.setSpeakerActive(speakerOn); // switch the speaker amplifier on (GPIO 21)

  a2dp_sink.set_stream_reader(read_data_stream, false);
  a2dp_sink.set_on_connection_state_changed(on_connection_state);
  a2dp_sink.start(SPEAKER_NAME);

  Serial.println("\nReady. Pair with \"" SPEAKER_NAME "\" in your laptop's or phone's Bluetooth settings.");
  Serial.println("Commands: + - s");
}

void loop() {
  if (!Serial.available()) {
    delay(10);
    return;
  }
  char c = Serial.read();
  if (c == '+' || c == '-') {
    volume = constrain(volume + (c == '+' ? 0.1f : -0.1f), 0.0f, 1.0f);
    kit.setVolume(volume);
    Serial.printf("Volume %.1f\n", volume);
  } else if (c == 's') {
    speakerOn = !speakerOn;
    kit.setSpeakerActive(speakerOn);
    Serial.printf("Speaker amp %s\n", speakerOn ? "on" : "off");
  }
}
