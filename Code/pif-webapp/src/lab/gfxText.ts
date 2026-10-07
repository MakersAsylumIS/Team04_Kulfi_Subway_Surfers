// Draws text the way the pet does: Adafruit GFX bitmap fonts (FreeSans, FreeSansBold), one
// pixel at a time, no smoothing. Same measuring as the firmware's textWidth() and the same
// word wrap as pet_screen.h's wrapped(), so layouts carry over unchanged.
import fonts from './gfxFonts.json'

export type FontName = keyof typeof fonts

const cache = new Map<string, Uint8Array>()
function bitmap(name: FontName) {
  let b = cache.get(name)
  if (!b) {
    const hex = fonts[name].bitmap
    b = new Uint8Array(hex.length / 2)
    for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    cache.set(name, b)
  }
  return b
}

function glyph(name: FontName, ch: string) {
  const f = fonts[name]
  const c = ch.charCodeAt(0)
  if (c < f.first || c > f.last) return null
  return f.glyphs[c - f.first] // [bitmapOffset, width, height, xAdvance, xOffset, yOffset]
}

/** Like the firmware's textWidth(): the width of the glyphs' ink, via getTextBounds. */
export function textWidth(name: FontName, text: string) {
  let x = 0
  let minx = Infinity
  let maxx = -Infinity
  for (const ch of text) {
    const g = glyph(name, ch)
    if (!g) continue
    const [, w, , adv, xo] = g
    if (w > 0) {
      minx = Math.min(minx, x + xo)
      maxx = Math.max(maxx, x + xo + w - 1)
    }
    x += adv
  }
  return maxx < minx ? 0 : maxx - minx + 1
}

/** Prints at a baseline, like tft.setCursor(x, baseline); tft.print(text). */
export function drawText(ctx: CanvasRenderingContext2D, name: FontName, text: string, x: number, baseline: number, colour: string) {
  const bits = bitmap(name)
  ctx.fillStyle = colour
  for (const ch of text) {
    const g = glyph(name, ch)
    if (!g) continue
    const [off, w, h, adv, xo, yo] = g
    let bo = off
    let b = 0
    let bit = 0
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        if (!(bit++ & 7)) b = bits[bo++]
        if (b & 0x80) ctx.fillRect(x + xo + xx, baseline + yo + yy, 1, 1)
        b = (b << 1) & 0xff
      }
    x += adv
  }
}

/** Cuts a line to fit, ending in "..." when it had to be cut (firmware fitLine). */
export function fitLine(name: FontName, t: string, maxW: number) {
  if (textWidth(name, t) <= maxW) return t
  while (t.length > 1 && textWidth(name, t + '...') > maxW) t = t.slice(0, -1)
  return t + '...'
}

export function centred(ctx: CanvasRenderingContext2D, name: FontName, t: string, baseline: number, colour: string, screenW: number) {
  const line = fitLine(name, t, screenW - 20)
  drawText(ctx, name, line, Math.floor((screenW - textWidth(name, line)) / 2), baseline, colour)
}

/** Word wrap into at most maxLines lines from (x, baseline); returns the next baseline. */
export function wrapped(
  ctx: CanvasRenderingContext2D,
  name: FontName,
  text: string,
  x: number,
  baseline: number,
  maxW: number,
  lineH: number,
  maxLines: number,
  colour: string,
  align: 'left' | 'centre' = 'left',
  screenW = 240,
) {
  const words = text.split(' ')
  let i = 0
  let lines = 0
  while (i < words.length && lines < maxLines) {
    let line = words[i]
    let j = i + 1
    while (j < words.length && textWidth(name, `${line} ${words[j]}`) <= maxW) line += ` ${words[j++]}`
    if (lines === maxLines - 1 && j < words.length) line = fitLine(name, [line, ...words.slice(j)].join(' '), maxW)
    else line = fitLine(name, line, maxW)
    const lx = align === 'centre' ? Math.floor((screenW - textWidth(name, line)) / 2) : x
    drawText(ctx, name, line, lx, baseline, colour)
    baseline += lineH
    lines++
    i = j
  }
  return baseline
}
