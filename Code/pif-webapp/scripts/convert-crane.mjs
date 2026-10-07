// Converts the crane flight sprite sheet (assets/pet-boot/crane-sheet.png, nine frames in a
// 3x3 grid on white) into the pet's startup animation, once, for both sides:
//   firmware/pet_story_player/crane.h   (C arrays in flash, for the ESP32)
//   src/pet/crane.json                  (the same frames, for the pet screen in /debug)
//
// Usage:  node scripts/convert-crane.mjs assets/pet-boot/crane-sheet.png
// Needs ffmpeg (set FFMPEG=path\to\ffmpeg.exe if it isn't on PATH) to decode the PNG.
//
// How: the white background is flood-filled away from the sheet's edges; the nine biggest
// shapes left are the birds (the hand-written frame numbers are much smaller), read in rows
// top to bottom, left to right. Each bird is lined up on its red crown, so the head holds
// still and the wings flap. Colours are reduced to a 16-colour palette (index 0 = black,
// the screen's background) and stored two pixels per byte.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const sheet = process.argv[2]
if (!sheet) {
  console.error('usage: node scripts/convert-crane.mjs <sprite sheet PNG>')
  process.exit(1)
}
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const FRAMES = 9
const COLOURS = 16

// ---- Decode
const [W, H] = execFileSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'), [
  '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sheet,
]).toString().trim().split(',').map(Number)
const rgb = execFileSync(ffmpeg, ['-v', 'error', '-i', sheet, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
  maxBuffer: 1 << 27,
})
const at = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]

// ---- Background: near-white reachable from the edges
const bg = new Uint8Array(W * H)
const stack = []
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
while (stack.length) {
  const i = stack.pop()
  if (bg[i] || Math.min(...at(i)) <= 245) continue
  bg[i] = 1
  const x = i % W, y = (i / W) | 0
  if (x > 0) stack.push(i - 1)
  if (x < W - 1) stack.push(i + 1)
  if (y > 0) stack.push(i - W)
  if (y < H - 1) stack.push(i + W)
}

// The drawing's edges are blended into the white page, which shows as a pale fringe on the
// pet's black screen. Peel off two layers of light pixels that touch the background.
for (let pass = 0; pass < 2; pass++) {
  const peel = []
  for (let i = 0; i < W * H; i++) {
    if (bg[i] || Math.min(...at(i)) < 200) continue
    const x = i % W, y = (i / W) | 0
    if ((x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W])) peel.push(i)
  }
  for (const i of peel) bg[i] = 1
}

// ---- Shapes (8-connected); keep the nine biggest
const label = new Int32Array(W * H)
const shapes = []
for (let s = 0; s < W * H; s++) {
  if (bg[s] || label[s]) continue
  const id = shapes.length + 1
  const pixels = []
  const st = [s]
  while (st.length) {
    const i = st.pop()
    if (bg[i] || label[i]) continue
    label[i] = id
    pixels.push(i)
    const x = i % W, y = (i / W) | 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = y + dy
        if (a >= 0 && b >= 0 && a < W && b < H) st.push(b * W + a)
      }
  }
  shapes.push({ id, pixels })
}
shapes.sort((a, b) => b.pixels.length - a.pixels.length)
const isRed = ([r, g, b]) => r > g + 25 && r > b + 25
// A head can come out as its own small shape when the neck line is faint. Give each small
// shape with red in it back to the nearest big one.
const big = shapes.slice(0, FRAMES)
const centre = (s) => {
  let x = 0, y = 0
  for (const i of s.pixels) { x += i % W; y += (i / W) | 0 }
  return [x / s.pixels.length, y / s.pixels.length]
}
for (const s of shapes.slice(FRAMES)) {
  if (!s.pixels.some((i) => isRed(at(i)))) continue
  const [sx, sy] = centre(s)
  let best = big[0], bd = Infinity
  for (const b of big) {
    const d = Math.min(...b.pixels.map((i) => ((i % W) - sx) ** 2 + (((i / W) | 0) - sy) ** 2))
    if (d < bd) { bd = d; best = b }
  }
  if (bd < 30 ** 2) best.pixels.push(...s.pixels)
}
const birds = big.map((s) => {
  let x0 = W, y0 = H, x1 = 0, y1 = 0, rx = 0, ry = 0, rn = 0
  for (const i of s.pixels) {
    const x = i % W, y = (i / W) | 0
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    const [r, g, b] = at(i)
    if (isRed([r, g, b])) { rx += x; ry += y; rn++ }
  }
  if (!rn) throw new Error(`A bird without a red crown at ${x0},${y0}: can't line it up`)
  return { ...s, box: [x0, y0, x1, y1], crown: [Math.round(rx / rn), Math.round(ry / rn)] }
})
if (shapes[FRAMES] && shapes[FRAMES].pixels.length > birds[FRAMES - 1].pixels.length / 3)
  throw new Error('More than nine big shapes: is this the right sheet?')

// Reading order: rows by the centre of each bird's box, then left to right.
const cy = (b) => (b.box[1] + b.box[3]) / 2
birds.sort((a, b) => cy(a) - cy(b))
for (let r = 0; r < 3; r++) {
  const row = birds.slice(r * 3, r * 3 + 3).sort((a, b) => a.box[0] - b.box[0])
  birds.splice(r * 3, 3, ...row)
}

// ---- One canvas for every frame, each bird placed so its crown lands on the same point
let left = 0, top = 0, right = 0, bottom = 0
for (const b of birds) {
  left = Math.max(left, b.crown[0] - b.box[0])
  right = Math.max(right, b.box[2] - b.crown[0])
  top = Math.max(top, b.crown[1] - b.box[1])
  bottom = Math.max(bottom, b.box[3] - b.crown[1])
}
const FW = left + right + 1
const FH = top + bottom + 1

// ---- Palette: k-means over every bird pixel, black kept as index 0
const samples = birds.flatMap((b) => b.pixels.map(at))
let centres = Array.from({ length: COLOURS - 1 }, (_, k) => samples[Math.floor(((k + 0.5) * samples.length) / (COLOURS - 1))])
const nearest = (p, cs) => {
  let best = 0, bd = Infinity
  cs.forEach((c, k) => {
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
    if (d < bd) { bd = d; best = k }
  })
  return best
}
for (let it = 0; it < 12; it++) {
  const sum = centres.map(() => [0, 0, 0, 0])
  for (const p of samples) {
    const s = sum[nearest(p, centres)]
    s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++
  }
  centres = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[k]))
}
// The crown is only a few pixels, too few to win a palette slot of its own, so the last
// slot is given to it: the average of every red pixel.
// Most crown pixels are blended with the outline, so take the reddest third of them.
const redness = ([r, g, b]) => r - Math.max(g, b)
const reds = samples.filter(isRed).sort((a, b) => redness(b) - redness(a))
const crown = reds.slice(0, Math.max(1, Math.ceil(reds.length / 3)))
centres[centres.length - 1] = [0, 1, 2].map((k) => crown.reduce((s, p) => s + p[k], 0) / crown.length)
const palette = [[0, 0, 0], ...centres.map((c) => c.map(Math.round))]
const rgb565 = ([r, g, b]) => ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3)

// ---- Frames: palette indices, FW x FH, 0 = background
const frames = birds.map((b) => {
  const idx = new Uint8Array(FW * FH)
  const ox = left - b.crown[0], oy = top - b.crown[1]
  for (const i of b.pixels) {
    const x = (i % W) + ox, y = ((i / W) | 0) + oy
    idx[y * FW + x] = 1 + nearest(at(i), centres)
  }
  return idx
})
const packed = frames.map((idx) => {
  const rowBytes = Math.ceil(FW / 2)
  const out = new Uint8Array(rowBytes * FH)
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) out[y * rowBytes + (x >> 1)] |= idx[y * FW + x] << (x & 1 ? 0 : 4)
  return out
})

// ---- Firmware header
const hex = (bytes) => {
  const lines = []
  for (let i = 0; i < bytes.length; i += 24) lines.push('  ' + Array.from(bytes.slice(i, i + 24), (v) => `0x${v.toString(16).padStart(2, '0')}`).join(', '))
  return lines.join(',\n')
}
let h = `// Generated by scripts/convert-crane.mjs from assets/pet-boot/crane-sheet.png. Don't edit.
// The pet's startup animation: a crane in flight, ${FRAMES} frames of ${FW}x${FH}, lined up on the
// crane's crown. Pixels are palette indices, 2 per byte (high nibble first), 0 = background.
#pragma once
#include <Arduino.h>

#define CRANE_W ${FW}
#define CRANE_H ${FH}
#define CRANE_FRAMES ${FRAMES}
#define CRANE_ROW_BYTES ${Math.ceil(FW / 2)}

const uint16_t CRANE_PALETTE[${COLOURS}] = { ${palette.map((c) => `0x${rgb565(c).toString(16).padStart(4, '0')}`).join(', ')} };

`
packed.forEach((p, k) => (h += `const uint8_t CRANE_FRAME_${k + 1}[] PROGMEM = {\n${hex(p)}\n};\n`))
h += `\nconst uint8_t* const CRANE_FRAME_LIST[CRANE_FRAMES] = { ${packed.map((_, k) => `CRANE_FRAME_${k + 1}`).join(', ')} };\n`
writeFileSync('firmware/pet_story_player/crane.h', h)

// ---- Browser copy: same palette (as CSS colours) and frames (hex strings of the packed bytes)
writeFileSync(
  'src/pet/crane.json',
  JSON.stringify({
    width: FW,
    height: FH,
    palette: palette.map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
    frames: packed.map((p) => Buffer.from(p).toString('hex')),
  }),
)
console.log(`${FRAMES} frames of ${FW}x${FH}, ${packed[0].length} bytes each -> crane.h, crane.json`)
