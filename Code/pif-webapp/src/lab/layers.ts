// Layers: your own pictures and text placed on top of any screen in the lab, moved by
// dragging on the preview (or the arrow keys). A picture layer can hold several frames, which
// play as an animation. Text uses the pet's own fonts, so it looks on the pet as it does here.
import { type FontName, drawText, textWidth } from './gfxText'
import fonts from './gfxFonts.json'
import type { Frames } from './media'

export const FONT_NAMES = Object.keys(fonts) as FontName[]

interface Base {
  id: number
  name: string
  x: number
  y: number
  visible: boolean
}
export interface ImageLayer extends Base {
  kind: 'image'
  frames: Frames
  scalePct: number
}
export interface TextLayer extends Base {
  kind: 'text'
  text: string
  font: FontName
  colour: string
  centre: boolean // centred across the screen (x is ignored)
}
export type Layer = ImageLayer | TextLayer

let nextId = 1
export const newId = () => nextId++

/** The layer's box on the screen, for drawing the selection and for hit tests. */
export function bounds(l: Layer, W: number) {
  if (l.kind === 'image') {
    const f = l.frames[0]
    return { x: l.x, y: l.y, w: Math.round((f.width * l.scalePct) / 100), h: Math.round((f.height * l.scalePct) / 100) }
  }
  const w = textWidth(l.font, l.text)
  const size = fonts[l.font].yAdvance
  const x = l.centre ? Math.floor((W - w) / 2) : l.x
  // y is the baseline, as on the pet; the box spans roughly one line above it.
  return { x, y: l.y - Math.round(size * 0.72), w, h: Math.round(size * 0.95) }
}

export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], tick: number, smooth: boolean) {
  const W = ctx.canvas.width
  for (const l of layers) {
    if (!l.visible) continue
    if (l.kind === 'image') {
      const f = l.frames[tick % l.frames.length]
      const b = bounds(l, W)
      ctx.imageSmoothingEnabled = smooth
      ctx.drawImage(f, b.x, b.y, b.w, b.h)
    } else {
      const b = bounds(l, W)
      drawText(ctx, l.font, l.text, b.x, l.y, l.colour)
    }
  }
}

/** The topmost visible layer under a screen point. */
export function hitTest(layers: Layer[], x: number, y: number, W: number) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (!l.visible) continue
    const b = bounds(l, W)
    if (x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 3 && y <= b.y + b.h + 3) return l
  }
  return null
}
