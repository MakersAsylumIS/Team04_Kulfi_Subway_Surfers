// Clips from the pet screen lab (/lab): a whole animation, with optional sound, sent once
// over USB into PSRAM and then played here at the display's full speed. The live mirror
// ("PIFL" frames, pet_screen.h) is for still screens; this is for anything that moves.
//
// The lab sends "PIFC" and then, all numbers little-endian:
//   header (39 bytes):
//     u8 version (1), u8 rotation, u8 format (0 = RGB565, 1 = palette indices), u8 play mode
//     (0 loop, 1 once, 2 ping-pong), u16 fps x 100, u16 frame count, u16 x, y, w, h (the
//     part of the screen that moves), u16 palette size, u32 base bytes, u32 frame bytes,
//     u32 audio bytes, u32 audio sample rate, i32 audio offset ms (+ = sound starts later),
//     u8 volume 0-100 (255 = leave as is)
//   palette: palette size x u16 RGB565
//   base: the first screen, whole, as RGB565 runs (u8 count, u16 colour)
//   frames: per frame u32 length, u8 mode (0 raw, 1 runs), then the data, covering only
//     x, y, w, h. RGB565: raw u16s or (u8 count, u16 colour) runs. Palette: raw u8 indices
//     or (u8 count, u8 index) runs.
//   audio: mono 16-bit PCM at the sample rate
// The pet answers "LABRX <bytes>" as it goes, then "LABCLIP ok" (or "LABERR …") and plays.
// While it plays, these change it without sending it again:
//   lab stop | lab play | lab fps <n> | lab mode loop|once|pingpong | lab offset <ms> | lab vol <0-100>
#pragma once

struct LabClip {
  uint8_t* mem = nullptr;  // one PSRAM block: palette, base, frames, audio
  uint32_t* offsets = nullptr;
  uint8_t rotation = 2, format = 0, mode = 0;
  uint16_t fpsX100 = 1200, frameCount = 0, rx = 0, ry = 0, rw = 0, rh = 0, paletteCount = 0;
  const uint16_t* palette = nullptr;
  const uint8_t* base = nullptr;
  uint32_t baseLen = 0;
  const uint8_t* frames = nullptr;
  const uint8_t* audio = nullptr;
  uint32_t audioLen = 0, audioRate = 22050;
  int32_t audioOffsetMs = 0;
  bool playing = false;
  uint32_t t0 = 0;
  int lastIdx = -1;
  uint32_t lastCycle = 0;
};
LabClip clip;

// How playback is keeping up, reported to the lab every few seconds as
// "LABSTAT draw=<ms per frame> skipped=<frames> shown=<frames>".
struct ClipStat {
  uint32_t drawUs = 0, shown = 0, skipped = 0, since = 0;
};
ClipStat clipStat;

// Read by the audio task (pet_story_player.ino), which owns the codec.
volatile bool clipAudioOn = false;
volatile bool clipAudioBusy = false;
volatile bool clipAudioRestart = false;
volatile uint32_t clipAudioStartAt = 0;
volatile uint32_t clipAudioFrom = 0;

// Starts the sound for a new pass through the clip, honouring the offset.
static void clipAudioCue(uint32_t t0) {
  if (!clip.audioLen) return;
  int32_t off = clip.audioOffsetMs;
  clipAudioFrom = off < 0 ? (((uint32_t)(-off) * clip.audioRate / 1000) * 2) : 0;
  clipAudioStartAt = t0 + (off > 0 ? off : 0);
  clipAudioRestart = true;
  clipAudioOn = true;
}

void clipStop() {
  clip.playing = false;
  clipAudioOn = false;
  while (clipAudioBusy) delay(1);
}

void clipFree() {
  clipStop();
  free(clip.mem);
  free(clip.offsets);
  clip.mem = nullptr;
  clip.offsets = nullptr;
  clip.frameCount = 0;
}

#if PET_SCREEN_OLED
bool labClipReceive() {
  Serial.println("LABERR the lab needs the TFT build");
  return false;
}
void clipStart() {}
void clipTick() {}
void labSpi(uint32_t) {}
#else

// Streams pixels into the current address window in screen-width pieces.
struct PixelOut {
  uint16_t line[320];
  uint16_t n = 0;
  void put(uint16_t c) {
    line[n++] = c;
    if (n == 320) flush();
  }
  void flush() {
    if (n) tft.writePixels(line, n);
    n = 0;
  }
  // A run of one colour: long ones go straight to the panel as a fill (much quicker than
  // pixel by pixel), short ones into the line.
  void run(uint16_t c, uint32_t count) {
    if (count >= 16) {
      flush();
      tft.writeColor(c, count);
    } else {
      while (count--) put(c);
    }
  }
};

static void drawRuns565(const uint8_t* p, uint32_t len, uint32_t pixels, PixelOut& out) {
  uint32_t done = 0;
  for (uint32_t j = 0; j + 2 < len && done < pixels; j += 3) {
    uint32_t count = p[j];
    if (count > pixels - done) count = pixels - done;
    out.run(p[j + 1] | (p[j + 2] << 8), count);
    done += count;
  }
}

static void clipDrawBase() {
  if (tft.getRotation() != clip.rotation) tft.setRotation(clip.rotation);
  PixelOut out;
  tft.startWrite();
  tft.setAddrWindow(0, 0, tft.width(), tft.height());
  drawRuns565(clip.base, clip.baseLen, (uint32_t)tft.width() * tft.height(), out);
  out.flush();
  tft.endWrite();
}

static void clipDrawFrame(int idx) {
  if (!clip.frameCount || !clip.rw || !clip.rh) return;
  const uint8_t* rec = clip.frames + clip.offsets[idx];
  uint32_t len = rec[0] | (rec[1] << 8) | (rec[2] << 16) | ((uint32_t)rec[3] << 24);
  uint8_t mode = rec[4];
  const uint8_t* d = rec + 5;
  uint32_t pixels = (uint32_t)clip.rw * clip.rh;
  PixelOut out;
  tft.startWrite();
  tft.setAddrWindow(clip.rx, clip.ry, clip.rw, clip.rh);
  if (clip.format == 0) {
    if (mode == 0) for (uint32_t i = 0; i < pixels && i * 2 + 1 < len; i++) out.put(d[i * 2] | (d[i * 2 + 1] << 8));
    else drawRuns565(d, len, pixels, out);
  } else {
    if (mode == 0) {
      for (uint32_t i = 0; i < pixels && i < len; i++) out.put(clip.palette[d[i]]);
    } else {
      uint32_t done = 0;
      for (uint32_t j = 0; j + 1 < len && done < pixels; j += 2) {
        uint32_t count = d[j];
        if (count > pixels - done) count = pixels - done;
        out.run(clip.palette[d[j + 1]], count);
        done += count;
      }
    }
  }
  out.flush();
  tft.endWrite();
}

void clipStart() {
  if (!clip.mem) return;
  clipStat = {};
  clipStat.since = millis();
  clipStop();
  clipDrawBase();
  clip.lastIdx = -1;
  clip.lastCycle = 0;
  clip.t0 = millis();
  clip.playing = true;
  clipAudioCue(clip.t0);
}

// Called from loop() while in lab mode: shows the frame that's due.
void clipTick() {
  if (!clip.playing || !clip.frameCount) return;
  uint32_t el = millis() - clip.t0;
  uint32_t k = (uint64_t)el * clip.fpsX100 / 100000;
  uint32_t n = clip.frameCount;
  int idx;
  uint32_t cycle;
  if (clip.mode == 1) {  // once
    idx = k < n ? k : n - 1;
    cycle = 0;
  } else if (clip.mode == 2 && n > 1) {  // ping-pong
    uint32_t period = 2 * (n - 1);
    uint32_t m = k % period;
    idx = m < n ? m : period - m;
    cycle = k / period;
  } else {  // loop
    idx = k % n;
    cycle = k / n;
  }
  if (cycle != clip.lastCycle) {  // a new pass: the sound starts again with it
    clip.lastCycle = cycle;
    clipAudioCue(clip.t0 + (uint32_t)((uint64_t)cycle * (clip.mode == 2 ? 2 * (n - 1) : n) * 100000 / clip.fpsX100));
  }
  if (idx != clip.lastIdx) {
    // Frames that came due while the last one was still drawing get skipped: the pet can't
    // keep up at this fps and size. Counted and reported, so the lab can show it.
    if (clip.lastIdx >= 0 && idx > clip.lastIdx + 1) clipStat.skipped += idx - clip.lastIdx - 1;
    clip.lastIdx = idx;
    uint32_t t = micros();
    clipDrawFrame(idx);
    clipStat.drawUs += micros() - t;
    clipStat.shown++;
  }
  if (clipStat.shown && millis() - clipStat.since > 3000) {
    Serial.printf("LABSTAT draw=%lu skipped=%lu shown=%lu\n", (unsigned long)(clipStat.drawUs / clipStat.shown / 1000),
                  (unsigned long)clipStat.skipped, (unsigned long)clipStat.shown);
    clipStat = {};
    clipStat.since = millis();
  }
}

void labSpi(uint32_t hz) {
  tft.setSPISpeed(hz);
  Serial.printf("LABSPI %lu\n", (unsigned long)hz);
}

static uint32_t rd32(const uint8_t* b) { return b[0] | (b[1] << 8) | (b[2] << 16) | ((uint32_t)b[3] << 24); }

// Reads n bytes from Serial into dst (or throws them away when dst is null), reporting
// progress so the lab can show it.
static bool clipRead(uint8_t* dst, uint32_t n, uint32_t& got) {
  static uint8_t scratch[1024];
  while (n) {
    uint32_t chunk = n > 4096 ? 4096 : n;
    if (!dst && chunk > sizeof(scratch)) chunk = sizeof(scratch);
    size_t r = Serial.readBytes(dst ? dst : scratch, chunk);
    if (r == 0) return false;
    if (dst) dst += r;
    n -= r;
    uint32_t before = got;
    got += r;
    if (got / 65536 != before / 65536) Serial.printf("LABRX %lu\n", (unsigned long)got);
  }
  return true;
}

bool labClipReceive() {
  Serial.setTimeout(3000);
  uint8_t h[39];
  if (Serial.readBytes(h, sizeof(h)) != sizeof(h) || h[0] != 1) {
    Serial.println("LABERR clip header");
    return false;
  }
  clipFree();
  LabClip c;
  c.rotation = h[1] & 3;
  c.format = h[2];
  c.mode = h[3];
  c.fpsX100 = h[4] | (h[5] << 8);
  c.frameCount = h[6] | (h[7] << 8);
  c.rx = h[8] | (h[9] << 8);
  c.ry = h[10] | (h[11] << 8);
  c.rw = h[12] | (h[13] << 8);
  c.rh = h[14] | (h[15] << 8);
  c.paletteCount = h[16] | (h[17] << 8);
  c.baseLen = rd32(h + 18);
  uint32_t framesLen = rd32(h + 22);
  c.audioLen = rd32(h + 26);
  c.audioRate = rd32(h + 30);
  c.audioOffsetMs = (int32_t)rd32(h + 34);
  uint8_t vol = h[38];
  uint32_t palBytes = (uint32_t)c.paletteCount * 2;
  uint32_t total = palBytes + c.baseLen + framesLen + c.audioLen;

  uint32_t got = 0;
  if (!psramFound() || total + 32768 > ESP.getFreePsram()) {
    clipRead(nullptr, total, got);  // keep the stream in step, then say why
    Serial.printf("LABERR too big: %lu bytes, %lu free\n", (unsigned long)total, (unsigned long)ESP.getFreePsram());
    return false;
  }
  c.mem = (uint8_t*)ps_malloc(total ? total : 1);
  c.offsets = (uint32_t*)malloc(sizeof(uint32_t) * (c.frameCount ? c.frameCount : 1));
  if (!c.mem || !c.offsets) {
    free(c.mem);
    free(c.offsets);
    clipRead(nullptr, total, got);
    Serial.println("LABERR out of memory");
    return false;
  }
  if (!clipRead(c.mem, total, got)) {
    free(c.mem);
    free(c.offsets);
    Serial.println("LABERR clip data stopped coming");
    return false;
  }
  c.palette = (const uint16_t*)c.mem;
  c.base = c.mem + palBytes;
  c.frames = c.base + c.baseLen;
  c.audio = c.frames + framesLen;
  uint32_t pos = 0;
  for (uint16_t i = 0; i < c.frameCount; i++) {
    if (pos + 5 > framesLen) {
      free(c.mem);
      free(c.offsets);
      Serial.println("LABERR frames don't add up");
      return false;
    }
    c.offsets[i] = pos;
    pos += 5 + rd32(c.frames + pos);
  }
  if (vol != 255) {
    volume = vol / 100.0f;
    kit.setVolume(volume);
  }
  clip = c;
  Serial.printf("LABCLIP ok frames=%u bytes=%lu\n", clip.frameCount, (unsigned long)total);
  clipStart();
  return true;
}
#endif

// Text commands for clips and link settings ("lab …"). Returns true if it was one.
bool labCommand(const String& line) {
  if (line == "lab stop") {
    clipStop();
  } else if (line == "lab play") {
    clipStart();
  } else if (line.startsWith("lab fps ")) {
    float f = line.substring(8).toFloat();
    if (f > 0.1f && f <= 60) {
      // Keep the current frame on screen: restart the clock from it at the new rate.
      uint32_t k = (uint64_t)(millis() - clip.t0) * clip.fpsX100 / 100000;
      clip.fpsX100 = (uint16_t)(f * 100);
      clip.t0 = millis() - (uint32_t)((uint64_t)k * 100000 / clip.fpsX100);
    }
  } else if (line.startsWith("lab mode ")) {
    String m = line.substring(9);
    clip.mode = m == "once" ? 1 : m == "pingpong" ? 2 : 0;
    clipStart();
  } else if (line.startsWith("lab offset ")) {
    clip.audioOffsetMs = line.substring(11).toInt();
    clipStart();
  } else if (line.startsWith("lab vol ")) {
    volume = constrain(line.substring(8).toInt(), 0, 100) / 100.0f;
    kit.setVolume(volume);
  } else if (line.startsWith("lab spi ")) {
    labSpi(line.substring(8).toInt());
  } else {
    return false;
  }
  return true;
}
