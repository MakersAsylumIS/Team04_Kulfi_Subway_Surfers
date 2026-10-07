// Packs a run of lab screens (and optional sound) into a clip for the pet to keep in PSRAM
// and play itself. Format: firmware/pet_story_player/pet_lab.h. Only the part of the screen
// that ever changes is stored per frame; the rest goes once, as the base screen.

export type ClipFormat = 'rgb565' | 'pal256' | 'pal64' | 'pal16'
export type ClipMode = 'loop' | 'once' | 'pingpong'

export interface ClipAudio {
  pcm: Int16Array
  rate: number
  offsetMs: number
}

export interface ClipStats {
  frames: number
  region: { x: number; y: number; w: number; h: number }
  baseBytes: number
  frameBytes: number
  audioBytes: number
  totalBytes: number
  paletteSize: number
}

const MODES: Record<ClipMode, number> = { loop: 0, once: 1, pingpong: 2 }

class Bytes {
  private buf = new Uint8Array(1 << 16)
  length = 0
  private grow(n: number) {
    if (this.length + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.length + n) size *= 2
    const b = new Uint8Array(size)
    b.set(this.buf.subarray(0, this.length))
    this.buf = b
  }
  u8(v: number) {
    this.grow(1)
    this.buf[this.length++] = v & 0xff
  }
  u16(v: number) {
    this.u8(v)
    this.u8(v >> 8)
  }
  u32(v: number) {
    this.u16(v & 0xffff)
    this.u16((v >>> 16) & 0xffff)
  }
  bytes(b: Uint8Array) {
    this.grow(b.length)
    this.buf.set(b, this.length)
    this.length += b.length
  }
  done() {
    return this.buf.slice(0, this.length)
  }
}

function runs565(px: ArrayLike<number>, out: Bytes) {
  for (let i = 0; i < px.length; ) {
    const c = px[i]
    let n = 1
    while (n < 255 && i + n < px.length && px[i + n] === c) n++
    out.u8(n)
    out.u16(c)
    i += n
  }
}

/** Median cut over the colours actually used (weighted by how often), to `size` colours. */
function medianCut(counts: Map<number, number>, size: number): number[] {
  type Box = { colours: [number, number, number, number][] } // r, g, b, count
  const unpack = (c: number): [number, number, number] => [(c >> 11) & 31, (c >> 5) & 63, c & 31]
  const all = [...counts].map(([c, n]) => [...unpack(c), n] as [number, number, number, number])
  let boxes: Box[] = [{ colours: all }]
  while (boxes.length < size) {
    // Split the box with the widest spread (scaled to 0-63 per channel).
    let best = -1
    let bestRange = 0
    let bestCh = 0
    boxes.forEach((b, i) => {
      if (b.colours.length < 2) return
      for (let ch = 0; ch < 3; ch++) {
        const k = ch === 1 ? 1 : 2
        let lo = Infinity
        let hi = -Infinity
        for (const c of b.colours) {
          lo = Math.min(lo, c[ch] * k)
          hi = Math.max(hi, c[ch] * k)
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo
          best = i
          bestCh = ch
        }
      }
    })
    if (best < 0) break
    const b = boxes[best]
    b.colours.sort((x, y) => x[bestCh] - y[bestCh])
    const total = b.colours.reduce((s, c) => s + c[3], 0)
    let acc = 0
    let cut = 1
    for (let i = 0; i < b.colours.length - 1; i++) {
      acc += b.colours[i][3]
      if (acc >= total / 2) {
        cut = i + 1
        break
      }
    }
    boxes = [...boxes.slice(0, best), { colours: b.colours.slice(0, cut) }, { colours: b.colours.slice(cut) }, ...boxes.slice(best + 1)]
  }
  return boxes.map((b) => {
    const n = b.colours.reduce((s, c) => s + c[3], 0) || 1
    const r = Math.round(b.colours.reduce((s, c) => s + c[0] * c[3], 0) / n)
    const g = Math.round(b.colours.reduce((s, c) => s + c[1] * c[3], 0) / n)
    const bl = Math.round(b.colours.reduce((s, c) => s + c[2] * c[3], 0) / n)
    return (r << 11) | (g << 5) | bl
  })
}

function nearestIndex(c: number, palette: number[]) {
  const r = (c >> 11) & 31
  const g = (c >> 5) & 63
  const b = c & 31
  let best = 0
  let bd = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const dr = (((p >> 11) & 31) - r) * 2
    const dg = ((p >> 5) & 63) - g
    const db = ((p & 31) - b) * 2
    const d = dr * dr + dg * dg + db * db
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

/**
 * screens: every frame of the clip as whole RGB565 screens (W x H), in order.
 * rotation: the pet's setRotation() for this orientation.
 */
export function buildClip(
  screens: Uint16Array[],
  W: number,
  H: number,
  rotation: number,
  opts: { format: ClipFormat; fps: number; mode: ClipMode; volume: number | null; audio: ClipAudio | null },
): { bytes: Uint8Array; stats: ClipStats } {
  const base = screens[0]
  // The part that ever changes.
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let f = 1; f < screens.length; f++) {
    const s = screens[f]
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (s[y * W + x] !== base[y * W + x]) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
  }
  const moving = x1 >= 0
  const region = moving ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: 0, h: 0 }
  const frameScreens = moving ? screens : []
  const cut = (s: Uint16Array) => {
    const out = new Uint16Array(region.w * region.h)
    for (let y = 0; y < region.h; y++) out.set(s.subarray((region.y + y) * W + region.x, (region.y + y) * W + region.x + region.w), y * region.w)
    return out
  }

  // Palette, if indexed.
  const palSize = opts.format === 'pal256' ? 256 : opts.format === 'pal64' ? 64 : opts.format === 'pal16' ? 16 : 0
  let palette: number[] = []
  const lookup = new Map<number, number>()
  const parts = frameScreens.map(cut)
  if (palSize) {
    const counts = new Map<number, number>()
    for (const p of parts) for (let i = 0; i < p.length; i++) counts.set(p[i], (counts.get(p[i]) ?? 0) + 1)
    palette = counts.size <= palSize ? [...counts.keys()] : medianCut(counts, palSize)
    for (const c of counts.keys()) lookup.set(c, nearestIndex(c, palette))
  }

  // Frames
  const frames = new Bytes()
  for (const p of parts) {
    const rec = new Bytes()
    let mode = 0
    if (!palSize) {
      const r = new Bytes()
      runs565(p, r)
      if (r.length < p.length * 2) {
        mode = 1
        rec.bytes(r.done())
      } else for (let i = 0; i < p.length; i++) rec.u16(p[i])
    } else {
      const idx = new Uint8Array(p.length)
      for (let i = 0; i < p.length; i++) idx[i] = lookup.get(p[i])!
      const r = new Bytes()
      for (let i = 0; i < idx.length; ) {
        let n = 1
        while (n < 255 && i + n < idx.length && idx[i + n] === idx[i]) n++
        r.u8(n)
        r.u8(idx[i])
        i += n
      }
      if (r.length < idx.length) {
        mode = 1
        rec.bytes(r.done())
      } else rec.bytes(idx)
    }
    const data = rec.done()
    frames.u32(data.length)
    frames.u8(mode)
    frames.bytes(data)
  }

  const baseBytes = new Bytes()
  runs565(base, baseBytes)
  const audio = opts.audio
  const audioBytes = audio ? new Uint8Array(audio.pcm.buffer, audio.pcm.byteOffset, audio.pcm.byteLength) : new Uint8Array(0)

  const out = new Bytes()
  for (const ch of 'PIFC') out.u8(ch.charCodeAt(0))
  out.u8(1)
  out.u8(rotation)
  out.u8(palSize ? 1 : 0)
  out.u8(MODES[opts.mode])
  out.u16(Math.round(opts.fps * 100))
  out.u16(frameScreens.length)
  out.u16(region.x)
  out.u16(region.y)
  out.u16(region.w)
  out.u16(region.h)
  out.u16(palette.length)
  out.u32(baseBytes.length)
  out.u32(frames.length)
  out.u32(audioBytes.length)
  out.u32(audio?.rate ?? 22050)
  out.u32((audio?.offsetMs ?? 0) | 0)
  out.u8(opts.volume == null ? 255 : opts.volume)
  for (const c of palette) out.u16(c)
  out.bytes(baseBytes.done())
  out.bytes(frames.done())
  out.bytes(audioBytes)
  const bytes = out.done()
  return {
    bytes,
    stats: {
      frames: frameScreens.length,
      region,
      baseBytes: baseBytes.length,
      frameBytes: frames.length,
      audioBytes: audioBytes.length,
      totalBytes: bytes.length,
      paletteSize: palette.length,
    },
  }
}

/** What the pet will show for a palette clip, to preview colour loss in the lab. */
export function quantise(screen: Uint16Array, palette: number[]) {
  const cache = new Map<number, number>()
  return screen.map((c) => {
    let v = cache.get(c)
    if (v === undefined) cache.set(c, (v = palette[nearestIndex(c, palette)]))
    return v
  })
}
