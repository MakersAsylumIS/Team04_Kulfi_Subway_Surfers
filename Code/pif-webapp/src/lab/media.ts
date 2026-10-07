// Loading and preparing media for the pet screen lab (/lab). Everything becomes a list of
// canvases ("frames") at the source's own size; placement and colour happen at draw time.
import { crane } from './optionalAssets'
import faces from '../pet/faces.json'

export type Frames = HTMLCanvasElement[]

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** The crane flight sprite (crane.json), if it's here; see optionalAssets.ts. */
export function craneFrames(): Frames {
  if (!crane) return []
  const sprite = crane
  const rowBytes = Math.ceil(sprite.width / 2)
  const pal = sprite.palette.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)))
  return sprite.frames.map((hex) => {
    const bytes = hex.match(/../g)!.map((b) => parseInt(b, 16))
    const c = canvas(sprite.width, sprite.height)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(sprite.width, sprite.height)
    for (let y = 0; y < sprite.height; y++)
      for (let x = 0; x < sprite.width; x++) {
        const v = bytes[y * rowBytes + (x >> 1)]
        const idx = x & 1 ? v & 15 : v >> 4
        const o = (y * sprite.width + x) * 4
        const [r, g, b] = pal[idx]
        img.data.set([r, g, b, idx ? 255 : 0], o) // index 0 = background: transparent here
      }
    ctx.putImageData(img, 0, 0)
    return c
  })
}

export const MOODS = Object.keys(faces.moods) as (keyof typeof faces.moods)[]

/** One of the pet's face animations (faces.json), lit pixels in the pet's cyan. */
export function faceFrames(mood: keyof typeof faces.moods): Frames {
  return faces.moods[mood].map((runs) => {
    const c = canvas(faces.width, faces.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#00f0d8'
    let i = 0
    for (let y = 0; y < faces.height; y++) {
      let x = 0
      let lit = false
      while (x < faces.width) {
        const len = runs[i++]
        if (lit && len) ctx.fillRect(x, y, len, 1)
        x += len
        lit = !lit
      }
    }
    return c
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Couldn't load ${src}`))
    img.src = src
  })
}

/** One picture per file, in the order given (name them 1.png, 2.png … for an animation). */
export async function imageFrames(files: File[]): Promise<Frames> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const out: Frames = []
  for (const f of sorted) {
    const url = URL.createObjectURL(f)
    const img = await loadImage(url)
    URL.revokeObjectURL(url)
    const c = canvas(img.naturalWidth, img.naturalHeight)
    c.getContext('2d')!.drawImage(img, 0, 0)
    out.push(c)
  }
  return out
}

/** Cuts a sprite sheet into an even grid, read row by row. */
export function sheetFrames(sheet: HTMLCanvasElement, cols: number, rows: number, count: number): Frames {
  const fw = Math.floor(sheet.width / cols)
  const fh = Math.floor(sheet.height / rows)
  const out: Frames = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (out.length >= count) break
      const f = canvas(fw, fh)
      f.getContext('2d')!.drawImage(sheet, c * fw, r * fh, fw, fh, 0, 0, fw, fh)
      out.push(f)
    }
  return out
}

/** Samples a video at `fps` (the browser decodes it; the pet would get these stills). */
export async function videoFrames(url: string, fps: number, maxFrames = 240): Promise<Frames> {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error("Couldn't read that video"))
  })
  const out: Frames = []
  for (let t = 0; t < v.duration && out.length < maxFrames; t += 1 / fps) {
    v.currentTime = t
    await new Promise<void>((resolve) => (v.onseeked = () => resolve()))
    const c = canvas(v.videoWidth, v.videoHeight)
    c.getContext('2d')!.drawImage(v, 0, 0)
    out.push(c)
  }
  return out
}

/**
 * Makes near-white reachable from the edges transparent, like scripts/convert-crane.mjs, so a
 * drawing on a white page sits on the pet's black screen without a white box around it.
 */
export function removeWhite(frames: Frames, threshold = 245): Frames {
  return frames.map((src) => {
    const w = src.width
    const h = src.height
    const c = canvas(w, h)
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    const bg = new Uint8Array(w * h)
    const stack: number[] = []
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
    while (stack.length) {
      const i = stack.pop()!
      if (bg[i] || Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) <= threshold) continue
      bg[i] = 1
      const x = i % w
      if (x > 0) stack.push(i - 1)
      if (x < w - 1) stack.push(i + 1)
      if (i >= w) stack.push(i - w)
      if (i < w * (h - 1)) stack.push(i + w)
    }
    for (let i = 0; i < w * h; i++) if (bg[i]) d[i * 4 + 3] = 0
    ctx.putImageData(img, 0, 0)
    return c
  })
}

/** A 16-colour palette for a set of frames (k-means on a sample), with black and white kept. */
export function palette16(frames: Frames): number[][] {
  const samples: number[][] = []
  const step = Math.max(1, Math.floor(frames.length / 12))
  for (let f = 0; f < frames.length; f += step) {
    const c = frames[f]
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const stride = Math.max(1, Math.floor((c.width * c.height) / 4000))
    for (let i = 0; i < c.width * c.height; i += stride)
      if (d[i * 4 + 3] > 128) samples.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]])
  }
  if (!samples.length) return [[0, 0, 0], [255, 255, 255]]
  let centres = Array.from({ length: 14 }, (_, k) => samples[Math.floor(((k + 0.5) * samples.length) / 14)])
  for (let it = 0; it < 10; it++) {
    const sum = centres.map(() => [0, 0, 0, 0])
    for (const p of samples) {
      const s = sum[nearest(p, centres)]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    }
    centres = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[k]))
  }
  return [[0, 0, 0], [255, 255, 255], ...centres.map((c) => c.map(Math.round))]
}

export function nearest(p: number[], cs: number[][]) {
  let best = 0
  let bd = Infinity
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
    if (d < bd) {
      bd = d
      best = k
    }
  }
  return best
}
