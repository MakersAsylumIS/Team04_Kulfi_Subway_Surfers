// Speaker test: plays a tone through the board's speaker outputs.
//
// Built on the audio setup verified in HARDWARE.md section 4 (V1 board, setVolume),
// plus the one extra thing speakers need: the onboard amplifier switched on
// (GPIO 21, done by setSpeakerActive). Unplug the earphones: on this board,
// plugging them in can switch the speaker amp off.
//
// Libraries: arduino-audio-tools and arduino-audio-driver (see HARDWARE.md section 5).
// Board:     ESP32 Wrover Module.
// Serial:    115200 baud. Type a letter and press Enter:
//              + / - = volume up / down, s = speaker amp on/off, n = next note

#include "AudioTools.h"
#include "AudioTools/AudioLibs/AudioBoardStream.h"

AudioInfo info(32000, 2, 16);
SineGenerator<int16_t> sineWave(16000);
GeneratedSoundStream<int16_t> sound(sineWave);
AudioBoardStream out(AudioKitEs8388V1);  // V1, not V2: V2 is silent on our board
StreamCopy copier(out, sound);

const float NOTES[] = { N_C4, N_E4, N_G4, N_B4, N_C5 };
const char* NOTE_NAMES[] = { "C4", "E4", "G4", "B4", "C5" };
int note = 3;
float volume = 0.3;  // start gentle: a 3 W speaker on a desk is loud
bool speakerOn = true;

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info);
  out.begin(config);

  out.setVolume(volume);           // mandatory: the codec starts attenuated
  out.setSpeakerActive(speakerOn); // switch the speaker amplifier on

  sineWave.begin(info, NOTES[note]);
  Serial.println("\nSpeaker test. Commands: + - s n");
  Serial.printf("Playing %s at volume %.1f, speaker amp %s\n", NOTE_NAMES[note], volume, speakerOn ? "on" : "off");
}

void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == '+' || c == '-') {
    volume = constrain(volume + (c == '+' ? 0.1f : -0.1f), 0.0f, 1.0f);
    out.setVolume(volume);
    Serial.printf("Volume %.1f\n", volume);
  } else if (c == 's') {
    speakerOn = !speakerOn;
    out.setSpeakerActive(speakerOn);
    Serial.printf("Speaker amp %s\n", speakerOn ? "on" : "off");
  } else if (c == 'n') {
    note = (note + 1) % 5;
    sineWave.setFrequency(NOTES[note]);
    Serial.printf("Note %s\n", NOTE_NAMES[note]);
  }
}

void loop() {
  copier.copy();
  handleSerial();
}
